import { describe, expect, it, vi } from "vitest";
import type { GenerateResult } from "../src/types.js";

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
		const output: string[] = [];
		const result: GenerateResult = {
			videoPath: "/tmp/demo.mp4",
			code: "from manim import *",
			sceneName: "DemoScene",
			generateDurationMs: 1234,
			renderDurationMs: 5678,
			artifactsDir: "/tmp/eureka-demo",
		};

		const exitCode = await runCli(["--keep-artifacts", "show a circle"], {
			generateVideo: vi.fn(async () => result),
			stdout: (line) => output.push(line),
			stderr: vi.fn(),
		});

		expect(exitCode).toBe(0);
		expect(output).toEqual([
			"[eureka] Prompt: show a circle",
			"[eureka] Generating video...",
			"[eureka] Video: /tmp/demo.mp4",
			"[eureka] Scene: DemoScene",
			"[eureka] Generate: 1234ms",
			"[eureka] Render: 5678ms",
			"[eureka] Artifacts: /tmp/eureka-demo",
		]);
	});

	it("prints help and exits successfully", async () => {
		const { runCli } = await import("../cli.js");
		const output: string[] = [];

		const exitCode = await runCli(["--help"], {
			generateVideo: vi.fn(),
			stdout: (line) => output.push(line),
			stderr: vi.fn(),
		});

		expect(exitCode).toBe(0);
		expect(output[0]).toContain("Usage:");
	});

	it("prints a readable error and exits non-zero on failure", async () => {
		const { runCli } = await import("../cli.js");
		const errors: string[] = [];

		const exitCode = await runCli(["show a circle"], {
			generateVideo: vi.fn(async () => {
				throw new Error("boom");
			}),
			stdout: vi.fn(),
			stderr: (line) => errors.push(line),
		});

		expect(exitCode).toBe(1);
		expect(errors).toEqual(["[eureka] Error: boom"]);
	});
});
