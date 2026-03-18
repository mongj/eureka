import type { AgentEvent } from "@eureka/agent";
import { Agent } from "@eureka/agent";
import { resolveModelFromString } from "@eureka/ai";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.js";
import { AGENT_SYSTEM_PROMPT } from "./prompts.js";
import { createScopedTools } from "./tools.js";
import { createLogger } from "@eureka/utils/logger";
import { InvalidPromptError, NoCodeGeneratedError, type GenerateOptions } from "./types.js";

const log = createLogger("Generate");

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get the absolute path to the agent workspace template directory.
 */
export function getWorkspaceTemplatePath(): string {
	return join(dirname(__dirname), "agent-workspace-template");
}

/**
 * Copy the workspace template into the agent's working directory.
 * Uses { force: false, errorOnExist: false } to skip existing files without error.
 */
export async function copyWorkspaceTemplate(workDir: string): Promise<void> {
	const templatePath = getWorkspaceTemplatePath();
	await cp(templatePath, workDir, { recursive: true, force: false, errorOnExist: false });
	log.info("Copied workspace template to: " + workDir);
}

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
		await copyWorkspaceTemplate(workDir);
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
					log.debug("Agent response: " + texts.substring(0, 200));
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
			throw new NoCodeGeneratedError("Agent did not write any file");
		}

		// Read back the written file to get the code
		const { readFile } = await import("node:fs/promises");
		writtenCode = await readFile(writtenPath, "utf-8");

		log.info("Agent wrote scene to: " + writtenPath);
		log.debug("Generated code:\n" + writtenCode);

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
			log.warn(`Failed to clean up temp dir after generation error: ${workDir}`);
		});
		throw error;
	}
}
