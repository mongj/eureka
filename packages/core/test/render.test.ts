import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractSceneName, findRenderOutput, renderManimScene } from "../src/render.js";

describe("extractSceneName", () => {
	it("extracts a single Scene subclass name", () => {
		const code = `
from manim import *

class MyAnimation(Scene):
    def construct(self):
        circle = Circle()
        self.play(Create(circle))
`;
		expect(extractSceneName(code)).toBe("MyAnimation");
	});

	it("extracts the first Scene subclass when multiple exist", () => {
		const code = `
from manim import *

class FirstScene(Scene):
    def construct(self):
        pass

class SecondScene(Scene):
    def construct(self):
        pass
`;
		expect(extractSceneName(code)).toBe("FirstScene");
	});

	it("handles ThreeDScene subclass", () => {
		const code = `
from manim import *

class My3DScene(ThreeDScene):
    def construct(self):
        pass
`;
		expect(extractSceneName(code)).toBe("My3DScene");
	});

	it("returns null when no Scene subclass found", () => {
		const code = `
print("hello world")
`;
		expect(extractSceneName(code)).toBeNull();
	});

	it("handles class with extra whitespace", () => {
		const code = `class  MyScene ( Scene ) :`;
		expect(extractSceneName(code)).toBe("MyScene");
	});
});

describe("renderManimScene", () => {
	it("should be a function", () => {
		expect(typeof renderManimScene).toBe("function");
	});
});

describe("findRenderOutput", () => {
	let workDir: string;

	beforeEach(() => {
		workDir = mkdtempSync(join(tmpdir(), "eureka-test-render-output-"));
	});

	afterEach(() => {
		rmSync(workDir, { recursive: true, force: true });
	});

	it("finds MP4 in media/videos/ for video mode", async () => {
		const videosDir = join(workDir, "media", "videos", "scene", "480p15");
		mkdirSync(videosDir, { recursive: true });
		writeFileSync(join(videosDir, "TestScene.mp4"), "fake mp4");

		const result = await findRenderOutput(join(workDir, "media"), "TestScene", false);
		expect(result).toBe(join(videosDir, "TestScene.mp4"));
	});

	it("finds PNG in media/images/ for image mode", async () => {
		const imagesDir = join(workDir, "media", "images", "scene");
		mkdirSync(imagesDir, { recursive: true });
		writeFileSync(join(imagesDir, "TestScene_ManimCE_v0.20.1.png"), "fake png");

		const result = await findRenderOutput(join(workDir, "media"), "TestScene", true);
		expect(result).toContain("TestScene");
		expect(result).toMatch(/\.png$/);
	});

	it("throws when no video output directory found", async () => {
		mkdirSync(join(workDir, "media", "videos", "scene"), { recursive: true });

		await expect(findRenderOutput(join(workDir, "media"), "TestScene", false)).rejects.toThrow(
			"No output directory found",
		);
	});

	it("throws when no image output found", async () => {
		mkdirSync(join(workDir, "media", "images", "scene"), { recursive: true });

		await expect(findRenderOutput(join(workDir, "media"), "TestScene", true)).rejects.toThrow("No PNG output found");
	});

	it("throws when images directory does not exist", async () => {
		mkdirSync(join(workDir, "media"), { recursive: true });

		await expect(findRenderOutput(join(workDir, "media"), "TestScene", true)).rejects.toThrow(
			"No images output directory found",
		);
	});
});
