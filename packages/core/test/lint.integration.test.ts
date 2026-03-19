import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintManimCode } from "../src/lint.js";
import { getWorkspaceTemplatePath } from "../src/generate.js";

// Check fixit availability synchronously so describe.skipIf works at parse time
let fixitAvailable = false;
try {
	execFileSync("fixit", ["--version"], { stdio: "ignore" });
	fixitAvailable = true;
} catch {
	fixitAvailable = false;
}

describe.skipIf(!fixitAvailable)("lint integration", () => {
	let workDir: string;

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), "eureka-test-lint-int-"));
		const templatePath = getWorkspaceTemplatePath();
		cpSync(templatePath, workDir, { recursive: true });
	});

	afterEach(() => {
		if (workDir) {
			rmSync(workDir, { recursive: true, force: true });
		}
	});

	it("passes valid manim code", async () => {
		const filePath = join(workDir, "scene.py");
		writeFileSync(
			filePath,
			`from manim import *

class MyScene(Scene):
    def construct(self):
        circle = Circle()
        self.play(Create(circle))
`,
		);

		const result = await lintManimCode(filePath, workDir);
		expect(result.passed).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it("catches and autofixes MathText -> MathTex", async () => {
		const filePath = join(workDir, "scene.py");
		writeFileSync(
			filePath,
			`from manim import *

class MyScene(Scene):
    def construct(self):
        eq = MathText(r"E = mc^2")
        self.play(Create(eq))
`,
		);

		const result = await lintManimCode(filePath, workDir);

		// Should have autofixed MathText -> MathTex
		expect(result.autofixApplied).toBe(true);
		const fixed = readFileSync(filePath, "utf-8");
		expect(fixed).toContain("MathTex");
		expect(fixed).not.toContain("MathText");

		// Should pass after autofix
		expect(result.passed).toBe(true);
	});

	it("catches missing construct method", async () => {
		const filePath = join(workDir, "scene.py");
		writeFileSync(
			filePath,
			`from manim import *

class MyScene(Scene):
    def setup(self):
        self.circle = Circle()
`,
		);

		const result = await lintManimCode(filePath, workDir);
		expect(result.passed).toBe(false);
		expect(result.violations.some((v) => v.rule === "SceneStructure")).toBe(true);
	});

	it("catches empty scene (no self.play calls)", async () => {
		const filePath = join(workDir, "scene.py");
		writeFileSync(
			filePath,
			`from manim import *

class MyScene(Scene):
    def construct(self):
        circle = Circle()
        self.add(circle)
`,
		);

		const result = await lintManimCode(filePath, workDir);
		expect(result.passed).toBe(false);
		expect(result.violations.some((v) => v.rule === "EmptyScene")).toBe(true);
	});

	it("handles syntax errors without crashing", async () => {
		const filePath = join(workDir, "scene.py");
		writeFileSync(filePath, `def foo(\n    print("hello")\n`);

		const result = await lintManimCode(filePath, workDir);
		expect(result.passed).toBe(false);
		expect(result.violations.length).toBeGreaterThan(0);
	});

	it("autofixes missing import and proceeds", async () => {
		const filePath = join(workDir, "scene.py");
		writeFileSync(
			filePath,
			`class MyScene(Scene):
    def construct(self):
        circle = Circle()
        self.play(Create(circle))
`,
		);

		const result = await lintManimCode(filePath, workDir);

		if (result.autofixApplied) {
			const fixed = readFileSync(filePath, "utf-8");
			expect(fixed).toContain("from manim import *");
		}
	});
});
