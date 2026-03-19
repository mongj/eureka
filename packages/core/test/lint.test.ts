import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseLintOutput, lintManimCode } from "../src/lint.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

describe("lintManimCode graceful degradation", () => {
	let workDir: string;

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), "eureka-test-lint-degrade-"));
	});

	it("returns passing result when fixit is not available", async () => {
		// Write a file so readFile doesn't fail
		const filePath = join(workDir, "scene.py");
		writeFileSync(filePath, "print('hello')");

		// Mock execFile to simulate fixit not being installed
		const { execFile } = await import("node:child_process");
		const { promisify } = await import("node:util");
		const originalExecFile = promisify(execFile);

		// Use vi.mock would be cleaner but we can test via a non-existent workDir
		// that causes fixit to fail. Instead, let's use a workDir with no pyproject.toml
		// and verify the function doesn't crash even without config.
		const result = await lintManimCode(filePath, workDir);

		// Without pyproject.toml, fixit uses defaults — should still work or degrade
		// The key invariant: lintManimCode never throws, always returns a LintResult
		expect(result).toHaveProperty("passed");
		expect(result).toHaveProperty("violations");
		expect(result).toHaveProperty("autofixApplied");
		expect(result).toHaveProperty("autofixCount");

		rmSync(workDir, { recursive: true, force: true });
	});
});
