import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a prompt text file from the prompts/ directory.
 * Files are loaded eagerly at module init — a missing or empty file
 * means a broken build/package and should fail immediately.
 */
function loadPromptFile(name: string): string {
	const filePath = join(__dirname, "prompts", name);
	const content = readFileSync(filePath, "utf-8").trim();
	if (!content) {
		throw new Error(`Prompt file is empty: ${name}`);
	}
	return content;
}

// Load all prompt parts eagerly at module init
const manimBase = loadPromptFile("manim-base.txt");
const agentWorkflow = loadPromptFile("agent-workflow.txt");

/** Base Manim system prompt — rules and style guidelines. */
export const MANIM_SYSTEM_PROMPT = manimBase;

/** Full agent system prompt — base + workflow + output requirements. */
export const AGENT_SYSTEM_PROMPT = `${manimBase}\n\n${agentWorkflow}`;
