import { describe, it, expect } from "vitest";
import { checkManimInstalled, checkFfmpegInstalled } from "../src/dependencies.js";
import { checkFixitInstalled } from "../src/dependencies.js";

describe("checkManimInstalled", () => {
	it("should be a function", () => {
		expect(typeof checkManimInstalled).toBe("function");
	});

	it("should return a promise", () => {
		const result = checkManimInstalled();
		expect(result).toBeInstanceOf(Promise);
		// Catch to prevent unhandled rejection if manim isn't installed
		result.catch(() => {});
	});
});

describe("checkFfmpegInstalled", () => {
	it("should be a function", () => {
		expect(typeof checkFfmpegInstalled).toBe("function");
	});

	it("should return a promise", () => {
		const result = checkFfmpegInstalled();
		expect(result).toBeInstanceOf(Promise);
		result.catch(() => {});
	});
});

describe("checkFixitInstalled", () => {
	it("should be a function", () => {
		expect(typeof checkFixitInstalled).toBe("function");
	});

	it("should return a promise", () => {
		const result = checkFixitInstalled();
		expect(result).toBeInstanceOf(Promise);
		result.catch(() => {});
	});
});
