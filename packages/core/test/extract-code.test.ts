import { describe, it, expect } from "vitest";
import { extractManimCode } from "../src/generate.js";

describe("extractManimCode", () => {
	it("extracts code from a python markdown block", () => {
		const response = `Here's the animation:

\`\`\`python
from manim import *

class MyScene(Scene):
    def construct(self):
        self.play(Create(Circle()))
\`\`\`

This creates a circle animation.`;

		const code = extractManimCode(response);
		expect(code).toContain("from manim import *");
		expect(code).toContain("class MyScene(Scene)");
	});

	it("extracts code from a plain markdown block", () => {
		const response = `\`\`\`
from manim import *

class PlainBlock(Scene):
    def construct(self):
        pass
\`\`\``;

		const code = extractManimCode(response);
		expect(code).toContain("class PlainBlock(Scene)");
	});

	it("extracts the first code block when multiple exist", () => {
		const response = `\`\`\`python
from manim import *

class First(Scene):
    def construct(self):
        pass
\`\`\`

Here's another version:

\`\`\`python
from manim import *

class Second(Scene):
    def construct(self):
        pass
\`\`\``;

		const code = extractManimCode(response);
		expect(code).toContain("class First(Scene)");
		expect(code).not.toContain("class Second(Scene)");
	});

	it("returns the raw response if no code block but contains manim import", () => {
		const response = `from manim import *

class NoBlock(Scene):
    def construct(self):
        pass`;

		const code = extractManimCode(response);
		expect(code).toContain("class NoBlock(Scene)");
	});

	it("returns null when response contains no code", () => {
		const response = "I'm sorry, I can't generate that animation.";
		expect(extractManimCode(response)).toBeNull();
	});

	it("handles code blocks with trailing whitespace", () => {
		const response = `\`\`\`python
from manim import *

class Trimmed(Scene):
    def construct(self):
        pass
\`\`\`  `;

		const code = extractManimCode(response);
		expect(code).toContain("class Trimmed(Scene)");
	});
});
