import { readFile as fsReadFile } from "node:fs/promises";
import { relative } from "node:path";
import { Type } from "@eureka/ai";
import type { AgentTool, AgentToolResult } from "@eureka/agent";
import { createLogger } from "@eureka/utils/logger";
import { truncateHead, truncateLine } from "./truncate.js";
import { walkFiles } from "./walk.js";

const log = createLogger("Tools");

const DEFAULT_LIMIT = 100;

const searchSchema = Type.Object({
	pattern: Type.String({ description: "Regex pattern to search for (e.g., 'ThreeDScene', 'Circle\\\\(.*\\\\)')" }),
	path: Type.Optional(
		Type.String({ description: "Relative directory to search in. Defaults to entire working directory." }),
	),
	limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return (default: 100)" })),
});

export interface SearchToolDetails {
	matches: Array<{ file: string; line: number; text: string }>;
}

export function createSearchTool(workDir: string, resolveSafe: (p: string) => string): AgentTool<typeof searchSchema> {
	return {
		name: "search_files",
		label: "Search Files",
		description: `Search file contents using a regex pattern. Returns matching lines with file paths and line numbers. Truncated to ${DEFAULT_LIMIT} matches.`,
		parameters: searchSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<SearchToolDetails>> => {
			log.debug(`search_files: pattern="${params.pattern}"${params.path ? ` path=${params.path}` : ""}`);
			let regex: RegExp;
			try {
				regex = new RegExp(params.pattern);
			} catch (e) {
				throw new Error(`Invalid regex pattern: ${(e as Error).message}`);
			}

			const searchDir = resolveSafe(params.path || ".");
			const effectiveLimit = Math.max(1, params.limit ?? DEFAULT_LIMIT);
			const matches: Array<{ file: string; line: number; text: string }> = [];
			let linesTruncated = false;

			await walkFiles(searchDir, async (fullPath) => {
				if (matches.length >= effectiveLimit) return;
				try {
					const content = await fsReadFile(fullPath, "utf-8");
					if (content.includes("\0")) return; // skip binary
					const lines = content.split("\n");
					for (let i = 0; i < lines.length; i++) {
						if (regex.test(lines[i])) {
							const { text, wasTruncated } = truncateLine(lines[i]);
							if (wasTruncated) linesTruncated = true;
							matches.push({ file: relative(workDir, fullPath), line: i + 1, text });
							if (matches.length >= effectiveLimit) return;
						}
					}
				} catch {
					// Skip files that can't be read
				}
			});

			if (matches.length === 0) {
				return {
					content: [{ type: "text", text: "No matches found" }],
					details: { matches },
				};
			}

			const matchLimitReached = matches.length >= effectiveLimit;
			const rawOutput = matches.map((m) => `${m.file}:${m.line}: ${m.text}`).join("\n");

			// Apply byte truncation
			const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });
			let output = truncation.content;

			const notices: string[] = [];
			if (matchLimitReached) {
				notices.push(
					`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
				);
			}
			if (truncation.truncated) {
				notices.push("Output truncated due to size limit");
			}
			if (linesTruncated) {
				notices.push("Some lines truncated. Use read_file to see full lines");
			}

			if (notices.length > 0) {
				output += `\n\n[${notices.join(". ")}]`;
			}

			log.info(`search_files: pattern="${params.pattern}" — ${matches.length} matches`);
			return {
				content: [{ type: "text", text: output }],
				details: { matches },
			};
		},
	};
}
