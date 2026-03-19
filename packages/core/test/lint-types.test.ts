import { describe, it, expect } from "vitest";
import { LintError } from "../src/types.js";

describe("LintError", () => {
	it("stores violations and formats a message", () => {
		const violations = [
			{ rule: "SceneStructure", line: 3, col: 0, message: "Missing construct method" },
			{ rule: "ManimImport", line: 1, col: 0, message: "Missing manim import" },
		];
		const error = new LintError(violations);

		expect(error.name).toBe("LintError");
		expect(error.violations).toEqual(violations);
		expect(error.message).toContain("2 lint violation");
	});

	it("handles empty violations array", () => {
		const error = new LintError([]);
		expect(error.violations).toEqual([]);
		expect(error.message).toContain("0 lint violation");
	});
});
