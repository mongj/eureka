import { relative, resolve } from "node:path";
import type { AgentTool } from "@eureka/agent";
import { createEditTool } from "./edit.js";
import { createFindTool } from "./find.js";
import { createLsTool } from "./ls.js";
import { createReadTool } from "./read.js";
import { createSearchTool } from "./search.js";
import { createWriteTool } from "./write.js";

// Tool factory functions and detail types for external consumers
export { createEditTool, type EditToolDetails } from "./edit.js";
export { createFindTool, type FindToolDetails } from "./find.js";
export { createLsTool, type LsToolDetails } from "./ls.js";
export { createReadTool, type ReadToolDetails } from "./read.js";
export { createSearchTool, type SearchToolDetails } from "./search.js";
export { createWriteTool, type WriteToolDetails } from "./write.js";

/**
 * Create file system tools scoped to a specific directory.
 * The agent can only read/write within this directory.
 */
export function createScopedTools(workDir: string): AgentTool<any>[] {
	function resolveSafe(filePath: string): string {
		const resolved = resolve(workDir, filePath);
		const rel = relative(workDir, resolved);
		if (rel.startsWith("..")) {
			throw new Error(`Path "${filePath}" escapes the working directory`);
		}
		return resolved;
	}

	return [
		createWriteTool(resolveSafe),
		createReadTool(resolveSafe),
		createEditTool(resolveSafe),
		createLsTool(resolveSafe),
		createSearchTool(workDir, resolveSafe),
		createFindTool(workDir, resolveSafe),
	];
}
