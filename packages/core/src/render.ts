import { execFile } from "node:child_process";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { RenderError, RenderTimeoutError, type RenderOptions, type ManimQuality } from "./types.js";

const QUALITY_FLAGS: Record<ManimQuality, string> = {
	low: "-ql",
	medium: "-qm",
	high: "-qh",
	fourk: "-qk",
};

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
 * Writes the code to a temp file, spawns `manim render`, and returns
 * the path to the output video.
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

	console.log(`[eureka] Rendering: manim ${args.join(" ")}`);

	// Spawn manim
	const videoPath = await new Promise<string>((resolve, reject) => {
		execFile("manim", args, { timeout: timeoutMs, signal }, async (error, _stdout, stderr) => {
			if (error) {
				// Node's execFile sets error.killed=true when the process is killed
				// by timeout (ETIMEDOUT) or by AbortSignal (ABORT_ERR).
				if (error.killed) {
					reject(new RenderTimeoutError(timeoutMs));
					return;
				}
				reject(new RenderError(`Manim render failed: ${error.message}`, code, stderr || ""));
				return;
			}

			// Find the output video file
			// Manim outputs to: media/videos/scene/<quality_dir>/<SceneName>.mp4
			try {
				const videosDir = join(mediaDir, "videos", "scene");
				const qualityDirs = await readdir(videosDir);
				if (qualityDirs.length === 0) {
					reject(new RenderError("No output directory found after render", code, stderr || ""));
					return;
				}
				const outputDir = join(videosDir, qualityDirs[0]);
				const mp4Path = join(outputDir, `${sceneName}.mp4`);
				resolve(mp4Path);
			} catch (fsError) {
				reject(new RenderError(`Could not locate output video: ${(fsError as Error).message}`, code, stderr || ""));
			}
		});
	});

	return videoPath;
}
