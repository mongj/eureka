import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { Type } from "@eureka/ai";
import type { AgentTool, AgentToolResult } from "@eureka/agent";

const MAX_READ_LINES = 1500;
const MAX_READ_BYTES = 100_000; // 100KB
const MAX_SEARCH_RESULTS = 100;

/**
 * Create file system tools scoped to a specific directory.
 * The agent can only read/write within this directory.
 */
export function createScopedTools(workDir: string): AgentTool<any>[] {
	function resolveSafe(filePath: string): string {
		const resolved = resolve(workDir, filePath);
		const rel = relative(workDir, resolved);
		if (rel.startsWith("..") || resolve(resolved) !== resolved.replace(/\/$/, "")) {
			throw new Error(`Path "${filePath}" escapes the working directory`);
		}
		return resolved;
	}

	const writeFileTool: AgentTool<any> = {
		name: "write_file",
		label: "Write File",
		description:
			"Write content to a file in the working directory. Creates parent directories if needed. Use this to write your manim scene code to a .py file.",
		parameters: Type.Object({
			path: Type.String({ description: "Relative file path within the working directory (e.g., 'scene.py')" }),
			content: Type.String({ description: "The full file content to write" }),
		}),
		execute: async (_toolCallId, params): Promise<AgentToolResult<{ path: string }>> => {
			const fullPath = resolveSafe(params.path);
			const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
			if (dir) await mkdir(dir, { recursive: true });
			await writeFile(fullPath, params.content, "utf-8");
			return {
				content: [{ type: "text", text: `Wrote ${params.content.length} bytes to ${params.path}` }],
				details: { path: fullPath },
			};
		},
	};

	const readFileTool: AgentTool<any> = {
		name: "read_file",
		label: "Read File",
		description: "Read the contents of a file in the working directory.",
		parameters: Type.Object({
			path: Type.String({ description: "Relative file path within the working directory" }),
		}),
		execute: async (_toolCallId, params): Promise<AgentToolResult<{ path: string }>> => {
			const fullPath = resolveSafe(params.path);
			let content: string;
			try {
				content = await readFile(fullPath, "utf-8");
			} catch {
				return {
					content: [{ type: "text", text: `Error: File "${params.path}" not found.` }],
					details: { path: fullPath },
				};
			}

			// Truncate by bytes
			if (content.length > MAX_READ_BYTES) {
				content = content.slice(0, MAX_READ_BYTES);
				return {
					content: [{ type: "text", text: content + `\n\n(truncated at ${MAX_READ_BYTES / 1000}KB)` }],
					details: { path: fullPath },
				};
			}

			// Truncate by lines
			const lines = content.split("\n");
			if (lines.length > MAX_READ_LINES) {
				const truncated = lines.slice(0, MAX_READ_LINES).join("\n");
				return {
					content: [
						{ type: "text", text: truncated + `\n\n(truncated at ${MAX_READ_LINES} of ${lines.length} lines)` },
					],
					details: { path: fullPath },
				};
			}

			return {
				content: [{ type: "text", text: content }],
				details: { path: fullPath },
			};
		},
	};

	const editFileTool: AgentTool<any> = {
		name: "edit_file",
		label: "Edit File",
		description:
			"Make a surgical text replacement in a file. Provide the exact string to find (old_string) and its replacement (new_string). The old_string must appear exactly once in the file.",
		parameters: Type.Object({
			path: Type.String({ description: "Relative file path within the working directory" }),
			old_string: Type.String({ description: "The exact text to find (must be unique in the file)" }),
			new_string: Type.String({ description: "The text to replace it with" }),
		}),
		execute: async (_toolCallId, params): Promise<AgentToolResult<{ path: string }>> => {
			const fullPath = resolveSafe(params.path);
			let content: string;
			try {
				content = await readFile(fullPath, "utf-8");
			} catch {
				return {
					content: [{ type: "text", text: `Error: File "${params.path}" not found.` }],
					details: { path: fullPath },
				};
			}

			const occurrences = content.split(params.old_string).length - 1;
			if (occurrences === 0) {
				return {
					content: [
						{
							type: "text",
							text: `Error: old_string not found in file "${params.path}". Make sure the string matches exactly, including whitespace.`,
						},
					],
					details: { path: fullPath },
				};
			}
			if (occurrences > 1) {
				return {
					content: [
						{
							type: "text",
							text: `Error: old_string found ${occurrences} times in "${params.path}". Provide a larger, unique snippet to match exactly once.`,
						},
					],
					details: { path: fullPath },
				};
			}

			const updated = content.replace(params.old_string, params.new_string);
			await writeFile(fullPath, updated, "utf-8");
			return {
				content: [{ type: "text", text: `Applied edit to ${params.path}` }],
				details: { path: fullPath },
			};
		},
	};

	const listFilesTool: AgentTool<any> = {
		name: "list_files",
		label: "List Files",
		description: "List files in a directory within the working directory.",
		parameters: Type.Object({
			path: Type.Optional(
				Type.String({ description: "Relative directory path. Defaults to root of working directory." }),
			),
		}),
		execute: async (_toolCallId, params): Promise<AgentToolResult<{ files: string[] }>> => {
			const dirPath = resolveSafe(params.path || ".");
			let entries;
			try {
				entries = await readdir(dirPath, { withFileTypes: true });
			} catch {
				return {
					content: [{ type: "text", text: `Error: Directory "${params.path || "."}" not found.` }],
					details: { files: [] },
				};
			}
			const files = entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
			return {
				content: [{ type: "text", text: files.join("\n") || "(empty directory)" }],
				details: { files },
			};
		},
	};

	const searchFilesTool: AgentTool<any> = {
		name: "search_files",
		label: "Search Files",
		description:
			"Search file contents using a regex pattern. Returns matching lines with file paths and line numbers. Useful for finding relevant templates or code patterns.",
		parameters: Type.Object({
			pattern: Type.String({ description: "Regex pattern to search for (e.g., 'ThreeDScene', 'Circle\\(.*\\)')" }),
			path: Type.Optional(
				Type.String({ description: "Relative directory to search in. Defaults to entire working directory." }),
			),
		}),
		execute: async (
			_toolCallId,
			params,
		): Promise<AgentToolResult<{ matches: Array<{ file: string; line: number; text: string }> }>> => {
			let regex: RegExp;
			try {
				regex = new RegExp(params.pattern);
			} catch (e) {
				return {
					content: [{ type: "text", text: `Invalid regex pattern: ${(e as Error).message}` }],
					details: { matches: [] },
				};
			}

			const searchDir = resolveSafe(params.path || ".");
			const matches: Array<{ file: string; line: number; text: string }> = [];

			async function searchRecursive(dir: string): Promise<void> {
				const entries = await readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = join(dir, entry.name);
					if (entry.isDirectory()) {
						await searchRecursive(fullPath);
					} else if (entry.isFile()) {
						try {
							const content = await readFile(fullPath, "utf-8");
							// Skip likely binary files (contains null bytes)
							if (content.includes("\0")) continue;
							const lines = content.split("\n");
							for (let i = 0; i < lines.length; i++) {
								if (regex.test(lines[i])) {
									const relPath = relative(workDir, fullPath);
									matches.push({ file: relPath, line: i + 1, text: lines[i] });
								}
							}
						} catch {
							// Skip files that can't be read
						}
					}
				}
			}

			await searchRecursive(searchDir);

			if (matches.length === 0) {
				return {
					content: [{ type: "text", text: `No matches found for pattern "${params.pattern}"` }],
					details: { matches },
				};
			}

			const truncated = matches.length > MAX_SEARCH_RESULTS;
			const shown = truncated ? matches.slice(0, MAX_SEARCH_RESULTS) : matches;
			let output = shown.map((m) => `${m.file}:${m.line}: ${m.text}`).join("\n");
			if (truncated) {
				output += `\n\n(showing first ${MAX_SEARCH_RESULTS} of ${matches.length} matches)`;
			}
			return {
				content: [{ type: "text", text: output }],
				details: { matches: shown },
			};
		},
	};

	const findFilesTool: AgentTool<any> = {
		name: "find_files",
		label: "Find Files",
		description:
			"Find files by name pattern using glob matching. Use this to discover available templates and files. Supports patterns like '**/*.py', 'templates/*.py', '*.md'.",
		parameters: Type.Object({
			pattern: Type.String({ description: "Glob pattern to match (e.g., '**/*.py', 'templates/*.py')" }),
			path: Type.Optional(
				Type.String({ description: "Relative directory to search in. Defaults to entire working directory." }),
			),
		}),
		execute: async (_toolCallId, params): Promise<AgentToolResult<{ files: string[] }>> => {
			const searchDir = resolveSafe(params.path || ".");
			const collected: Array<{ relToSearch: string; relToWork: string }> = [];

			async function collectFiles(dir: string): Promise<void> {
				const entries = await readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = join(dir, entry.name);
					if (entry.isDirectory()) {
						await collectFiles(fullPath);
					} else {
						collected.push({
							relToSearch: relative(searchDir, fullPath),
							relToWork: relative(workDir, fullPath),
						});
					}
				}
			}

			await collectFiles(searchDir);

			// Simple glob matching: convert glob to regex
			function globToRegex(glob: string): RegExp {
				let reStr = "";
				let i = 0;
				while (i < glob.length) {
					if (glob[i] === "*" && glob[i + 1] === "*") {
						if (glob[i + 2] === "/") {
							reStr += "(?:.*/)?"; // **/ = zero or more directories
							i += 3;
						} else {
							reStr += ".*"; // ** = match anything
							i += 2;
						}
					} else if (glob[i] === "*") {
						reStr += "[^/]*"; // * = match within segment
						i++;
					} else if (glob[i] === "?") {
						reStr += "[^/]"; // ? = single non-separator char
						i++;
					} else if (".+^${}()|[]\\".includes(glob[i])) {
						reStr += "\\" + glob[i]; // escape regex special
						i++;
					} else {
						reStr += glob[i];
						i++;
					}
				}
				return new RegExp(`^${reStr}$`);
			}

			const regex = globToRegex(params.pattern);
			// Match against path relative to search dir, but output path relative to workDir
			const matched = collected.filter((f) => regex.test(f.relToSearch)).map((f) => f.relToWork);

			if (matched.length === 0) {
				return {
					content: [{ type: "text", text: `No files found matching pattern "${params.pattern}"` }],
					details: { files: [] },
				};
			}

			return {
				content: [{ type: "text", text: matched.join("\n") }],
				details: { files: matched },
			};
		},
	};

	return [writeFileTool, readFileTool, editFileTool, listFilesTool, searchFilesTool, findFilesTool];
}
