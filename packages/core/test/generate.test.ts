import { describe, it, expect } from "vitest";
import { generateVideo } from "../src/index.js";
import { access } from "node:fs/promises";
import { execSync } from "node:child_process";

// Synchronous checks at module scope for correct skipIf evaluation.
const manimAvailable = (() => {
	try {
		execSync("manim --version", { stdio: "ignore" });
		execSync("ffmpeg -version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();
const hasApiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
const canRun = manimAvailable && hasApiKey;

describe("generateVideo (E2E)", () => {
	it.skipIf(!canRun)(
		"generates a video from a simple prompt",
		async () => {
			const result = await generateVideo("Create a simple animation that shows a blue circle being drawn on screen", {
				quality: "low",
				keepArtifacts: true,
			});

			expect(result.videoPath).toContain(".mp4");
			expect(result.code).toContain("from manim import");
			expect(result.sceneName).toBeTruthy();
			expect(result.generateDurationMs).toBeGreaterThan(0);
			expect(result.renderDurationMs).toBeGreaterThan(0);

			await access(result.videoPath);

			console.log(`[E2E] Video generated at: ${result.videoPath}`);
			console.log(`[E2E] Scene: ${result.sceneName}`);
			console.log(`[E2E] Generate: ${result.generateDurationMs}ms, Render: ${result.renderDurationMs}ms`);
		},
		180_000,
	);
});
