import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { Type } from "@eureka/ai";
import type { AgentTool, AgentToolResult } from "@eureka/agent";

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
		description: "Write content to a file in the working directory. Creates parent directories if needed. Use this to write your manim scene code to a .py file.",
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
			const content = await readFile(fullPath, "utf-8");
			return {
				content: [{ type: "text", text: content }],
				details: { path: fullPath },
			};
		},
	};

	const listFilesTool: AgentTool<any> = {
		name: "list_files",
		label: "List Files",
		description: "List files in a directory within the working directory.",
		parameters: Type.Object({
			path: Type.Optional(Type.String({ description: "Relative directory path. Defaults to root of working directory." })),
		}),
		execute: async (_toolCallId, params): Promise<AgentToolResult<{ files: string[] }>> => {
			const dirPath = resolveSafe(params.path || ".");
			const entries = await readdir(dirPath, { withFileTypes: true });
			const files = entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
			return {
				content: [{ type: "text", text: files.join("\n") || "(empty directory)" }],
				details: { files },
			};
		},
	};

	return [writeFileTool, readFileTool, listFilesTool];
}
