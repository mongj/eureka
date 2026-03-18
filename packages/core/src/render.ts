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
 * Render Manim Python code into a video file.
 *
 * Writes the code to a temp file, spawns `manim render`, and streams
 * stderr to detect errors early. If an error pattern is detected in
 * stderr, the process is killed immediately (manim can hang after errors).
 */
export async function renderManimScene(options: RenderOptions): Promise<string> {
	const { code, sceneName, quality, timeoutMs, workDir, signal } = options;

	// Write the scene file
	const sceneFile = join(workDir, "scene.py");
	await mkdir(workDir, { recursive: true });
	await writeFile(sceneFile, code, "utf-8");

	// Build the manim command
	const qualityFlag = QUALITY_FLAGS[quality];
	const mediaDir = join(workDir, "media");
	const args = ["render", qualityFlag, "--media_dir", mediaDir, sceneFile, sceneName];

	log.info(`Rendering: manim ${args.join(" ")}`);

	const videoPath = await new Promise<string>((resolve, reject) => {
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

			// Find the output video file
			// Manim outputs to: media/videos/scene/<quality_dir>/<SceneName>.mp4
			try {
				const videosDir = join(mediaDir, "videos", "scene");
				const qualityDirs = await readdir(videosDir);
				if (qualityDirs.length === 0) {
					reject(new RenderError("No output directory found after render", code, stderr));
					return;
				}
				const outputDir = join(videosDir, qualityDirs[0]);
				const mp4Path = join(outputDir, `${sceneName}.mp4`);
				resolve(mp4Path);
			} catch (fsError) {
				reject(new RenderError(`Could not locate output video: ${(fsError as Error).message}`, code, stderr));
			}
		});

		proc.on("error", (err) => {
			clearTimeout(timer);
			if (settled) return;
			settled = true;
			reject(new RenderError(`Failed to spawn manim: ${err.message}`, code, ""));
		});
	});

	return videoPath;
}
