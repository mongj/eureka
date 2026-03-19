import { describe, it, expect } from "vitest";
import { MANIM_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT } from "../src/prompts.js";

describe("prompt loading", () => {
	it("loads MANIM_SYSTEM_PROMPT from file with expected content", () => {
		expect(MANIM_SYSTEM_PROMPT).toContain("expert Manim animator");
		expect(MANIM_SYSTEM_PROMPT).toContain("<rules>");
		expect(MANIM_SYSTEM_PROMPT).toContain("<style_guidelines>");
	});

	it("loads AGENT_SYSTEM_PROMPT as composition of base + workflow", () => {
		expect(AGENT_SYSTEM_PROMPT).toContain("expert Manim animator");
		expect(AGENT_SYSTEM_PROMPT).toContain("<workflow>");
		expect(AGENT_SYSTEM_PROMPT).toContain("<output_requirements>");
	});

	it("MANIM_SYSTEM_PROMPT does not contain workflow sections", () => {
		expect(MANIM_SYSTEM_PROMPT).not.toContain("<workflow>");
		expect(MANIM_SYSTEM_PROMPT).not.toContain("<output_requirements>");
	});
});
