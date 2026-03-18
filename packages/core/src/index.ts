import { rm } from "node:fs/promises";
import { createLogger } from "@eureka/utils/logger";
import { checkAllDependencies } from "./dependencies.js";
import { generateManimCode } from "./generate.js";
import { renderManimScene } from "./render.js";
import { type GenerateOptions, type GenerateResult } from "./types.js";

const log = createLogger("Core");

/**
 * Generate an educational math video from a natural language prompt.
 *
 * Pipeline: prompt → Agent generates Manim code (writes scene.py to /tmp) → render to MP4 video.
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

	// Generate code via agent — writes scene.py to a temp dir
	const genStart = Date.now();
	const { code, sceneName, workDir } = await generateManimCode(prompt, { model: options.model, signal });
	const generateDurationMs = Date.now() - genStart;

	// Use the agent's workDir for rendering (scene.py is already there)
	const renderWorkDir = options.tmpDir ?? workDir;

	try {
		// Render
		const renderStart = Date.now();
		const videoPath = await renderManimScene({
			code,
			sceneName,
			quality,
			timeoutMs: renderTimeoutMs,
			workDir: renderWorkDir,
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
		if (!keepArtifacts) {
			await rm(workDir, { recursive: true, force: true }).catch(() => {
				log.warn(`Failed to clean up temp dir: ${workDir}`);
			});
		}
	}
}

// Re-export types and utilities for consumers
export { configure, getConfig } from "./config.js";
export type { CoreConfig, ModelTask } from "./config.js";
export { checkAllDependencies, checkFfmpegInstalled, checkManimInstalled } from "./dependencies.js";
export { MANIM_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT } from "./prompts.js";
export { extractSceneName, renderManimScene } from "./render.js";
export { createScopedTools } from "./tools/index.js";
export {
	DependencyError,
	EurekaError,
	InvalidModelError,
	InvalidPromptError,
	ManimNotFoundError,
	NoCodeGeneratedError,
	RenderError,
	RenderTimeoutError,
} from "./types.js";
export type { GenerateOptions, GenerateResult, ManimQuality, RenderOptions } from "./types.js";
