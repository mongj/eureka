import { spawn } from "node:child_process";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@eureka/utils/logger";
import { RenderError, RenderTimeoutError, type RenderOptions, type ManimQuality } from "./types.js";

const log = createLogger("Render");

const QUALITY_FLAGS: Record<ManimQuality, string> = {
	low: "-ql",
	medium: "-qm",
	high: "-qh",
	fourk: "-qk",
};

/**
 * Patterns in stderr that indicate manim has hit a fatal error.
 * When detected, we kill the process immediately instead of waiting
 * for it to exit (manim can hang after printing a traceback).
 */
const ERROR_PATTERNS = [
	"Traceback (most recent call last)",
	"Error:",
	"TypeError:",
	"NameError:",
	"AttributeError:",
	"ValueError:",
	"ImportError:",
	"ModuleNotFoundError:",
	"SyntaxError:",
	"IndentationError:",
	"KeyError:",
	"IndexError:",
	"ZeroDivisionError:",
	"RuntimeError:",
	"FileNotFoundError:",
	"sys.exit(",
];

/**
 * Extract the first Scene subclass name from Manim Python code.
 * Matches: class Foo(Scene):, class Foo(ThreeDScene):, class Foo(MovingCameraScene):, etc.
 */
export function extractSceneName(code: string): string | null {
	const match = code.match(/class\s+(\w+)\s*\(\s*\w*Scene\s*\)/);
	return match ? match[1] : null;
}

/**
 * Locate the rendered output file after a successful manim render.
 *
 * Video mode: media/videos/scene/<quality_dir>/<SceneName>.mp4
 * Image mode (-s): media/images/scene/<SceneName>*.png
 *   (manim appends a version suffix, e.g. TestScene_ManimCE_v0.20.1.png)
 */
export async function findRenderOutput(mediaDir: string, sceneName: string, saveLastFrame: boolean): Promise<string> {
	if (saveLastFrame) {
		const imagesDir = join(mediaDir, "images", "scene");
		let files: string[];
		try {
			files = await readdir(imagesDir);
		} catch {
			throw new RenderError("No images output directory found after render", "", "");
		}
		const png = files.find((f) => f.startsWith(sceneName) && f.endsWith(".png"));
		if (!png) {
			throw new RenderError(`No PNG output found for scene "${sceneName}" in ${imagesDir}`, "", "");
		}
		return join(imagesDir, png);
	}

	// Video mode
	const videosDir = join(mediaDir, "videos", "scene");
	let qualityDirs: string[];
	try {
		qualityDirs = await readdir(videosDir);
	} catch {
		throw new RenderError("No output directory found after render", "", "");
	}
	if (qualityDirs.length === 0) {
		throw new RenderError("No output directory found after render", "", "");
	}
	const outputDir = join(videosDir, qualityDirs[0]);
	return join(outputDir, `${sceneName}.mp4`);
}

/**
 * Render Manim Python code into a video file or static image.
 *
 * Writes the code to a temp file, spawns `manim render`, and streams
 * stderr to detect errors early. If an error pattern is detected in
 * stderr, the process is killed immediately (manim can hang after errors).
 */
export async function renderManimScene(options: RenderOptions): Promise<string> {
	const { code, sceneName, quality, timeoutMs, workDir, saveLastFrame, signal } = options;

	// Write the scene file
	const sceneFile = join(workDir, "scene.py");
	await mkdir(workDir, { recursive: true });
	await writeFile(sceneFile, code, "utf-8");

	// Build the manim command
	const qualityFlag = QUALITY_FLAGS[quality];
	const mediaDir = join(workDir, "media");
	const args = ["render", qualityFlag, "--media_dir", mediaDir];
	if (saveLastFrame) {
		args.push("-s");
	}
	args.push(sceneFile, sceneName);

	log.info(`Rendering: manim ${args.join(" ")}`);

	const { stderr } = await new Promise<{ stderr: string }>((resolve, reject) => {
		let settled = false;
		let stderrChunks: string[] = [];
		let killedByError = false;
		let killedByTimeout = false;

		const proc = spawn("manim", args, { stdio: ["ignore", "pipe", "pipe"] });

		// Timeout handling
		const timer = setTimeout(() => {
			if (!settled) {
				killedByTimeout = true;
				proc.kill("SIGKILL");
			}
		}, timeoutMs);

		// AbortSignal handling
		if (signal) {
			const onAbort = () => {
				if (!settled) {
					proc.kill("SIGKILL");
				}
			};
			signal.addEventListener("abort", onAbort, { once: true });
			proc.on("close", () => signal.removeEventListener("abort", onAbort));
		}

		// Stream stderr — collect for error reporting and detect error patterns to kill early
		proc.stderr?.on("data", (chunk: Buffer) => {
			const text = chunk.toString("utf-8");
			stderrChunks.push(text);

			if (!killedByError && ERROR_PATTERNS.some((pattern) => text.includes(pattern))) {
				killedByError = true;
				log.warn("Detected error in manim output, killing process");
				proc.kill("SIGKILL");
			}
		});

		// Collect stdout (manim logs progress here too)
		proc.stdout?.on("data", () => {
			// Discard stdout — we only care about stderr for errors
		});

		proc.on("close", async (exitCode) => {
			clearTimeout(timer);
			if (settled) return;
			settled = true;

			const stderr = stderrChunks.join("");

			if (killedByTimeout) {
				reject(new RenderTimeoutError(timeoutMs));
				return;
			}

			if (killedByError || (exitCode !== null && exitCode !== 0)) {
				reject(new RenderError(`Manim render failed (exit code ${exitCode})`, code, stderr));
				return;
			}

			resolve({ stderr });
		});

		proc.on("error", (err) => {
			clearTimeout(timer);
			if (settled) return;
			settled = true;
			reject(new RenderError(`Failed to spawn manim: ${err.message}`, code, ""));
		});
	});

	// Locate the output file using the extracted helper
	try {
		return await findRenderOutput(mediaDir, sceneName, !!saveLastFrame);
	} catch (fsError) {
		throw new RenderError(`Could not locate output: ${(fsError as Error).message}`, code, stderr);
	}
}
