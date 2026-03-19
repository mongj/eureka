"""Auto-fix common LLM-hallucinated Manim class names."""

import libcst
from fixit import InvalidTestCase, LintRule, ValidTestCase

# Map of wrong name -> correct name
# These are the most common hallucinations observed in LLM-generated Manim code.
CORRECTIONS = {
    "MathText": "MathTex",
    "Mathtext": "MathTex",
    "mathtext": "MathTex",
    "TextMobject": "Text",
    "TexMobject": "Tex",
    "ShowCreation": "Create",
}


class ManimApiFixes(LintRule):
    """Fix common LLM-hallucinated Manim class/function names.

    LLMs frequently generate names that don't exist in Manim's API.
    This rule auto-corrects the most common ones.
    """

    VALID = [
        ValidTestCase('x = MathTex(r"E = mc^2")'),
        ValidTestCase("x = Text('hello')"),
        ValidTestCase("self.play(Create(circle))"),
    ]

    INVALID = [
        InvalidTestCase(
            'x = MathText(r"E = mc^2")',
            expected_replacement='x = MathTex(r"E = mc^2")',
        ),
        InvalidTestCase(
            "self.play(ShowCreation(circle))",
            expected_replacement="self.play(Create(circle))",
        ),
        InvalidTestCase(
            'x = TextMobject("hello")',
            expected_replacement='x = Text("hello")',
        ),
    ]

    def visit_Name(self, node: libcst.Name) -> None:
        if node.value in CORRECTIONS:
            correct = CORRECTIONS[node.value]
            new_node = node.with_changes(value=correct)
            self.report(
                node,
                f"`{node.value}` does not exist in Manim — use `{correct}` instead",
                replacement=new_node,
            )
