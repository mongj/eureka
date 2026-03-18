import { describe, expect, it, vi } from "vitest";
import type { GenerateResult } from "../src/types.js";

const mockState = vi.hoisted(() => ({
	generateVideo: vi.fn(),
}));

vi.mock("../src/index.js", () => ({
	generateVideo: (...args: unknown[]) => mockState.generateVideo(...args),
}));

describe("parseCliArgs", () => {
	it("parses a prompt with quality and keep-artifacts flags", async () => {
		const { parseCliArgs } = await import("../cli.js");

		expect(parseCliArgs(["--quality", "medium", "--keep-artifacts", "show", "a", "circle"])).toEqual({
			prompt: "show a circle",
			options: {
				quality: "medium",
				keepArtifacts: true,
			},
		});
	});

	it("parses model and render timeout flags", async () => {
		const { parseCliArgs } = await import("../cli.js");

		expect(
			parseCliArgs(["--model", "anthropic/claude-sonnet-4", "--render-timeout-ms", "45000", "explain", "derivatives"]),
		).toEqual({
			prompt: "explain derivatives",
			options: {
				model: "anthropic/claude-sonnet-4",
				renderTimeoutMs: 45000,
			},
		});
	});

	it("returns help mode", async () => {
		const { parseCliArgs } = await import("../cli.js");

		expect(parseCliArgs(["--help"])).toEqual({
			help: true,
		});
	});

	it("treats option-like tokens as prompt text after --", async () => {
		const { parseCliArgs } = await import("../cli.js");

		expect(parseCliArgs(["--", "explain", "--help"])).toEqual({
			prompt: "explain --help",
			options: {},
		});
	});

	it("rejects a missing prompt", async () => {
		const { parseCliArgs } = await import("../cli.js");

		expect(() => parseCliArgs([])).toThrow("Prompt is required");
	});

	it("rejects an unknown flag", async () => {
		const { parseCliArgs } = await import("../cli.js");

		expect(() => parseCliArgs(["--wat", "show a circle"])).toThrow('Unknown option: "--wat"');
	});

	it("rejects missing values for value-taking flags", async () => {
		const { parseCliArgs } = await import("../cli.js");

		expect(() => parseCliArgs(["--quality"])).toThrow('Missing value for "--quality"');
		expect(() => parseCliArgs(["--model"])).toThrow('Missing value for "--model"');
		expect(() => parseCliArgs(["--render-timeout-ms"])).toThrow('Missing value for "--render-timeout-ms"');
	});

	it("rejects invalid render timeout values", async () => {
		const { parseCliArgs } = await import("../cli.js");

		expect(() => parseCliArgs(["--render-timeout-ms", "abc", "show a circle"])).toThrow(
			'"--render-timeout-ms" must be a positive integer',
		);
		expect(() => parseCliArgs(["--render-timeout-ms", "45000ms", "show a circle"])).toThrow(
			'"--render-timeout-ms" must be a positive integer',
		);
	});
});

describe("runCli", () => {
	it("prints the generated result details on success", async () => {
		const { runCli } = await import("../cli.js");
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const result: GenerateResult = {
			videoPath: "/tmp/demo.mp4",
			code: "from manim import *",
			sceneName: "DemoScene",
			generateDurationMs: 1234,
			renderDurationMs: 5678,
			artifactsDir: "/tmp/eureka-demo",
		};

		mockState.generateVideo.mockResolvedValue(result);

		const exitCode = await runCli(["--keep-artifacts", "show a circle"]);

		expect(exitCode).toBe(0);
		expect(errorSpy).not.toHaveBeenCalled();
		const logged = logSpy.mock.calls.map(([line]) => line);
		expect(logged).toHaveLength(7);
		expect(logged[0]).toContain("Prompt: show a circle");
		expect(logged[1]).toContain("Generating video...");
		expect(logged[2]).toContain("Video: /tmp/demo.mp4");
		expect(logged[3]).toContain("Scene: DemoScene");
		expect(logged[4]).toContain("Generate: 1234ms");
		expect(logged[5]).toContain("Render: 5678ms");
		expect(logged[6]).toContain("Artifacts: /tmp/eureka-demo");

		logSpy.mockRestore();
		errorSpy.mockRestore();
	});

	it("prints help and exits successfully", async () => {
		const { runCli } = await import("../cli.js");
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const exitCode = await runCli(["--help"]);

		expect(exitCode).toBe(0);
		expect(errorSpy).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(logSpy.mock.calls[0][0]).toContain("Usage:");

		logSpy.mockRestore();
		errorSpy.mockRestore();
	});

	it("prints a readable error and exits non-zero on failure", async () => {
		const { runCli } = await import("../cli.js");
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		mockState.generateVideo.mockRejectedValue(new Error("boom"));

		const exitCode = await runCli(["show a circle"]);

		expect(exitCode).toBe(1);
		expect(logSpy.mock.calls[0][0]).toContain("Prompt: show a circle");
		expect(errorSpy.mock.calls[0][0]).toContain("boom");

		logSpy.mockRestore();
		errorSpy.mockRestore();
	});
});
