import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { createRenderTool, type RenderToolConfig } from "../src/tools/render.js";
import { createScopedTools } from "../src/tools/index.js";
import { RenderError, RenderTimeoutError } from "../src/types.js";

// Mock renderManimScene to avoid actually spawning manim
vi.mock("../src/render.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/render.js")>();
	return {
		...actual,
		renderManimScene: vi.fn(),
	};
});

import { renderManimScene } from "../src/render.js";
const mockRender = vi.mocked(renderManimScene);

let workDir: string;

function makeResolveSafe(dir: string) {
	return (filePath: string): string => {
		const resolved = resolve(dir, filePath);
		const rel = relative(dir, resolved);
		if (rel.startsWith("..")) {
			throw new Error(`Path "${filePath}" escapes the working directory`);
		}
		return resolved;
	};
}

const defaultConfig: RenderToolConfig = {
	quality: "low",
	timeoutMs: 60_000,
	maxAttempts: 3,
};

const VALID_SCENE = `from manim import *

class MyScene(Scene):
    def construct(self):
        self.play(Create(Circle()))
`;

function getTextOutput(result: any): string {
	return (
		result.content
			?.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n") || ""
	);
}

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "eureka-test-render-"));
	vi.clearAllMocks();
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("createRenderTool", () => {
	it("returns a valid AgentTool shape", () => {
		const tool = createRenderTool(makeResolveSafe(workDir), workDir, defaultConfig);

		expect(tool.name).toBe("render_video");
		expect(tool.label).toBe("Render Video");
		expect(tool.description).toBeTruthy();
		expect(tool.parameters).toBeTruthy();
		expect(typeof tool.execute).toBe("function");
	});
});

describe("render_video", () => {
	it("succeeds and returns videoPath on happy path", async () => {
		writeFileSync(join(workDir, "scene.py"), VALID_SCENE);
		const expectedPath = join(workDir, "media/videos/scene/480p15/MyScene.mp4");
		mockRender.mockResolvedValueOnce(expectedPath);

		const tool = createRenderTool(makeResolveSafe(workDir), workDir, defaultConfig);
		const result = await tool.execute("call-1", { path: "scene.py" });

		expect(getTextOutput(result)).toContain("Successfully rendered");
		expect(result.details.outputPath).toBe(expectedPath);
		expect(result.details.sceneName).toBe("MyScene");
		expect(result.details.attempt).toBe(1);
		expect(mockRender).toHaveBeenCalledWith(
			expect.objectContaining({
				sceneName: "MyScene",
				quality: "low",
				timeoutMs: 60_000,
				workDir,
			}),
		);
	});

	it("returns error when file not found", async () => {
		const tool = createRenderTool(makeResolveSafe(workDir), workDir, defaultConfig);
		const result = await tool.execute("call-1", { path: "missing.py" });

		expect(getTextOutput(result)).toContain("File not found");
		expect(result.details.outputPath).toBe("");
	});

	it("returns error when no Scene subclass found", async () => {
		writeFileSync(join(workDir, "bad.py"), "print('hello')");

		const tool = createRenderTool(makeResolveSafe(workDir), workDir, defaultConfig);
		const result = await tool.execute("call-1", { path: "bad.py" });

		expect(getTextOutput(result)).toContain("No Scene subclass");
		expect(result.details.outputPath).toBe("");
	});

	it("returns error with stderr on RenderError", async () => {
		writeFileSync(join(workDir, "scene.py"), VALID_SCENE);
		mockRender.mockRejectedValueOnce(
			new RenderError("Manim render failed: syntax error", VALID_SCENE, "NameError: name 'foo' is not defined"),
		);

		const tool = createRenderTool(makeResolveSafe(workDir), workDir, defaultConfig);
		const result = await tool.execute("call-1", { path: "scene.py" });

		const output = getTextOutput(result);
		expect(output).toContain("Render failed");
		expect(output).toContain("NameError");
		expect(output).toContain("fix the code");
		expect(result.details.outputPath).toBe("");
		expect(result.details.sceneName).toBe("MyScene");
	});

	it("returns error on RenderTimeoutError", async () => {
		writeFileSync(join(workDir, "scene.py"), VALID_SCENE);
		mockRender.mockRejectedValueOnce(new RenderTimeoutError(60_000));

		const tool = createRenderTool(makeResolveSafe(workDir), workDir, defaultConfig);
		const result = await tool.execute("call-1", { path: "scene.py" });

		expect(getTextOutput(result)).toContain("timed out");
		expect(result.details.outputPath).toBe("");
	});

	it("succeeds on retry after first failure", async () => {
		writeFileSync(join(workDir, "scene.py"), VALID_SCENE);
		const expectedPath = join(workDir, "media/videos/scene/480p15/MyScene.mp4");

		mockRender.mockRejectedValueOnce(new RenderError("syntax error", VALID_SCENE, "SyntaxError"));
		mockRender.mockResolvedValueOnce(expectedPath);

		const tool = createRenderTool(makeResolveSafe(workDir), workDir, defaultConfig);

		// First attempt — fails
		const result1 = await tool.execute("call-1", { path: "scene.py" });
		expect(getTextOutput(result1)).toContain("Render failed");
		expect(result1.details.attempt).toBe(1);

		// Second attempt — succeeds
		const result2 = await tool.execute("call-2", { path: "scene.py" });
		expect(getTextOutput(result2)).toContain("Successfully rendered");
		expect(result2.details.attempt).toBe(2);
		expect(result2.details.outputPath).toBe(expectedPath);
	});

	it("returns max attempts error after N failures", async () => {
		writeFileSync(join(workDir, "scene.py"), VALID_SCENE);

		mockRender.mockRejectedValue(new RenderError("failed", VALID_SCENE, "error"));

		const tool = createRenderTool(makeResolveSafe(workDir), workDir, { ...defaultConfig, maxAttempts: 2 });

		// Attempt 1
		const r1 = await tool.execute("call-1", { path: "scene.py" });
		expect(r1.details.attempt).toBe(1);
		expect(getTextOutput(r1)).toContain("Render failed");

		// Attempt 2
		const r2 = await tool.execute("call-2", { path: "scene.py" });
		expect(r2.details.attempt).toBe(2);
		expect(getTextOutput(r2)).toContain("Render failed");

		// Attempt 3 — should be blocked
		const r3 = await tool.execute("call-3", { path: "scene.py" });
		expect(r3.details.attempt).toBe(3);
		expect(getTextOutput(r3)).toContain("Maximum render attempts (2) exceeded");
	});
});

describe("createScopedTools with render config", () => {
	it("includes render_video tool when render config is provided", () => {
		const tools = createScopedTools(workDir, { render: defaultConfig });
		const names = tools.map((t) => t.name);

		expect(names).toContain("render_video");
		expect(names).toContain("write_file"); // file tools still there
	});

	it("excludes render_video tool when no render config", () => {
		const tools = createScopedTools(workDir);
		const names = tools.map((t) => t.name);

		expect(names).not.toContain("render_video");
		expect(names).toContain("write_file"); // file tools still there
	});
});
