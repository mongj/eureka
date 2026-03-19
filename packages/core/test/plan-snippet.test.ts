import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @eureka/ai to avoid real LLM calls
const mockCompleteSimple = vi.hoisted(() => vi.fn());
vi.mock("@eureka/ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@eureka/ai")>();
	return {
		...actual,
		resolveModelFromString: vi.fn(() => ({ provider: "openai", modelId: "gpt-5.4" })),
		completeSimple: mockCompleteSimple,
	};
});

describe("planSnippet", () => {
	beforeEach(() => {
		mockCompleteSimple.mockReset();
	});

	it("returns structured planner output on success", async () => {
		const plannerOutput = `<objects>
- Circle: blue, radius 1, at ORIGIN
</objects>

<layout>
Circle centered at ORIGIN.
</layout>

<animations>
1. Create the circle (quick, 0.5s)
2. Scale circle to radius 2 (normal, 1s)
</animations>

<timing>
Total: 2 seconds
</timing>`;

		mockCompleteSimple.mockResolvedValue({
			content: [{ type: "text", text: plannerOutput }],
			stopReason: "stop",
		});

		const { planSnippet } = await import("../src/generate.js");
		const result = await planSnippet("show a circle growing");

		expect(result).toContain("<objects>");
		expect(result).toContain("<animations>");
		expect(result).toContain("<timing>");
		expect(mockCompleteSimple).toHaveBeenCalledOnce();
	});

	it("throws when planner returns empty response", async () => {
		mockCompleteSimple.mockResolvedValue({
			content: [{ type: "text", text: "" }],
			stopReason: "stop",
		});

		const { planSnippet } = await import("../src/generate.js");
		await expect(planSnippet("show something")).rejects.toThrow("Snippet planner produced empty output");
	});

	it("throws when planner returns no text content", async () => {
		mockCompleteSimple.mockResolvedValue({
			content: [],
			stopReason: "stop",
		});

		const { planSnippet } = await import("../src/generate.js");
		await expect(planSnippet("show something")).rejects.toThrow("Snippet planner produced empty output");
	});

	it("passes the signal through for cancellation", async () => {
		const plannerOutput =
			"<objects>\ntest\n</objects>\n<layout>\ntest\n</layout>\n<animations>\ntest\n</animations>\n<timing>\n1s\n</timing>";
		mockCompleteSimple.mockResolvedValue({
			content: [{ type: "text", text: plannerOutput }],
			stopReason: "stop",
		});

		const controller = new AbortController();
		const { planSnippet } = await import("../src/generate.js");
		await planSnippet("show something", { signal: controller.signal });

		expect(mockCompleteSimple).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ signal: controller.signal }),
		);
	});
});
