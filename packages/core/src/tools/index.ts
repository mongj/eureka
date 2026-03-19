import { relative, resolve } from "node:path";
import type { AgentTool } from "@eureka/agent";
import { createEditTool } from "./edit.js";
import { createFindTool } from "./find.js";
import { createLsTool } from "./ls.js";
import { createReadTool } from "./read.js";
import { createRenderTool, type RenderToolConfig } from "./render.js";
import { createSearchTool } from "./search.js";
import { createWriteTool } from "./write.js";

// Tool factory functions and detail types for external consumers
export { createEditTool, type EditToolDetails } from "./edit.js";
export { createFindTool, type FindToolDetails } from "./find.js";
export { createLsTool, type LsToolDetails } from "./ls.js";
export { createReadTool, type ReadToolDetails } from "./read.js";
export { createRenderTool, type RenderToolConfig, type RenderToolDetails } from "./render.js";
export { createSearchTool, type SearchToolDetails } from "./search.js";
export { createWriteTool, type WriteToolDetails } from "./write.js";

export interface ScopedToolsOptions {
	render?: RenderToolConfig;
}

/**
 * Create file system tools scoped to a specific directory.
 * The agent can only read/write within this directory.
 * Optionally includes a render tool if render config is provided.
 */
export function createScopedTools(workDir: string, options?: ScopedToolsOptions): AgentTool<any>[] {
	function resolveSafe(filePath: string): string {
		const resolved = resolve(workDir, filePath);
		const rel = relative(workDir, resolved);
		if (rel.startsWith("..")) {
			throw new Error(`Path "${filePath}" escapes the working directory`);
		}
		return resolved;
	}

	const tools: AgentTool<any>[] = [
		createWriteTool(resolveSafe),
		createReadTool(resolveSafe),
		createEditTool(resolveSafe),
		createLsTool(resolveSafe),
		createSearchTool(workDir, resolveSafe),
		createFindTool(workDir, resolveSafe),
	];

	if (options?.render) {
		tools.push(createRenderTool(resolveSafe, workDir, options.render));
	}

	return tools;
}
