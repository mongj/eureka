import { getModel, complete } from "@eureka/ai";
import { MANIM_SYSTEM_PROMPT } from "./prompts.js";
import { InvalidPromptError, InvalidModelError, NoCodeGeneratedError, type GenerateOptions } from "./types.js";

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

/**
 * Default model: Claude Sonnet via Anthropic provider.
 */
function getDefaultModel() {
	return getModel("anthropic", "claude-sonnet-4" as any);
}

/**
 * Generate Manim Python code from a natural language prompt using an LLM.
 *
 * Uses complete() directly (single LLM call, no agent loop) since we don't
 * need tool calling for code generation.
 */
export async function generateManimCode(
	prompt: string,
	options?: Pick<GenerateOptions, "model" | "signal">,
): Promise<{ code: string; rawResponse: string }> {
	if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
		throw new InvalidPromptError();
	}

	let model;
	if (options?.model) {
		const slashIndex = options.model.indexOf("/");
		if (slashIndex === -1) {
			throw new InvalidModelError(
				options.model,
				`Invalid model format: "${options.model}". Expected "provider/model-id" (e.g., "anthropic/claude-sonnet-4").`,
			);
		}
		const provider = options.model.slice(0, slashIndex);
		const modelId = options.model.slice(slashIndex + 1);
		try {
			model = getModel(provider as any, modelId as any);
		} catch (e) {
			throw new InvalidModelError(options.model, `Unknown model "${options.model}": ${(e as Error).message}`);
		}
	} else {
		model = getDefaultModel();
	}

	const result = await complete(model, {
		systemPrompt: MANIM_SYSTEM_PROMPT,
		messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
	});

	// Extract the text content from the AssistantMessage response
	const rawResponse = result.content
		.filter((c) => c.type === "text")
		.map((c) => ("text" in c ? c.text : ""))
		.join("\n");

	console.log("[eureka] Generated code:\n", rawResponse);

	const code = extractManimCode(rawResponse);
	if (!code) {
		throw new NoCodeGeneratedError(rawResponse);
	}

	return { code, rawResponse };
}
