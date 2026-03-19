import { describe, it, expect } from "vitest";
import { parseLintOutput } from "../src/lint.js";

describe("parseLintOutput", () => {
	it("parses a single violation line", () => {
		const output = "scene.py@3:0 SceneStructure: Missing construct method\n🛠️  1 file checked, 1 file with errors 🛠️";
		const violations = parseLintOutput(output);

		expect(violations).toHaveLength(1);
		expect(violations[0]).toEqual({
			rule: "SceneStructure",
			line: 3,
			col: 0,
			message: "Missing construct method",
			hasAutofix: false,
		});
	});

	it("parses a violation with autofix marker", () => {
		const output = "scene.py@1:0 ManimImport: Missing manim import (has autofix)\n🛠️  1 file checked 🛠️";
		const violations = parseLintOutput(output);

		expect(violations).toHaveLength(1);
		expect(violations[0]).toEqual({
			rule: "ManimImport",
			line: 1,
			col: 0,
			message: "Missing manim import",
			hasAutofix: true,
		});
	});

	it("parses multiple violation lines", () => {
		const output = [
			"scene.py@1:0 ManimImport: Missing import (has autofix)",
			"scene.py@5:4 EmptyScene: No self.play() calls found",
			"🛠️  1 file checked, 1 file with errors 🛠️",
		].join("\n");
		const violations = parseLintOutput(output);
		expect(violations).toHaveLength(2);
	});

	it("returns empty array for clean output", () => {
		const output = "🧼 1 file clean 🧼";
		const violations = parseLintOutput(output);
		expect(violations).toHaveLength(0);
	});

	it("returns empty array for empty string", () => {
		expect(parseLintOutput("")).toHaveLength(0);
	});

	it("handles EXCEPTION lines (syntax errors) as a single violation", () => {
		const output = "scene.py: EXCEPTION: Syntax Error @ 2:1.\nparser error: error at 2:10\n🛠️  1 file checked 🛠️";
		const violations = parseLintOutput(output);

		expect(violations).toHaveLength(1);
		expect(violations[0].rule).toBe("SyntaxError");
		expect(violations[0].line).toBe(2);
	});
});
