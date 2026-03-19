# Reference: Fixed-in-Frame Text in 3D Scene
# Source: https://docs.manim.community/en/stable/examples.html
# Demonstrates: ThreeDScene, add_fixed_in_frame_mobjects (2D text overlay on 3D scene)

from manim import *


class FixedInFrameMObjectTest(ThreeDScene):
    def construct(self):
        axes = ThreeDAxes()
        self.set_camera_orientation(phi=75 * DEGREES, theta=-45 * DEGREES)
        text3d = Text("This is a 3D text")
        self.add_fixed_in_frame_mobjects(text3d)
        text3d.to_corner(UL)
        self.add(axes)
        self.wait()
