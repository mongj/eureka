# Reference: Moving Frame Box (SurroundingRectangle)
# Source: https://docs.manim.community/en/stable/examples.html
# Demonstrates: MathTex, SurroundingRectangle, ReplacementTransform, highlighting parts of equations

from manim import *


class MovingFrameBox(Scene):
    def construct(self):
        text = MathTex(
            r"\frac{d}{dx}f(x)g(x)=", r"f(x)\frac{d}{dx}g(x)", "+",
            r"g(x)\frac{d}{dx}f(x)"
        )
        self.play(Write(text))
        framebox1 = SurroundingRectangle(text[1], buff=0.1)
        framebox2 = SurroundingRectangle(text[3], buff=0.1)
        self.play(Create(framebox1))
        self.wait()
        self.play(ReplacementTransform(framebox1, framebox2))
        self.wait()
