"""Ensure `from manim import *` is present in scene files."""

import libcst
from fixit import InvalidTestCase, LintRule, ValidTestCase


class ManimImport(LintRule):
    """Scene files must import from manim. Auto-fixes by adding the import."""

    VALID = [
        ValidTestCase(
            """from manim import *

class MyScene(Scene):
    def construct(self):
        self.play(Create(Circle()))
"""
        ),
        # import * with extra imports is fine
        ValidTestCase(
            """from manim import *
import numpy as np
"""
        ),
    ]

    INVALID = [
        InvalidTestCase(
            """class MyScene(Scene):
    def construct(self):
        self.play(Create(Circle()))
""",
            expected_replacement="""from manim import *

class MyScene(Scene):
    def construct(self):
        self.play(Create(Circle()))
""",
        ),
    ]

    def visit_Module(self, node: libcst.Module) -> None:
        # Check if any import is `from manim import *`
        for stmt in node.body:
            if isinstance(stmt, libcst.SimpleStatementLine):
                for item in stmt.body:
                    if (
                        isinstance(item, libcst.ImportFrom)
                        and isinstance(item.module, libcst.Attribute | libcst.Name)
                    ):
                        # Check for `from manim import ...`
                        module_name = ""
                        if isinstance(item.module, libcst.Name):
                            module_name = item.module.value
                        if module_name == "manim":
                            return  # Found it

        # No manim import found — report with autofix
        import_line = libcst.parse_statement("from manim import *\n")
        # Add an empty line before the first existing statement
        existing_body = list(node.body)
        if existing_body:
            first = existing_body[0]
            existing_body[0] = first.with_changes(
                leading_lines=(*first.leading_lines, libcst.EmptyLine())
            )
        new_node = node.with_changes(body=(import_line, *existing_body))
        self.report(node, "Missing `from manim import *` — required for Manim scenes", replacement=new_node)
