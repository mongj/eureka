// packages/core/test/tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createScopedTools } from "../src/tools.js";

let workDir: string;
let tools: ReturnType<typeof createScopedTools>;

function getTool(name: string) {
	const tool = tools.find((t) => t.name === name);
	if (!tool) throw new Error(`Tool "${name}" not found`);
	return tool;
}

beforeEach(async () => {
	workDir = await mkdtemp(join(tmpdir(), "eureka-test-tools-"));
	tools = createScopedTools(workDir);
});

afterEach(async () => {
	await rm(workDir, { recursive: true, force: true });
});

describe("edit_file", () => {
	it("replaces a unique string in a file", async () => {
		const filePath = join(workDir, "test.py");
		await writeFile(filePath, "hello world\nfoo bar\n", "utf-8");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "test.py",
			old_string: "foo bar",
			new_string: "baz qux",
		});

		const content = await readFile(filePath, "utf-8");
		expect(content).toBe("hello world\nbaz qux\n");
		expect(result.content[0].text).toContain("Applied edit");
	});

	it("returns error when file does not exist", async () => {
		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "nonexistent.py",
			old_string: "foo",
			new_string: "bar",
		});

		expect(result.content[0].text).toContain("not found");
	});

	it("returns error when old_string is not found", async () => {
		await writeFile(join(workDir, "test.py"), "hello world\n", "utf-8");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "test.py",
			old_string: "does not exist",
			new_string: "replacement",
		});

		expect(result.content[0].text).toContain("not found in file");
	});

	it("returns error when old_string has multiple matches", async () => {
		await writeFile(join(workDir, "test.py"), "aaa\naaa\n", "utf-8");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "test.py",
			old_string: "aaa",
			new_string: "bbb",
		});

		expect(result.content[0].text).toContain("2 times");
	});

	it("blocks path traversal", async () => {
		const tool = getTool("edit_file");
		await expect(
			tool.execute("call-1", {
				path: "../../../etc/passwd",
				old_string: "root",
				new_string: "hacked",
			}),
		).rejects.toThrow("escapes");
	});
});

describe("search_files", () => {
	it("finds matching lines across files", async () => {
		await mkdir(join(workDir, "templates"), { recursive: true });
		await writeFile(join(workDir, "templates/a.py"), "from manim import *\nclass Foo(Scene):\n    pass\n", "utf-8");
		await writeFile(
			join(workDir, "templates/b.py"),
			"from manim import *\nclass Bar(ThreeDScene):\n    pass\n",
			"utf-8",
		);

		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "ThreeDScene" });

		expect(result.content[0].text).toContain("templates/b.py");
		expect(result.content[0].text).toContain("ThreeDScene");
		expect(result.content[0].text).not.toContain("templates/a.py");
	});

	it("searches in a subdirectory when path is provided", async () => {
		await mkdir(join(workDir, "templates"), { recursive: true });
		await writeFile(join(workDir, "templates/a.py"), "Circle()\n", "utf-8");
		await writeFile(join(workDir, "other.py"), "Circle()\n", "utf-8");

		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "Circle", path: "templates" });

		expect(result.content[0].text).toContain("templates/a.py");
		expect(result.content[0].text).not.toContain("other.py");
	});

	it("returns no matches message when pattern not found", async () => {
		await writeFile(join(workDir, "a.py"), "hello world\n", "utf-8");

		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "nonexistent" });

		expect(result.content[0].text).toContain("No matches");
	});

	it("returns error for invalid regex", async () => {
		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "[invalid" });

		expect(result.content[0].text).toContain("Invalid regex");
	});

	it("skips binary files gracefully", async () => {
		await writeFile(join(workDir, "binary.bin"), Buffer.from([0x00, 0x01, 0x02, 0xff]));
		await writeFile(join(workDir, "text.py"), "from manim import *\n", "utf-8");

		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "manim" });

		expect(result.content[0].text).toContain("text.py");
	});
});

describe("find_files", () => {
	it("finds files matching a glob pattern", async () => {
		await mkdir(join(workDir, "templates"), { recursive: true });
		await writeFile(join(workDir, "templates/basic.py"), "# basic", "utf-8");
		await writeFile(join(workDir, "templates/3d.py"), "# 3d", "utf-8");
		await writeFile(join(workDir, "templates/readme.md"), "# readme", "utf-8");

		const tool = getTool("find_files");
		const result = await tool.execute("call-1", { pattern: "**/*.py" });

		expect(result.content[0].text).toContain("templates/basic.py");
		expect(result.content[0].text).toContain("templates/3d.py");
		expect(result.content[0].text).not.toContain("readme.md");
	});

	it("returns no files message when nothing matches", async () => {
		const tool = getTool("find_files");
		const result = await tool.execute("call-1", { pattern: "**/*.xyz" });

		expect(result.content[0].text).toContain("No files");
	});

	it("finds files in a subdirectory", async () => {
		await mkdir(join(workDir, "templates"), { recursive: true });
		await mkdir(join(workDir, "other"), { recursive: true });
		await writeFile(join(workDir, "templates/a.py"), "#", "utf-8");
		await writeFile(join(workDir, "other/b.py"), "#", "utf-8");

		const tool = getTool("find_files");
		const result = await tool.execute("call-1", { pattern: "**/*.py", path: "templates" });

		expect(result.content[0].text).toContain("a.py");
		expect(result.content[0].text).not.toContain("other");
	});
});

describe("read_file", () => {
	it("reads a small file fully", async () => {
		await writeFile(join(workDir, "small.py"), "hello\nworld\n", "utf-8");

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "small.py" });

		expect(result.content[0].text).toBe("hello\nworld\n");
	});

	it("truncates files exceeding line limit", async () => {
		const lines = Array.from({ length: 2000 }, (_, i) => `line ${i + 1}`).join("\n");
		await writeFile(join(workDir, "big.py"), lines, "utf-8");

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "big.py" });

		const text = result.content[0].text;
		expect(text).toContain("line 1");
		expect(text).toContain("(truncated");
		expect(text).not.toContain("line 2000");
	});

	it("truncates files exceeding byte limit", async () => {
		// Create a file > 100KB
		const bigContent = "x".repeat(150_000);
		await writeFile(join(workDir, "huge.txt"), bigContent, "utf-8");

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "huge.txt" });

		const text = result.content[0].text;
		expect(text.length).toBeLessThan(150_000);
		expect(text).toContain("(truncated");
	});

	it("returns error for nonexistent file", async () => {
		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "nope.py" });

		expect(result.content[0].text).toContain("not found");
	});
});
