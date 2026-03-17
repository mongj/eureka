import type { AgentEvent } from "@eureka/agent";
import { Agent } from "@eureka/agent";
import { resolveModelFromString } from "@eureka/ai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfig } from "./config.js";
import { MANIM_SYSTEM_PROMPT } from "./prompts.js";
import { createScopedTools } from "./tools.js";
import { InvalidPromptError, NoCodeGeneratedError, type GenerateOptions } from "./types.js";

/**
 * Extract Manim Python code from an LLM response.
 *
 * Tries in order:
 * 1. First ```python ... ``` block
 * 2. First ``` ... ``` block (untagged)
 * 3. Raw response if it contains "from manim import"
 * 4. null if nothing found
 */
export function extractManimCode(response: string): string | null {
	// Try python-tagged code block first
	const pythonBlock = response.match(/```python\s*\n([\s\S]*?)```/);
	if (pythonBlock) return pythonBlock[1].trim();

	// Try untagged code block
	const plainBlock = response.match(/```\s*\n([\s\S]*?)```/);
	if (plainBlock) return plainBlock[1].trim();

	// Try raw response (LLM sometimes omits the code fence)
	if (response.includes("from manim import")) {
		return response.trim();
	}

	return null;
}

const AGENT_SYSTEM_PROMPT = `${MANIM_SYSTEM_PROMPT}

## Important Instructions

You have access to file tools. You MUST use the write_file tool to write your manim scene code to a file named "scene.py" in the working directory. Do NOT just respond with code in a message — you must write it to the file using the tool.

After writing the file, confirm what you wrote by briefly describing the animation.`;

export interface GenerateResult {
	/** Absolute path to the generated .py file */
	scenePath: string;
	/** The generated Manim Python code */
	code: string;
	/** Name of the Scene class */
	sceneName: string;
	/** Path to the working directory containing the scene file */
	workDir: string;
}

/**
 * Generate Manim Python code from a natural language prompt using an Agent.
 *
 * The agent has file tools scoped to a temp directory in /tmp.
 * It writes the generated scene.py file using the write_file tool.
 * Returns the path to the written file.
 */
export async function generateManimCode(
	prompt: string,
	options?: Pick<GenerateOptions, "model" | "signal">,
): Promise<GenerateResult> {
	if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
		throw new InvalidPromptError();
	}

	// Load config
	const config = getConfig();
	const model = resolveModelFromString(config.models.generate);

	// Create a scoped working directory for this generation
	const workDir = await mkdtemp(join(tmpdir(), "eureka-gen-"));
	try {
		const tools = createScopedTools(workDir);

		const agent = new Agent({
			initialState: {
				systemPrompt: AGENT_SYSTEM_PROMPT,
				model,
				tools,
			},
		});

		// Track the file path written by the agent via tool execution events
		let writtenPath: string | null = null;
		let writtenCode: string | null = null;

		agent.subscribe((event: AgentEvent) => {
			if (event.type === "tool_execution_end" && event.toolName === "write_file" && !event.isError) {
				const details = event.result?.details;
				if (details?.path) {
					writtenPath = details.path;
				}
			}
			// Log assistant messages for debugging
			if (event.type === "message_end" && event.message.role === "assistant") {
				const texts = (event.message as any).content
					?.filter((c: any) => c.type === "text")
					?.map((c: any) => c.text)
					?.join("\n");
				if (texts) {
					console.log("[eureka] Agent response:", texts.substring(0, 200));
				}
			}
		});

		// Run the agent
		await agent.prompt(prompt);
		await agent.waitForIdle();

		// Check if agent errored
		if (agent.state.error) {
			throw new NoCodeGeneratedError(agent.state.error);
		}

		// The agent should have written a scene.py file via write_file tool
		if (!writtenPath) {
			// Fallback: try to extract code from the agent's text response
			const messages = agent.state.messages;
			const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
			if (lastAssistant && "content" in lastAssistant) {
				const text = (lastAssistant as any).content
					?.filter((c: any) => c.type === "text")
					?.map((c: any) => c.text)
					?.join("\n");
				if (text) {
					const extracted = extractManimCode(text);
					if (extracted) {
						// Agent didn't use the tool — write it ourselves
						const { writeFile } = await import("node:fs/promises");
						const scenePath = join(workDir, "scene.py");
						await writeFile(scenePath, extracted, "utf-8");
						console.log("[eureka] Agent did not use write_file tool, extracted code from response");

						const { extractSceneName } = await import("./render.js");
						const sceneName = extractSceneName(extracted);
						if (!sceneName) throw new NoCodeGeneratedError(extracted);

						return { scenePath, code: extracted, sceneName, workDir };
					}
				}
			}
			throw new NoCodeGeneratedError("Agent did not write any file");
		}

		// Read back the written file to get the code
		const { readFile } = await import("node:fs/promises");
		writtenCode = await readFile(writtenPath, "utf-8");

		console.log("[eureka] Agent wrote scene to:", writtenPath);
		console.log("[eureka] Generated code:\n", writtenCode);

		const { extractSceneName } = await import("./render.js");
		const sceneName = extractSceneName(writtenCode);
		if (!sceneName) {
			throw new NoCodeGeneratedError(writtenCode);
		}

		return {
			scenePath: writtenPath,
			code: writtenCode,
			sceneName,
			workDir,
		};
	} catch (error) {
		await rm(workDir, { recursive: true, force: true }).catch(() => {
			console.warn(`[eureka] Failed to clean up temp dir after generation error: ${workDir}`);
		});
		throw error;
	}
}
