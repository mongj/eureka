import { readFile as fsReadFile } from "node:fs/promises";
import { Type } from "@eureka/ai";
import type { AgentTool, AgentToolResult } from "@eureka/agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type TruncationResult, truncateHead } from "./truncate.js";

const readSchema = Type.Object({
	path: Type.String({ description: "Relative file path within the working directory" }),
	offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

export interface ReadToolDetails {
	path: string;
	truncation?: TruncationResult;
}

export function createReadTool(resolveSafe: (p: string) => string): AgentTool<typeof readSchema> {
	return {
		name: "read_file",
		label: "Read File",
		description: `Read the contents of a file in the working directory. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files.`,
		parameters: readSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<ReadToolDetails>> => {
			const fullPath = resolveSafe(params.path);

			let buffer: Buffer;
			try {
				buffer = await fsReadFile(fullPath);
			} catch {
				throw new Error(`File not found: ${params.path}`);
			}

			const textContent = buffer.toString("utf-8");
			const allLines = textContent.split("\n");
			const totalFileLines = allLines.length;

			// Apply offset if specified (1-indexed to 0-indexed)
			const startLine = params.offset ? Math.max(0, params.offset - 1) : 0;
			const startLineDisplay = startLine + 1;

			// Check if offset is out of bounds
			if (startLine >= allLines.length) {
				throw new Error(`Offset ${params.offset} is beyond end of file (${allLines.length} lines total)`);
			}

			// If limit is specified by user, use it; otherwise let truncateHead decide
			let selectedContent: string;
			let userLimitedLines: number | undefined;
			if (params.limit !== undefined) {
				const endLine = Math.min(startLine + params.limit, allLines.length);
				selectedContent = allLines.slice(startLine, endLine).join("\n");
				userLimitedLines = endLine - startLine;
			} else {
				selectedContent = allLines.slice(startLine).join("\n");
			}

			// Apply truncation (respects both line and byte limits)
			const truncation = truncateHead(selectedContent);

			let outputText: string;
			let details: ReadToolDetails = { path: fullPath };

			if (truncation.firstLineExceedsLimit) {
				const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine], "utf-8"));
				outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit.]`;
				details.truncation = truncation;
			} else if (truncation.truncated) {
				const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
				const nextOffset = endLineDisplay + 1;

				outputText = truncation.content;

				if (truncation.truncatedBy === "lines") {
					outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
				} else {
					outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
				}
				details.truncation = truncation;
			} else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
				const remaining = allLines.length - (startLine + userLimitedLines);
				const nextOffset = startLine + userLimitedLines + 1;

				outputText = truncation.content;
				outputText += `\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
			} else {
				outputText = truncation.content;
			}

			return {
				content: [{ type: "text", text: outputText }],
				details,
			};
		},
	};
}
