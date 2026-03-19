"""Warn when a Scene's construct method has no self.play() calls."""

import libcst
import libcst.matchers as m
from fixit import InvalidTestCase, LintRule, ValidTestCase


class EmptyScene(LintRule):
    """Scene's construct() must call self.play() at least once.

    A construct() with no play() calls produces a blank/empty video.
    Cannot auto-fix — only the LLM knows what animation to add.
    """

    VALID = [
        ValidTestCase(
            """from manim import *

class MyScene(Scene):
    def construct(self):
        circle = Circle()
        self.play(Create(circle))
"""
        ),
        ValidTestCase(
            """from manim import *

class MyScene(Scene):
    def construct(self):
        self.play(FadeIn(Square()))
        self.wait(1)
"""
        ),
        # Non-Scene class is fine without play()
        ValidTestCase(
            """class Helper:
    def construct(self):
        pass
"""
        ),
    ]

    INVALID = [
        InvalidTestCase(
            """from manim import *

class MyScene(Scene):
    def construct(self):
        circle = Circle()
        self.add(circle)
"""
        ),
        InvalidTestCase(
            """from manim import *

class MyScene(Scene):
    def construct(self):
        pass
"""
        ),
    ]

    def _has_play_call(self, node: libcst.CSTNode) -> bool:
        """Recursively check if a node contains self.play(...)."""
        # Check if this node is self.play(...)
        if m.matches(
            node,
            m.Call(func=m.Attribute(value=m.Name("self"), attr=m.Name("play"))),
        ):
            return True

        # Recurse into children
        for child in node.children:
            if self._has_play_call(child):
                return True

        return False

    def visit_ClassDef(self, node: libcst.ClassDef) -> None:
        # Check if this class extends *Scene
        is_scene = False
        for arg in node.bases:
            if isinstance(arg.value, libcst.Name) and arg.value.value.endswith("Scene"):
                is_scene = True
                break

        if not is_scene:
            return

        # Find construct method
        for item in node.body.body:
            if isinstance(item, libcst.FunctionDef) and item.name.value == "construct":
                if not self._has_play_call(item):
                    self.report(
                        item,
                        "construct() has no self.play() calls — this will produce an empty/blank video. Add animations.",
                    )
                return
