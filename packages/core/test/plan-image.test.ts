import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCompleteSimple = vi.hoisted(() => vi.fn());
vi.mock("@eureka/ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@eureka/ai")>();
	return {
		...actual,
		resolveModelFromString: vi.fn(() => ({ provider: "openai", modelId: "gpt-5.4" })),
		completeSimple: mockCompleteSimple,
	};
});

describe("planImage", () => {
	beforeEach(() => {
		mockCompleteSimple.mockReset();
	});

	it("returns a structured image plan from LLM", async () => {
		const plannerOutput = `<objects>
- Circle: blue, radius 1.5, at ORIGIN
</objects>

<layout>
Circle centered at ORIGIN.
</layout>

<style>
Blue stroke, white background.
</style>`;

		mockCompleteSimple.mockResolvedValue({
			content: [{ type: "text", text: plannerOutput }],
			stopReason: "stop",
		});

		const { planImage } = await import("../src/generate.js");
		const result = await planImage("Show the unit circle");

		expect(result).toContain("<objects>");
		expect(result).toContain("blue");
		expect(mockCompleteSimple).toHaveBeenCalledOnce();
	});

	it("throws when planner returns empty output", async () => {
		mockCompleteSimple.mockResolvedValue({
			content: [{ type: "text", text: "" }],
			stopReason: "stop",
		});

		const { planImage } = await import("../src/generate.js");
		await expect(planImage("Show something")).rejects.toThrow("Image planner produced empty output");
	});

	it("throws when planner returns no text content", async () => {
		mockCompleteSimple.mockResolvedValue({
			content: [],
			stopReason: "stop",
		});

		const { planImage } = await import("../src/generate.js");
		await expect(planImage("Show something")).rejects.toThrow("Image planner produced empty output");
	});
});
