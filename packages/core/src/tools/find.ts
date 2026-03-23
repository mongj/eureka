import type { AgentTool, AgentToolResult } from "@eureka/agent";
import { Type } from "@eureka/ai";
import { createLogger } from "@eureka/utils/logger";
import { relative } from "node:path";
import { truncateHead } from "./truncate.js";
import { walkFiles } from "./walk.js";

const log = createLogger("Tools/Find");

const DEFAULT_LIMIT = 1000;

const findSchema = Type.Object({
	pattern: Type.String({ description: "Glob pattern to match (e.g., '**/*.py', 'templates/*.py')" }),
	path: Type.Optional(
		Type.String({ description: "Relative directory to search in. Defaults to entire working directory." }),
	),
	limit: Type.Optional(Type.Number({ description: "Maximum number of results (default: 1000)" })),
});

export interface FindToolDetails {
	files: string[];
}

/**
 * Convert a glob pattern to a regex.
 * Supports **, *, ? patterns. Does not support [...] character classes.
 */
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

export function createFindTool(workDir: string, resolveSafe: (p: string) => string): AgentTool<typeof findSchema> {
	return {
		name: "find_files",
		label: "Find Files",
		description: `Search for files by glob pattern. Returns matching file paths relative to the working directory. Truncated to ${DEFAULT_LIMIT} results.`,
		parameters: findSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<FindToolDetails>> => {
			log.debug(`find_files: pattern="${params.pattern}"${params.path ? ` path=${params.path}` : ""}`);
			const searchDir = resolveSafe(params.path || ".");
			const effectiveLimit = params.limit ?? DEFAULT_LIMIT;
			const regex = globToRegex(params.pattern);
			const matched: string[] = [];

			await walkFiles(searchDir, async (fullPath) => {
				if (matched.length >= effectiveLimit) return;
				const relToSearch = relative(searchDir, fullPath);
				if (regex.test(relToSearch)) {
					matched.push(relative(workDir, fullPath));
				}
			});

			if (matched.length === 0) {
				return {
					content: [{ type: "text", text: "No files found matching pattern" }],
					details: { files: [] },
				};
			}

			const resultLimitReached = matched.length >= effectiveLimit;
			const rawOutput = matched.join("\n");
			const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });

			let output = truncation.content;
			const notices: string[] = [];

			if (resultLimitReached) {
				notices.push(`${effectiveLimit} results limit reached`);
			}
			if (truncation.truncated) {
				notices.push("Output truncated due to size limit");
			}

			if (notices.length > 0) {
				output += `\n\n[${notices.join(". ")}]`;
			}

			log.info(`find_files: pattern="${params.pattern}" — ${matched.length} files`);
			return {
				content: [{ type: "text", text: output }],
				details: { files: matched },
			};
		},
	};
}
