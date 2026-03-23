import type { AgentTool, AgentToolResult } from "@eureka/agent";
import { Type } from "@eureka/ai";
import { createLogger } from "@eureka/utils/logger";
import { readdir as fsReaddir, stat as fsStat } from "node:fs/promises";
import { join } from "node:path";

const log = createLogger("Tools/Ls");

const DEFAULT_LIMIT = 500;

const lsSchema = Type.Object({
	path: Type.Optional(Type.String({ description: "Relative directory path. Defaults to root of working directory." })),
});

export interface LsToolDetails {
	files: string[];
}

export function createLsTool(resolveSafe: (p: string) => string): AgentTool<typeof lsSchema> {
	return {
		name: "list_files",
		label: "List Files",
		description: `List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Truncated to ${DEFAULT_LIMIT} entries.`,
		parameters: lsSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<LsToolDetails>> => {
			log.debug(`list_files: ${params.path || "."}`);
			const dirPath = resolveSafe(params.path || ".");

			let entries: string[];
			try {
				entries = await fsReaddir(dirPath);
			} catch {
				throw new Error(`Directory not found: ${params.path || "."}`);
			}

			// Sort alphabetically (case-insensitive)
			entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

			// Format entries with directory indicators
			const results: string[] = [];
			let entryLimitReached = false;

			for (const entry of entries) {
				if (results.length >= DEFAULT_LIMIT) {
					entryLimitReached = true;
					break;
				}

				const fullPath = join(dirPath, entry);
				let suffix = "";

				try {
					const entryStat = await fsStat(fullPath);
					if (entryStat.isDirectory()) {
						suffix = "/";
					}
				} catch {
					continue;
				}

				results.push(entry + suffix);
			}

			if (results.length === 0) {
				return {
					content: [{ type: "text", text: "(empty directory)" }],
					details: { files: [] },
				};
			}

			let output = results.join("\n");
			if (entryLimitReached) {
				output += `\n\n[${DEFAULT_LIMIT} entries limit reached]`;
			}

			log.info(`list_files: ${params.path || "."} — ${results.length} entries`);
			return {
				content: [{ type: "text", text: output }],
				details: { files: results },
			};
		},
	};
}
