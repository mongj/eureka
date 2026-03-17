import { access } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	workDir: null as string | null,
}));

vi.mock("@eureka/ai", () => ({
	getModel: vi.fn(() => ({ id: "test-model" })),
}));

vi.mock("@eureka/agent", () => {
	class FakeAgent {
		state = {
			error: "agent failed",
			messages: [],
		};

		subscribe() {}

		async prompt() {}

		async waitForIdle() {}
	}

	return {
		Agent: FakeAgent,
	};
});

vi.mock("../src/tools.js", () => ({
	createScopedTools: vi.fn((workDir: string) => {
		mockState.workDir = workDir;
		return [];
	}),
}));

describe("generateManimCode cleanup", () => {
	afterEach(async () => {
		if (mockState.workDir) {
			await import("node:fs/promises").then(({ rm }) =>
				rm(mockState.workDir!, { recursive: true, force: true }),
			);
			mockState.workDir = null;
		}
	});

	it("removes its temp directory when generation fails before returning", async () => {
		const { generateManimCode } = await import("../src/generate.js");

		await expect(generateManimCode("draw a circle")).rejects.toThrow("LLM did not generate extractable Manim code");

		expect(mockState.workDir).toBeTruthy();
		await expect(access(mockState.workDir!)).rejects.toThrow();
	});
});
