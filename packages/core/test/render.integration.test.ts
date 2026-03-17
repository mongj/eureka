import { describe, it, expect } from "vitest";
import { renderManimScene } from "../src/render.js";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

// Synchronous check at module scope so skipIf evaluates correctly at collection time
const manimAvailable = (() => {
	try {
		execSync("manim --version", { stdio: "ignore" });
		execSync("ffmpeg -version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

describe("renderManimScene (integration)", () => {
	it.skipIf(!manimAvailable)("renders a simple scene to MP4", async () => {
		const workDir = await mkdtemp(join(tmpdir(), "eureka-test-"));
		try {
			const code = `from manim import *

class TestCircle(Scene):
    def construct(self):
        circle = Circle()
        self.play(Create(circle))
        self.wait(0.5)
`;
			const videoPath = await renderManimScene({
				code,
				sceneName: "TestCircle",
				quality: "low",
				timeoutMs: 60000,
				workDir,
			});

			await access(videoPath);
			expect(videoPath).toContain("TestCircle.mp4");
		} finally {
			await rm(workDir, { recursive: true, force: true });
		}
	});

	it.skipIf(!manimAvailable)("throws RenderError on invalid python code", async () => {
		const workDir = await mkdtemp(join(tmpdir(), "eureka-test-"));
		try {
			const code = `from manim import *

class BadScene(Scene):
    def construct(self):
        this_will_fail()
`;
			await expect(
				renderManimScene({
					code,
					sceneName: "BadScene",
					quality: "low",
					timeoutMs: 60000,
					workDir,
				}),
			).rejects.toThrow("Manim render failed");
		} finally {
			await rm(workDir, { recursive: true, force: true });
		}
	});
});
