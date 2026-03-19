import { mkdir as fsMkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Type } from "@eureka/ai";
import type { AgentTool, AgentToolResult } from "@eureka/agent";
import { createLogger } from "@eureka/utils/logger";

const log = createLogger("Tools");

const writeSchema = Type.Object({
	path: Type.String({ description: "Relative file path within the working directory (e.g., 'scene.py')" }),
	content: Type.String({ description: "The full file content to write" }),
});

export interface WriteToolDetails {
	path: string;
}

export function createWriteTool(resolveSafe: (p: string) => string): AgentTool<typeof writeSchema> {
	return {
		name: "write_file",
		label: "Write File",
		description:
			"Write content to a file in the working directory. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
		parameters: writeSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<WriteToolDetails>> => {
			log.debug(`write_file: ${params.path} (${params.content.length} bytes)`);
			const fullPath = resolveSafe(params.path);
			const dir = dirname(fullPath);

			await fsMkdir(dir, { recursive: true });
			await fsWriteFile(fullPath, params.content, "utf-8");

			log.info(`write_file: ${params.path} — wrote ${params.content.length} bytes`);
			return {
				content: [{ type: "text", text: `Successfully wrote ${params.content.length} bytes to ${params.path}` }],
				details: { path: fullPath },
			};
		},
	};
}
