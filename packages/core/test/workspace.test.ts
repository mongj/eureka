// packages/core/test/workspace.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyWorkspaceTemplate, getWorkspaceTemplatePath } from "../src/generate.js";

let workDir: string;

afterEach(async () => {
	if (workDir) {
		await rm(workDir, { recursive: true, force: true });
	}
});

describe("getWorkspaceTemplatePath", () => {
	it("returns a path that exists", async () => {
		const { access } = await import("node:fs/promises");
		const templatePath = getWorkspaceTemplatePath();
		await expect(access(templatePath)).resolves.toBeUndefined();
	});
});

describe("copyWorkspaceTemplate", () => {
	it("copies template files into workDir", async () => {
		workDir = await mkdtemp(join(tmpdir(), "eureka-test-ws-"));
		await copyWorkspaceTemplate(workDir);

		const templates = await readdir(join(workDir, "templates"));
		expect(templates).toContain("moving_around.py");
		expect(templates).toContain("threed_camera_rotation.py");

		const content = await readFile(join(workDir, "templates/moving_around.py"), "utf-8");
		expect(content).toContain("from manim import");
	});

	it("copies pyproject.toml and rules directory", async () => {
		workDir = await mkdtemp(join(tmpdir(), "eureka-test-ws-"));
		await copyWorkspaceTemplate(workDir);

		const { access } = await import("node:fs/promises");

		// pyproject.toml should be copied
		await expect(access(join(workDir, "pyproject.toml"))).resolves.toBeUndefined();

		// rules/ directory should be copied with rule files
		const rules = await readdir(join(workDir, "rules"));
		expect(rules).toContain("__init__.py");
		expect(rules).toContain("manim_import.py");
		expect(rules).toContain("scene_structure.py");
		expect(rules).toContain("manim_api_fixes.py");
		expect(rules).toContain("empty_scene.py");
	});

	it("does not overwrite existing files in workDir", async () => {
		workDir = await mkdtemp(join(tmpdir(), "eureka-test-ws-"));
		const { writeFile, mkdir } = await import("node:fs/promises");
		await mkdir(join(workDir, "templates"), { recursive: true });
		await writeFile(join(workDir, "templates/moving_around.py"), "custom content", "utf-8");

		await copyWorkspaceTemplate(workDir);

		const content = await readFile(join(workDir, "templates/moving_around.py"), "utf-8");
		expect(content).toBe("custom content");
	});
});
