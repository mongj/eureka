import { describe, it, expect } from "vitest";
import { extractSceneName, renderManimScene } from "../src/render.js";

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
