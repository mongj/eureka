import { readFile as fsReadFile } from "node:fs/promises";
import { Type } from "@eureka/ai";
import type { AgentTool, AgentToolResult } from "@eureka/agent";
import { createLogger } from "@eureka/utils/logger";
import { lintManimCode } from "../lint.js";
import { extractSceneName } from "../render.js";
import { renderManimScene } from "../render.js";
import { RenderError, RenderTimeoutError, type ManimQuality } from "../types.js";

const log = createLogger("Tools");

const renderSchema = Type.Object({
	path: Type.String({ description: "Relative path to the .py scene file to render (e.g., 'scene.py')" }),
});

export interface RenderToolConfig {
	quality: ManimQuality;
	timeoutMs: number;
	maxAttempts: number;
	signal?: AbortSignal;
}

export interface RenderToolDetails {
	videoPath: string;
	sceneName: string;
	attempt: number;
}

export function createRenderTool(
	resolveSafe: (p: string) => string,
	workDir: string,
	config: RenderToolConfig,
): AgentTool<typeof renderSchema> {
	let attempts = 0;

	return {
		name: "render_video",
		label: "Render Video",
		description:
			"Render a Manim scene file into an MP4 video. Call this after writing your scene file. If rendering fails, read the error, fix your code, and try again.",
		parameters: renderSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<RenderToolDetails>> => {
			attempts++;
			log.info(`render_video: attempt ${attempts}/${config.maxAttempts} for ${params.path}`);

			if (attempts > config.maxAttempts) {
				return {
					content: [
						{
							type: "text",
							text: `Maximum render attempts (${config.maxAttempts}) exceeded. The render has failed ${config.maxAttempts} times. Stop retrying.`,
						},
					],
					details: { videoPath: "", sceneName: "", attempt: attempts },
				};
			}

			const fullPath = resolveSafe(params.path);

			// Read the scene file
			let code: string;
			try {
				code = (await fsReadFile(fullPath)).toString("utf-8");
			} catch {
				return {
					content: [
						{
							type: "text",
							text: `File not found: ${params.path}. Write the scene file first, then call render_video.`,
						},
					],
					details: { videoPath: "", sceneName: "", attempt: attempts },
				};
			}

			// Extract scene name
			let sceneName = extractSceneName(code);
			if (!sceneName) {
				return {
					content: [
						{
							type: "text",
							text: `No Scene subclass found in ${params.path}. Ensure your class extends Scene (e.g., "class MyScene(Scene):").`,
						},
					],
					details: { videoPath: "", sceneName: "", attempt: attempts },
				};
			}

			// Lint check — catch static errors before expensive render.
			// Lint failures count toward maxAttempts (same counter as render failures).
			// This is intentional: keeps the mental model simple and prevents infinite loops.
			const lintResult = await lintManimCode(fullPath, workDir);

			if (lintResult.autofixApplied) {
				// Re-read file after autofix modified it in-place
				code = (await fsReadFile(fullPath)).toString("utf-8");
				const newSceneName = extractSceneName(code);
				if (newSceneName) {
					sceneName = newSceneName;
				}
				log.info(`render_video: autofix applied ${lintResult.autofixCount} change(s)`);
			}

			if (!lintResult.passed) {
				const violationLines = lintResult.violations
					.map((v) => `  line ${v.line}: [${v.rule}] ${v.message}`)
					.join("\n");
				return {
					content: [
						{
							type: "text",
							text: `Lint check failed with ${lintResult.violations.length} error(s):\n${violationLines}\n\nFix these issues in ${params.path} and call render_video again.`,
						},
					],
					details: { videoPath: "", sceneName, attempt: attempts },
				};
			}

			// Render
			try {
				const videoPath = await renderManimScene({
					code,
					sceneName,
					quality: config.quality,
					timeoutMs: config.timeoutMs,
					workDir,
					signal: config.signal,
				});

				log.info(`render_video: success — ${videoPath}`);
				return {
					content: [{ type: "text", text: `Successfully rendered video: ${videoPath}` }],
					details: { videoPath, sceneName, attempt: attempts },
				};
			} catch (error) {
				// Let abort errors propagate — the agent loop handles cancellation
				if (error instanceof DOMException && error.name === "AbortError") {
					throw error;
				}

				if (error instanceof RenderTimeoutError) {
					log.warn(`render_video: timeout after ${config.timeoutMs}ms (attempt ${attempts}/${config.maxAttempts})`);
					return {
						content: [
							{
								type: "text",
								text: `Render timed out after ${config.timeoutMs}ms. Try simplifying your animation (fewer objects, shorter duration) and render again.`,
							},
						],
						details: { videoPath: "", sceneName, attempt: attempts },
					};
				}

				if (error instanceof RenderError) {
					log.warn(`render_video: failed (attempt ${attempts}/${config.maxAttempts})`);
					const stderrSnippet = error.stderr ? `\n\nmanim stderr:\n${error.stderr}` : "";
					return {
						content: [
							{
								type: "text",
								text: `Render failed: ${error.message}${stderrSnippet}\n\nRead the error above, fix the code in ${params.path}, and call render_video again.`,
							},
						],
						details: { videoPath: "", sceneName, attempt: attempts },
					};
				}

				// Unexpected error — still return as tool error so agent can see it
				const msg = error instanceof Error ? error.message : String(error);
				log.error(`render_video: unexpected error — ${msg}`);
				return {
					content: [{ type: "text", text: `Unexpected render error: ${msg}` }],
					details: { videoPath: "", sceneName, attempt: attempts },
				};
			}
		},
	};
}
