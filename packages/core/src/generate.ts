import type { AgentEvent } from "@eureka/agent";
import { Agent } from "@eureka/agent";
import { completeSimple, resolveModelFromString } from "@eureka/ai";
import { createLogger } from "@eureka/utils/logger";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.js";
import {
	AGENT_SYSTEM_PROMPT,
	IMAGE_PLANNER_PROMPT,
	IMAGE_SYSTEM_PROMPT,
	SNIPPET_PLANNER_PROMPT,
	SNIPPET_SYSTEM_PROMPT,
} from "./prompts.js";
import { extractSceneName } from "./render.js";
import { createScopedTools } from "./tools/index.js";
import type { RenderToolConfig } from "./tools/render.js";
import { EurekaError, InvalidPromptError, NoCodeGeneratedError, type ManimQuality } from "./types.js";

const log = createLogger("Generate");

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get the absolute path to the agent workspace template directory.
 */
export function getWorkspaceTemplatePath(): string {
	// TODO: Upload this template bundle to a CDN on merges to main, then fetch it when
	// provisioning new sandboxes instead of shipping the folder inside dist.
	return join(__dirname, "agent-workspace-template");
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

interface PlanSnippetOptions {
	signal?: AbortSignal;
}

/**
 * Run the snippet planner: takes a user prompt, returns a structured animation overview.
 * Uses a non-agent LLM call (no tools) with the SNIPPET_PLANNER_PROMPT.
 */
export async function planSnippet(prompt: string, options?: PlanSnippetOptions): Promise<string> {
	const config = getConfig();
	const model = resolveModelFromString(config.models["plan-snippet"]);

	log.info("Planning snippet animation...");

	const response = await completeSimple(
		model,
		{
			systemPrompt: SNIPPET_PLANNER_PROMPT,
			messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
		},
		{ signal: options?.signal },
	);

	const text = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();

	if (!text) {
		throw new EurekaError("Snippet planner produced empty output");
	}

	log.debug("Planner output:\n" + text);

	return text;
}

/**
 * Run the image planner: takes a user prompt, returns a structured image description.
 * Uses a non-agent LLM call (no tools) with the IMAGE_PLANNER_PROMPT.
 */
export async function planImage(prompt: string, options?: PlanSnippetOptions): Promise<string> {
	const config = getConfig();
	const model = resolveModelFromString(config.models["plan-image"]);

	log.info("Planning image composition...");

	const response = await completeSimple(
		model,
		{
			systemPrompt: IMAGE_PLANNER_PROMPT,
			messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
		},
		{ signal: options?.signal },
	);

	const text = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();

	if (!text) {
		throw new EurekaError("Image planner produced empty output");
	}

	log.debug("Image planner output:\n" + text);

	return text;
}

export interface GenerateOptions {
	model?: string;
	signal?: AbortSignal;
	render?: {
		quality: ManimQuality;
		timeoutMs: number;
		maxAttempts: number;
	};
	mode?: "default" | "snippet" | "image";
	title?: string;
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
	/** Absolute path to the rendered output (only present when render config was provided and succeeded) */
	outputPath?: string;
}

/**
 * Generate Manim Python code from a natural language prompt using an Agent.
 *
 * The agent has file tools scoped to a temp directory in /tmp.
 * It writes the generated scene.py file using the write_file tool.
 * Returns the path to the written file.
 */
export async function generateManimCode(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
	if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
		throw new InvalidPromptError();
	}

	// Load config
	const config = getConfig();
	const model = resolveModelFromString(config.models.generate);

	// Build render tool config if rendering is requested
	let renderToolConfig: RenderToolConfig | undefined;
	if (options?.render) {
		renderToolConfig = {
			quality: options.render.quality,
			timeoutMs: options.render.timeoutMs,
			maxAttempts: options.render.maxAttempts,
			signal: options?.signal,
		};
	}

	// Create a scoped working directory for this generation
	const workDir = await mkdtemp(join(tmpdir(), "eureka-gen-"));
	try {
		await copyWorkspaceTemplate(workDir);
		const tools = createScopedTools(workDir, renderToolConfig ? { render: renderToolConfig } : undefined);

		// Determine system prompt and user message based on mode
		const mode = options?.mode ?? "default";
		let systemPrompt: string;
		let agentUserMessage: string;

		if (mode === "image") {
			const plannerOutput = await planImage(prompt, { signal: options?.signal });
			systemPrompt = IMAGE_SYSTEM_PROMPT;
			const titleInstruction = options?.title
				? `\n\nTitle: "${options.title}" — render this as a Text() element at the top of the frame.`
				: "";
			agentUserMessage = `<image_plan>\n${plannerOutput}\n</image_plan>\n\nOriginal request: ${prompt}${titleInstruction}`;
		} else if (mode === "snippet") {
			const plannerOutput = await planSnippet(prompt, { signal: options?.signal });
			systemPrompt = SNIPPET_SYSTEM_PROMPT;
			agentUserMessage = `<animation_plan>\n${plannerOutput}\n</animation_plan>\n\nOriginal request: ${prompt}`;
		} else {
			systemPrompt = AGENT_SYSTEM_PROMPT;
			agentUserMessage = prompt;
		}

		const agent = new Agent({
			initialState: {
				systemPrompt,
				model,
				tools,
			},
		});

		// Track the file path written by the agent via tool execution events
		let writtenPath: string | null = null;
		let outputPath: string | null = null;

		agent.subscribe((event: AgentEvent) => {
			if (event.type === "tool_execution_end" && !event.isError) {
				const details = event.result?.details;
				if (event.toolName === "write_file" && details?.path) {
					writtenPath = details.path;
				}
				if (event.toolName === "render" && details?.outputPath) {
					outputPath = details.outputPath;
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
		await agent.prompt(agentUserMessage);
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
		const writtenCode = await readFile(writtenPath, "utf-8");

		log.info("Agent wrote scene to: " + writtenPath);

		const sceneName = extractSceneName(writtenCode);
		if (!sceneName) {
			throw new NoCodeGeneratedError(writtenCode);
		}

		const result: GenerateResult = {
			scenePath: writtenPath,
			code: writtenCode,
			sceneName,
			workDir,
		};

		if (outputPath) {
			result.outputPath = outputPath;
		}

		return result;
	} catch (error) {
		await rm(workDir, { recursive: true, force: true }).catch(() => {
			log.warn(`Failed to clean up temp dir after generation error: ${workDir}`);
		});
		throw error;
	}
}
