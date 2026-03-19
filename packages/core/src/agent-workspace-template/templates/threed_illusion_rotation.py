# Reference: 3D Illusion Camera Rotation
# Source: https://docs.manim.community/en/stable/examples.html
# Demonstrates: ThreeDScene, begin_3dillusion_camera_rotation (fake 3D rotation effect)

from manim import *


class ThreeDCameraIllusionRotation(ThreeDScene):
    def construct(self):
        axes = ThreeDAxes()
        circle = Circle()
        self.set_camera_orientation(phi=75 * DEGREES, theta=30 * DEGREES)
        self.add(circle, axes)
        self.begin_3dillusion_camera_rotation(rate=2)
        self.wait(PI / 2)
        self.stop_3dillusion_camera_rotation()
