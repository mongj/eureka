"""Ensure Scene subclasses define a construct(self) method."""

import libcst
from fixit import InvalidTestCase, LintRule, ValidTestCase


class SceneStructure(LintRule):
    """Scene subclasses must define a `construct(self)` method.

    Auto-fixes `Construct` -> `construct` (common LLM capitalization mistake).
    Reports but cannot auto-fix missing construct entirely.
    """

    VALID = [
        ValidTestCase(
            """from manim import *

class MyScene(Scene):
    def construct(self):
        self.play(Create(Circle()))
"""
        ),
        ValidTestCase(
            """from manim import *

class MyScene(ThreeDScene):
    def construct(self):
        pass
"""
        ),
        # Non-Scene classes don't need construct
        ValidTestCase(
            """class Helper:
    def run(self):
        pass
"""
        ),
    ]

    INVALID = [
        # Missing construct method entirely
        InvalidTestCase(
            """from manim import *

class MyScene(Scene):
    def setup(self):
        pass
"""
        ),
        # Capitalized Construct (common LLM mistake)
        InvalidTestCase(
            """from manim import *

class MyScene(Scene):
    def Construct(self):
        self.play(Create(Circle()))
""",
            expected_replacement="""from manim import *

class MyScene(Scene):
    def construct(self):
        self.play(Create(Circle()))
""",
        ),
    ]

    def visit_ClassDef(self, node: libcst.ClassDef) -> None:
        # Check if this class extends *Scene
        is_scene = False
        for arg in node.bases:
            if isinstance(arg.value, libcst.Name) and arg.value.value.endswith("Scene"):
                is_scene = True
                break

        if not is_scene:
            return

        # Look for construct or Construct method
        has_construct = False
        has_capitalized = False
        for item in node.body.body:
            if isinstance(item, libcst.FunctionDef):
                if item.name.value == "construct":
                    has_construct = True
                    break
                if item.name.value == "Construct":
                    has_capitalized = True

        if has_construct:
            return

        if has_capitalized:
            # Auto-fix: rename Construct -> construct
            new_body_items = []
            for item in node.body.body:
                if isinstance(item, libcst.FunctionDef) and item.name.value == "Construct":
                    new_body_items.append(item.with_changes(name=libcst.Name("construct")))
                else:
                    new_body_items.append(item)
            new_body = node.body.with_changes(body=new_body_items)
            new_node = node.with_changes(body=new_body)
            self.report(
                node,
                "Scene method should be `construct`, not `Construct` — Manim requires lowercase",
                replacement=new_node,
            )
        else:
            # No construct at all — can't auto-fix
            self.report(
                node,
                "Scene subclass is missing a `construct(self)` method — Manim requires it to define animations",
            )
