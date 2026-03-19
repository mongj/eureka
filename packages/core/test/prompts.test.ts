import { describe, it, expect } from "vitest";
import {
	MANIM_SYSTEM_PROMPT,
	AGENT_SYSTEM_PROMPT,
	SNIPPET_SYSTEM_PROMPT,
	SNIPPET_PLANNER_PROMPT,
	IMAGE_PLANNER_PROMPT,
	IMAGE_SYSTEM_PROMPT,
} from "../src/prompts.js";

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

describe("snippet prompts", () => {
	it("loads SNIPPET_PLANNER_PROMPT with expected structure", () => {
		expect(SNIPPET_PLANNER_PROMPT).toContain("animation planner");
		expect(SNIPPET_PLANNER_PROMPT).toContain("<objects>");
		expect(SNIPPET_PLANNER_PROMPT).toContain("<layout>");
		expect(SNIPPET_PLANNER_PROMPT).toContain("<animations>");
		expect(SNIPPET_PLANNER_PROMPT).toContain("<timing>");
	});

	it("loads SNIPPET_SYSTEM_PROMPT as composition of base + snippet mode + workflow", () => {
		expect(SNIPPET_SYSTEM_PROMPT).toContain("expert Manim animator");
		expect(SNIPPET_SYSTEM_PROMPT).toContain("<snippet_mode>");
		expect(SNIPPET_SYSTEM_PROMPT).toContain("<workflow>");
	});

	it("SNIPPET_SYSTEM_PROMPT contains snippet duration guidance", () => {
		expect(SNIPPET_SYSTEM_PROMPT).toContain("under 10 seconds");
	});
});

describe("image prompts", () => {
	it("loads IMAGE_PLANNER_PROMPT with expected structure", () => {
		expect(IMAGE_PLANNER_PROMPT).toContain("image planner");
		expect(IMAGE_PLANNER_PROMPT).toContain("<objects>");
		expect(IMAGE_PLANNER_PROMPT).toContain("<layout>");
		expect(IMAGE_PLANNER_PROMPT).toContain("<style>");
	});

	it("loads IMAGE_SYSTEM_PROMPT as composition of base + image mode + workflow", () => {
		expect(IMAGE_SYSTEM_PROMPT).toContain("expert Manim animator");
		expect(IMAGE_SYSTEM_PROMPT).toContain("<image_mode>");
		expect(IMAGE_SYSTEM_PROMPT).toContain("<workflow>");
	});

	it("IMAGE_SYSTEM_PROMPT contains static image guidance", () => {
		expect(IMAGE_SYSTEM_PROMPT).toContain("STATIC IMAGE");
		expect(IMAGE_SYSTEM_PROMPT).toContain("self.add()");
	});
});
