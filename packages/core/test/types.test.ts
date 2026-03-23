import { describe, it, expectTypeOf } from "vitest";
import type { GenerateOptions, GenerateResult } from "../src/types.js";

describe("GenerateOptions type", () => {
	it("accepts image mode", () => {
		const opts: GenerateOptions = { mode: "image" };
		expectTypeOf(opts.mode).toEqualTypeOf<"default" | "snippet" | "image" | undefined>();
	});

	it("accepts title option", () => {
		const opts: GenerateOptions = { title: "Pythagorean Theorem" };
		expectTypeOf(opts.title).toEqualTypeOf<string | undefined>();
	});
});

describe("GenerateResult type", () => {
	it("has outputPath instead of videoPath", () => {
		const result: GenerateResult = {
			code: "",
			sceneName: "",
			durationMs: 0,
			outputPath: "/tmp/test.mp4",
		};
		expectTypeOf(result.outputPath).toEqualTypeOf<string | undefined>();
		// @ts-expect-error — videoPath should not exist
		result.videoPath;
	});
});
