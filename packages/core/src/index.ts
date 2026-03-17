import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateManimCode } from "./generate.js";
import { renderManimScene, extractSceneName } from "./render.js";
import { checkAllDependencies } from "./dependencies.js";
import { NoCodeGeneratedError, type GenerateOptions, type GenerateResult } from "./types.js";

/**
 * Generate an educational math video from a natural language prompt.
 *
 * Pipeline: prompt → LLM generates Manim code → render to MP4 video.
 *
 * @example
 * ```ts
 * import { generateVideo } from "@eureka/core";
 *
 * const result = await generateVideo("Show the Pythagorean theorem visually");
 * console.log(result.videoPath); // /tmp/eureka-xxxx/media/videos/scene/480p15/PythagoreanTheorem.mp4
 * console.log(result.code);      // from manim import * ...
 * ```
 */
export async function generateVideo(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
	const { quality = "low", renderTimeoutMs = 120_000, keepArtifacts = false, signal } = options;

	// Check dependencies first
	await checkAllDependencies();

	// Generate code
	const genStart = Date.now();
	const { code } = await generateManimCode(prompt, { model: options.model, signal });
	const generateDurationMs = Date.now() - genStart;

	// Extract scene name
	const sceneName = extractSceneName(code);
	if (!sceneName) {
		throw new NoCodeGeneratedError(code);
	}

	// Set up temp directory
	const workDir = options.tmpDir ?? (await mkdtemp(join(tmpdir(), "eureka-")));

	try {
		// Render
		const renderStart = Date.now();
		const videoPath = await renderManimScene({
			code,
			sceneName,
			quality,
			timeoutMs: renderTimeoutMs,
			workDir,
			signal,
		});
		const renderDurationMs = Date.now() - renderStart;

		const result: GenerateResult = {
			videoPath,
			code,
			sceneName,
			generateDurationMs,
			renderDurationMs,
		};

		if (keepArtifacts) {
			result.artifactsDir = workDir;
		}

		return result;
	} finally {
		// Clean up temp directory unless caller wants to keep artifacts.
		if (!keepArtifacts) {
			await rm(workDir, { recursive: true, force: true }).catch(() => {
				console.warn(`[eureka] Failed to clean up temp dir: ${workDir}`);
			});
		}
	}
}

// Re-export types and utilities for consumers
export { extractManimCode } from "./generate.js";
export { extractSceneName, renderManimScene } from "./render.js";
export { checkAllDependencies, checkManimInstalled, checkFfmpegInstalled } from "./dependencies.js";
export { MANIM_SYSTEM_PROMPT } from "./prompts.js";
export {
	EurekaError,
	InvalidPromptError,
	InvalidModelError,
	NoCodeGeneratedError,
	ManimNotFoundError,
	DependencyError,
	RenderError,
	RenderTimeoutError,
} from "./types.js";
export type { GenerateOptions, GenerateResult, RenderOptions, ManimQuality } from "./types.js";
