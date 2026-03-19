import { rm } from "node:fs/promises";
import { createLogger } from "@eureka/utils/logger";
import { checkAllDependencies } from "./dependencies.js";
import { generateManimCode } from "./generate.js";
import { type GenerateOptions, type GenerateResult } from "./types.js";

const log = createLogger("Core");

/**
 * Generate an educational math video from a natural language prompt.
 *
 * Pipeline: prompt → Agent generates Manim code → agent renders to MP4 → self-corrects on failure.
 *
 * @example
 * ```ts
 * import { generateVideo } from "@eureka/core";
 *
 * const result = await generateVideo("Show the Pythagorean theorem visually");
 * console.log(result.outputPath); // /tmp/eureka-xxxx/media/videos/scene/480p15/PythagoreanTheorem.mp4
 * console.log(result.code);      // from manim import * ...
 * ```
 */
export async function generateVideo(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
	const { quality = "low", renderTimeoutMs = 120_000, maxRenderAttempts = 3, keepArtifacts = false, signal } = options;

	// Check dependencies first
	await checkAllDependencies();

	// Generate code and render via agent — the agent writes scene.py, calls render_video,
	// and self-corrects on render failures up to maxRenderAttempts.
	const start = Date.now();
	const { code, sceneName, workDir, outputPath } = await generateManimCode(prompt, {
		model: options.model,
		signal,
		mode: options.mode,
		render: {
			quality,
			timeoutMs: renderTimeoutMs,
			maxAttempts: maxRenderAttempts,
		},
	});
	const durationMs = Date.now() - start;

	try {
		const result: GenerateResult = {
			outputPath,
			code,
			sceneName,
			durationMs,
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
export { MANIM_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT, SNIPPET_SYSTEM_PROMPT, SNIPPET_PLANNER_PROMPT } from "./prompts.js";
export { extractSceneName, findRenderOutput, renderManimScene } from "./render.js";
export { createScopedTools } from "./tools/index.js";
export type { RenderToolConfig, RenderToolDetails } from "./tools/render.js";
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
