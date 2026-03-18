import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createScopedTools } from "../src/tools/index.js";

let workDir: string;
let tools: ReturnType<typeof createScopedTools>;

function getTool(name: string) {
	const tool = tools.find((t) => t.name === name);
	if (!tool) throw new Error(`Tool "${name}" not found`);
	return tool;
}

function getTextOutput(result: any): string {
	return (
		result.content
			?.filter((c: any) => c.type === "text")
			.map((c: any) => c.text)
			.join("\n") || ""
	);
}

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "eureka-test-tools-"));
	tools = createScopedTools(workDir);
});

afterEach(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe("write_file", () => {
	it("writes content to a file", async () => {
		const tool = getTool("write_file");
		const result = await tool.execute("call-1", {
			path: "test.py",
			content: "hello world",
		});

		expect(getTextOutput(result)).toContain("Successfully wrote");
		expect(readFileSync(join(workDir, "test.py"), "utf-8")).toBe("hello world");
	});

	it("creates parent directories", async () => {
		const tool = getTool("write_file");
		const result = await tool.execute("call-1", {
			path: "nested/dir/test.py",
			content: "nested content",
		});

		expect(getTextOutput(result)).toContain("Successfully wrote");
		expect(readFileSync(join(workDir, "nested/dir/test.py"), "utf-8")).toBe("nested content");
	});

	it("blocks path traversal", async () => {
		const tool = getTool("write_file");
		await expect(
			tool.execute("call-1", {
				path: "../../../etc/evil",
				content: "hacked",
			}),
		).rejects.toThrow("escapes");
	});
});

describe("read_file", () => {
	it("reads a small file fully", async () => {
		writeFileSync(join(workDir, "small.py"), "hello\nworld\n");

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "small.py" });

		expect(getTextOutput(result)).toBe("hello\nworld\n");
	});

	it("throws error for nonexistent file", async () => {
		const tool = getTool("read_file");
		await expect(tool.execute("call-1", { path: "nope.py" })).rejects.toThrow(/not found/i);
	});

	it("truncates files exceeding line limit", async () => {
		const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
		writeFileSync(join(workDir, "large.txt"), lines.join("\n"));

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "large.txt" });
		const output = getTextOutput(result);

		expect(output).toContain("Line 1");
		expect(output).toContain("Line 2000");
		expect(output).not.toContain("Line 2001");
		expect(output).toContain("[Showing lines 1-2000 of 2500. Use offset=2001 to continue.]");
	});

	it("truncates when byte limit exceeded", async () => {
		// Create file that exceeds 50KB byte limit but has fewer than 2000 lines
		const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: ${"x".repeat(200)}`);
		writeFileSync(join(workDir, "large-bytes.txt"), lines.join("\n"));

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "large-bytes.txt" });
		const output = getTextOutput(result);

		expect(output).toContain("Line 1:");
		expect(output).toMatch(/\[Showing lines 1-\d+ of 500 \(.* limit\)\. Use offset=\d+ to continue\.\]/);
	});

	it("handles offset parameter", async () => {
		const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
		writeFileSync(join(workDir, "offset-test.txt"), lines.join("\n"));

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "offset-test.txt", offset: 51 });
		const output = getTextOutput(result);

		expect(output).not.toContain("Line 50\n");
		expect(output).toContain("Line 51");
		expect(output).toContain("Line 100");
		expect(output).not.toContain("Use offset=");
	});

	it("handles limit parameter", async () => {
		const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
		writeFileSync(join(workDir, "limit-test.txt"), lines.join("\n"));

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "limit-test.txt", limit: 10 });
		const output = getTextOutput(result);

		expect(output).toContain("Line 1");
		expect(output).toContain("Line 10");
		expect(output).not.toContain("Line 11");
		expect(output).toContain("[90 more lines in file. Use offset=11 to continue.]");
	});

	it("handles offset + limit together", async () => {
		const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
		writeFileSync(join(workDir, "offset-limit-test.txt"), lines.join("\n"));

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "offset-limit-test.txt", offset: 41, limit: 20 });
		const output = getTextOutput(result);

		expect(output).not.toContain("Line 40\n");
		expect(output).toContain("Line 41");
		expect(output).toContain("Line 60");
		expect(output).not.toContain("Line 61");
		expect(output).toContain("[40 more lines in file. Use offset=61 to continue.]");
	});

	it("throws error when offset is beyond file length", async () => {
		writeFileSync(join(workDir, "short.txt"), "Line 1\nLine 2\nLine 3");

		const tool = getTool("read_file");
		await expect(tool.execute("call-1", { path: "short.txt", offset: 100 })).rejects.toThrow(
			/Offset 100 is beyond end of file \(3 lines total\)/,
		);
	});

	it("includes truncation details when truncated", async () => {
		const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
		writeFileSync(join(workDir, "large-file.txt"), lines.join("\n"));

		const tool = getTool("read_file");
		const result = await tool.execute("call-1", { path: "large-file.txt" });

		expect(result.details).toBeDefined();
		expect(result.details?.truncation).toBeDefined();
		expect(result.details?.truncation?.truncated).toBe(true);
		expect(result.details?.truncation?.truncatedBy).toBe("lines");
		expect(result.details?.truncation?.totalLines).toBe(2500);
		expect(result.details?.truncation?.outputLines).toBe(2000);
	});

	it("blocks path traversal", async () => {
		const tool = getTool("read_file");
		await expect(tool.execute("call-1", { path: "../../../etc/passwd" })).rejects.toThrow("escapes");
	});
});

describe("edit_file", () => {
	it("replaces a unique string in a file", async () => {
		writeFileSync(join(workDir, "test.py"), "hello world\nfoo bar\n");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "test.py",
			old_string: "foo bar",
			new_string: "baz qux",
		});

		const content = readFileSync(join(workDir, "test.py"), "utf-8");
		expect(content).toBe("hello world\nbaz qux\n");
		expect(getTextOutput(result)).toContain("Successfully replaced");
		expect(result.details.diff).toBeDefined();
	});

	it("throws error when file does not exist", async () => {
		const tool = getTool("edit_file");
		await expect(
			tool.execute("call-1", {
				path: "nonexistent.py",
				old_string: "foo",
				new_string: "bar",
			}),
		).rejects.toThrow(/not found/i);
	});

	it("throws error when old_string is not found", async () => {
		writeFileSync(join(workDir, "test.py"), "hello world\n");

		const tool = getTool("edit_file");
		await expect(
			tool.execute("call-1", {
				path: "test.py",
				old_string: "does not exist",
				new_string: "replacement",
			}),
		).rejects.toThrow(/Could not find the exact text/);
	});

	it("throws error when old_string has multiple matches", async () => {
		writeFileSync(join(workDir, "test.py"), "foo foo foo");

		const tool = getTool("edit_file");
		await expect(
			tool.execute("call-1", {
				path: "test.py",
				old_string: "foo",
				new_string: "bar",
			}),
		).rejects.toThrow(/Found 3 occurrences/);
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

describe("edit_file fuzzy matching", () => {
	it("matches text with trailing whitespace stripped", async () => {
		writeFileSync(join(workDir, "trailing-ws.txt"), "line one   \nline two  \nline three\n");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "trailing-ws.txt",
			old_string: "line one\nline two\n",
			new_string: "replaced\n",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		const content = readFileSync(join(workDir, "trailing-ws.txt"), "utf-8");
		expect(content).toBe("replaced\nline three\n");
	});

	it("matches fullwidth punctuation in Chinese text", async () => {
		writeFileSync(join(workDir, "chinese.txt"), "你好，世界\n你好（世界）\n");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "chinese.txt",
			old_string: "你好,世界\n你好(世界)\n",
			new_string: "你好，pi\n你好(pi)\n",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		const content = readFileSync(join(workDir, "chinese.txt"), "utf-8");
		expect(content).toBe("你好，pi\n你好(pi)\n");
	});

	it("matches smart single quotes to ASCII quotes", async () => {
		writeFileSync(join(workDir, "smart-quotes.txt"), "console.log(\u2018hello\u2019);\n");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "smart-quotes.txt",
			old_string: "console.log('hello');",
			new_string: "console.log('world');",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		expect(readFileSync(join(workDir, "smart-quotes.txt"), "utf-8")).toContain("world");
	});

	it("matches smart double quotes to ASCII quotes", async () => {
		writeFileSync(join(workDir, "smart-double.txt"), "const msg = \u201CHello World\u201D;\n");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "smart-double.txt",
			old_string: 'const msg = "Hello World";',
			new_string: 'const msg = "Goodbye";',
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		expect(readFileSync(join(workDir, "smart-double.txt"), "utf-8")).toContain("Goodbye");
	});

	it("matches Unicode dashes to ASCII hyphen", async () => {
		writeFileSync(join(workDir, "dashes.txt"), "range: 1\u20135\nbreak\u2014here\n");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "dashes.txt",
			old_string: "range: 1-5\nbreak-here",
			new_string: "range: 10-50\nbreak--here",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		expect(readFileSync(join(workDir, "dashes.txt"), "utf-8")).toContain("10-50");
	});

	it("matches non-breaking space to regular space", async () => {
		writeFileSync(join(workDir, "nbsp.txt"), "hello\u00A0world\n");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "nbsp.txt",
			old_string: "hello world",
			new_string: "hello universe",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		expect(readFileSync(join(workDir, "nbsp.txt"), "utf-8")).toContain("universe");
	});

	it("prefers exact match over fuzzy match", async () => {
		writeFileSync(join(workDir, "exact.txt"), "const x = 'exact';\nconst y = 'other';\n");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "exact.txt",
			old_string: "const x = 'exact';",
			new_string: "const x = 'changed';",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
		expect(readFileSync(join(workDir, "exact.txt"), "utf-8")).toBe("const x = 'changed';\nconst y = 'other';\n");
	});

	it("still fails when text is not found even with fuzzy matching", async () => {
		writeFileSync(join(workDir, "no-match.txt"), "completely different content\n");

		const tool = getTool("edit_file");
		await expect(
			tool.execute("call-1", {
				path: "no-match.txt",
				old_string: "this does not exist",
				new_string: "replacement",
			}),
		).rejects.toThrow(/Could not find the exact text/);
	});

	it("detects duplicates after fuzzy normalization", async () => {
		writeFileSync(join(workDir, "fuzzy-dups.txt"), "hello world   \nhello world\n");

		const tool = getTool("edit_file");
		await expect(
			tool.execute("call-1", {
				path: "fuzzy-dups.txt",
				old_string: "hello world",
				new_string: "replaced",
			}),
		).rejects.toThrow(/Found 2 occurrences/);
	});
});

describe("edit_file CRLF handling", () => {
	it("matches LF old_string against CRLF file content", async () => {
		writeFileSync(join(workDir, "crlf.txt"), "line one\r\nline two\r\nline three\r\n");

		const tool = getTool("edit_file");
		const result = await tool.execute("call-1", {
			path: "crlf.txt",
			old_string: "line two\n",
			new_string: "replaced line\n",
		});

		expect(getTextOutput(result)).toContain("Successfully replaced");
	});

	it("preserves CRLF line endings after edit", async () => {
		writeFileSync(join(workDir, "crlf-preserve.txt"), "first\r\nsecond\r\nthird\r\n");

		const tool = getTool("edit_file");
		await tool.execute("call-1", {
			path: "crlf-preserve.txt",
			old_string: "second\n",
			new_string: "REPLACED\n",
		});

		expect(readFileSync(join(workDir, "crlf-preserve.txt"), "utf-8")).toBe("first\r\nREPLACED\r\nthird\r\n");
	});

	it("preserves LF line endings for LF files", async () => {
		writeFileSync(join(workDir, "lf-preserve.txt"), "first\nsecond\nthird\n");

		const tool = getTool("edit_file");
		await tool.execute("call-1", {
			path: "lf-preserve.txt",
			old_string: "second\n",
			new_string: "REPLACED\n",
		});

		expect(readFileSync(join(workDir, "lf-preserve.txt"), "utf-8")).toBe("first\nREPLACED\nthird\n");
	});

	it("detects duplicates across CRLF/LF variants", async () => {
		writeFileSync(join(workDir, "mixed.txt"), "hello\r\nworld\r\n---\r\nhello\nworld\n");

		const tool = getTool("edit_file");
		await expect(
			tool.execute("call-1", {
				path: "mixed.txt",
				old_string: "hello\nworld\n",
				new_string: "replaced\n",
			}),
		).rejects.toThrow(/Found 2 occurrences/);
	});

	it("preserves UTF-8 BOM after edit", async () => {
		writeFileSync(join(workDir, "bom.txt"), "\uFEFFfirst\r\nsecond\r\nthird\r\n");

		const tool = getTool("edit_file");
		await tool.execute("call-1", {
			path: "bom.txt",
			old_string: "second\n",
			new_string: "REPLACED\n",
		});

		expect(readFileSync(join(workDir, "bom.txt"), "utf-8")).toBe("\uFEFFfirst\r\nREPLACED\r\nthird\r\n");
	});
});

describe("list_files", () => {
	it("lists files and directories", async () => {
		writeFileSync(join(workDir, "file.txt"), "content");
		mkdirSync(join(workDir, "subdir"));

		const tool = getTool("list_files");
		const result = await tool.execute("call-1", {});
		const output = getTextOutput(result);

		expect(output).toContain("file.txt");
		expect(output).toContain("subdir/");
	});

	it("sorts alphabetically case-insensitive", async () => {
		writeFileSync(join(workDir, "Zebra.txt"), "");
		writeFileSync(join(workDir, "apple.txt"), "");
		writeFileSync(join(workDir, "Banana.txt"), "");

		const tool = getTool("list_files");
		const result = await tool.execute("call-1", {});
		const lines = getTextOutput(result).split("\n");

		expect(lines[0]).toBe("apple.txt");
		expect(lines[1]).toBe("Banana.txt");
		expect(lines[2]).toBe("Zebra.txt");
	});

	it("includes dotfiles", async () => {
		writeFileSync(join(workDir, ".hidden"), "secret");
		mkdirSync(join(workDir, ".hidden-dir"));

		const tool = getTool("list_files");
		const result = await tool.execute("call-1", {});
		const output = getTextOutput(result);

		expect(output).toContain(".hidden");
		expect(output).toContain(".hidden-dir/");
	});

	it("shows empty directory message", async () => {
		mkdirSync(join(workDir, "empty"));

		const tool = getTool("list_files");
		const result = await tool.execute("call-1", { path: "empty" });

		expect(getTextOutput(result)).toBe("(empty directory)");
	});

	it("throws error for nonexistent directory", async () => {
		const tool = getTool("list_files");
		await expect(tool.execute("call-1", { path: "nope" })).rejects.toThrow(/not found/i);
	});
});

describe("search_files", () => {
	it("finds matching lines across files", async () => {
		mkdirSync(join(workDir, "templates"), { recursive: true });
		writeFileSync(join(workDir, "templates/a.py"), "from manim import *\nclass Foo(Scene):\n    pass\n");
		writeFileSync(join(workDir, "templates/b.py"), "from manim import *\nclass Bar(ThreeDScene):\n    pass\n");

		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "ThreeDScene" });

		expect(getTextOutput(result)).toContain("templates/b.py");
		expect(getTextOutput(result)).toContain("ThreeDScene");
		expect(getTextOutput(result)).not.toContain("templates/a.py");
	});

	it("searches in a subdirectory when path is provided", async () => {
		mkdirSync(join(workDir, "templates"), { recursive: true });
		writeFileSync(join(workDir, "templates/a.py"), "Circle()\n");
		writeFileSync(join(workDir, "other.py"), "Circle()\n");

		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "Circle", path: "templates" });

		expect(getTextOutput(result)).toContain("templates/a.py");
		expect(getTextOutput(result)).not.toContain("other.py");
	});

	it("returns no matches message when pattern not found", async () => {
		writeFileSync(join(workDir, "a.py"), "hello world\n");

		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "nonexistent" });

		expect(getTextOutput(result)).toContain("No matches");
	});

	it("throws error for invalid regex", async () => {
		const tool = getTool("search_files");
		await expect(tool.execute("call-1", { pattern: "[invalid" })).rejects.toThrow(/Invalid regex/);
	});

	it("skips binary files gracefully", async () => {
		writeFileSync(join(workDir, "binary.bin"), Buffer.from([0x00, 0x01, 0x02, 0xff]));
		writeFileSync(join(workDir, "text.py"), "from manim import *\n");

		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "manim" });

		expect(getTextOutput(result)).toContain("text.py");
	});

	it("respects limit parameter", async () => {
		writeFileSync(join(workDir, "multi.txt"), "match one\nmatch two\nmatch three\n");

		const tool = getTool("search_files");
		const result = await tool.execute("call-1", { pattern: "match", limit: 1 });
		const output = getTextOutput(result);

		expect(output).toContain("match one");
		expect(output).not.toContain("match two");
		expect(output).toContain("1 matches limit reached");
	});
});

describe("find_files", () => {
	it("finds files matching a glob pattern", async () => {
		mkdirSync(join(workDir, "templates"), { recursive: true });
		writeFileSync(join(workDir, "templates/basic.py"), "# basic");
		writeFileSync(join(workDir, "templates/3d.py"), "# 3d");
		writeFileSync(join(workDir, "templates/readme.md"), "# readme");

		const tool = getTool("find_files");
		const result = await tool.execute("call-1", { pattern: "**/*.py" });

		expect(getTextOutput(result)).toContain("templates/basic.py");
		expect(getTextOutput(result)).toContain("templates/3d.py");
		expect(getTextOutput(result)).not.toContain("readme.md");
	});

	it("returns no files message when nothing matches", async () => {
		const tool = getTool("find_files");
		const result = await tool.execute("call-1", { pattern: "**/*.xyz" });

		expect(getTextOutput(result)).toContain("No files");
	});

	it("finds files in a subdirectory", async () => {
		mkdirSync(join(workDir, "templates"), { recursive: true });
		mkdirSync(join(workDir, "other"), { recursive: true });
		writeFileSync(join(workDir, "templates/a.py"), "#");
		writeFileSync(join(workDir, "other/b.py"), "#");

		const tool = getTool("find_files");
		const result = await tool.execute("call-1", { pattern: "**/*.py", path: "templates" });

		expect(getTextOutput(result)).toContain("a.py");
		expect(getTextOutput(result)).not.toContain("other");
	});
});
