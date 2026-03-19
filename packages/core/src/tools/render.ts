import type { AgentTool, AgentToolResult } from "@eureka/agent";
import { Type } from "@eureka/ai";
import { createLogger } from "@eureka/utils/logger";
import { readFile as fsReadFile } from "node:fs/promises";
import { lintManimCode } from "../lint.js";
import { extractSceneName, renderManimScene } from "../render.js";
import { RenderError, RenderTimeoutError, type ManimQuality } from "../types.js";

const log = createLogger("Tools");

const renderSchema = Type.Object({
	path: Type.String({ description: "Relative path to the .py scene file to render (e.g., 'scene.py')" }),
	output: Type.Optional(
		Type.Union([Type.Literal("video"), Type.Literal("image")], {
			description: "Output format: 'video' for MP4 (default), 'image' for PNG (last frame only)",
		}),
	),
});

export interface RenderToolConfig {
	quality: ManimQuality;
	timeoutMs: number;
	maxAttempts: number;
	signal?: AbortSignal;
}

export interface RenderToolDetails {
	outputPath: string;
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
		name: "render",
		label: "Render",
		description:
			"Render a Manim scene file. Outputs MP4 video by default, or PNG image (last frame) when output is 'image'. Call this after writing your scene file. If rendering fails, read the error, fix your code, and try again.",
		parameters: renderSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<RenderToolDetails>> => {
			attempts++;
			const saveLastFrame = params.output === "image";
			log.info(
				`render: attempt ${attempts}/${config.maxAttempts} for ${params.path} (output: ${params.output ?? "video"})`,
			);

			if (attempts > config.maxAttempts) {
				return {
					content: [
						{
							type: "text",
							text: `Maximum render attempts (${config.maxAttempts}) exceeded. The render has failed ${config.maxAttempts} times. Stop retrying.`,
						},
					],
					details: { outputPath: "", sceneName: "", attempt: attempts },
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
							text: `File not found: ${params.path}. Write the scene file first, then call render.`,
						},
					],
					details: { outputPath: "", sceneName: "", attempt: attempts },
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
					details: { outputPath: "", sceneName: "", attempt: attempts },
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
					details: { outputPath: "", sceneName, attempt: attempts },
				};
			}

			// Render
			try {
				const outputPath = await renderManimScene({
					code,
					sceneName,
					quality: config.quality,
					timeoutMs: config.timeoutMs,
					workDir,
					saveLastFrame,
					signal: config.signal,
				});

				log.info(`render: success — ${outputPath}`);
				return {
					content: [
						{ type: "text", text: `Successfully rendered ${saveLastFrame ? "image" : "video"}: ${outputPath}` },
					],
					details: { outputPath, sceneName, attempt: attempts },
				};
			} catch (error) {
				// Let abort errors propagate — the agent loop handles cancellation
				if (error instanceof DOMException && error.name === "AbortError") {
					throw error;
				}

				if (error instanceof RenderTimeoutError) {
					log.warn(`render: timeout after ${config.timeoutMs}ms (attempt ${attempts}/${config.maxAttempts})`);
					return {
						content: [
							{
								type: "text",
								text: `Render timed out after ${config.timeoutMs}ms. Try simplifying your scene (fewer objects, shorter duration) and render again.`,
							},
						],
						details: { outputPath: "", sceneName, attempt: attempts },
					};
				}

				if (error instanceof RenderError) {
					log.warn(`render: failed (attempt ${attempts}/${config.maxAttempts})`);
					const stderrSnippet = error.stderr ? `\n\nmanim stderr:\n${error.stderr}` : "";
					return {
						content: [
							{
								type: "text",
								text: `Render failed: ${error.message}${stderrSnippet}\n\nRead the error above, fix the code in ${params.path}, and call render again.`,
							},
						],
						details: { outputPath: "", sceneName, attempt: attempts },
					};
				}

				// Unexpected error — still return as tool error so agent can see it
				const msg = error instanceof Error ? error.message : String(error);
				log.error(`render: unexpected error — ${msg}`);
				return {
					content: [{ type: "text", text: `Unexpected render error: ${msg}` }],
					details: { outputPath: "", sceneName, attempt: attempts },
				};
			}
		},
	};
}
