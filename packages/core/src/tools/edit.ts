import { readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import { Type } from "@eureka/ai";
import type { AgentTool, AgentToolResult } from "@eureka/agent";
import { createLogger } from "@eureka/utils/logger";
import {
	detectLineEnding,
	fuzzyFindText,
	generateDiffString,
	normalizeForFuzzyMatch,
	normalizeToLF,
	restoreLineEndings,
	stripBom,
} from "./edit-diff.js";

const log = createLogger("Tools");

const editSchema = Type.Object({
	path: Type.String({ description: "Relative file path within the working directory" }),
	old_string: Type.String({ description: "Exact text to find and replace (must match exactly)" }),
	new_string: Type.String({ description: "New text to replace the old text with" }),
});

export interface EditToolDetails {
	path: string;
	/** Unified diff of the changes made */
	diff?: string;
	/** Line number of the first change in the new file */
	firstChangedLine?: number;
}

export function createEditTool(resolveSafe: (p: string) => string): AgentTool<typeof editSchema> {
	return {
		name: "edit_file",
		label: "Edit File",
		description:
			"Edit a file by replacing exact text. The old_string must match exactly (including whitespace). Use this for precise, surgical edits.",
		parameters: editSchema,
		execute: async (_toolCallId, params): Promise<AgentToolResult<EditToolDetails>> => {
			log.debug(
				`edit_file: ${params.path} (old_string: ${params.old_string.length} chars, new_string: ${params.new_string.length} chars)`,
			);
			const fullPath = resolveSafe(params.path);

			let rawContent: string;
			try {
				rawContent = (await fsReadFile(fullPath)).toString("utf-8");
			} catch {
				throw new Error(`File not found: ${params.path}`);
			}

			// Strip BOM before matching (LLM won't include invisible BOM in old_string)
			const { bom, text: content } = stripBom(rawContent);

			const originalEnding = detectLineEnding(content);
			const normalizedContent = normalizeToLF(content);
			const normalizedOldText = normalizeToLF(params.old_string);
			const normalizedNewText = normalizeToLF(params.new_string);

			// Find the old text using fuzzy matching (tries exact match first, then fuzzy)
			const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);

			if (!matchResult.found) {
				throw new Error(
					`Could not find the exact text in ${params.path}. The old_string must match exactly including all whitespace and newlines.`,
				);
			}

			// Count occurrences using fuzzy-normalized content for consistency
			const fuzzyContent = normalizeForFuzzyMatch(normalizedContent);
			const fuzzyOldText = normalizeForFuzzyMatch(normalizedOldText);
			const occurrences = fuzzyContent.split(fuzzyOldText).length - 1;

			if (occurrences > 1) {
				throw new Error(
					`Found ${occurrences} occurrences of the text in ${params.path}. Provide a larger, unique snippet to match exactly once.`,
				);
			}

			// Perform replacement using the matched text position.
			// Note: when fuzzy matching is used, contentForReplacement is the NFKC-normalized
			// version of the file, so trailing whitespace and smart quotes outside the match
			// region are also normalized. This matches the reference implementation behavior
			// and is acceptable for agent-generated sandbox files.
			const baseContent = matchResult.contentForReplacement;
			const newContent =
				baseContent.substring(0, matchResult.index) +
				normalizedNewText +
				baseContent.substring(matchResult.index + matchResult.matchLength);

			// Verify the replacement actually changed something
			if (baseContent === newContent) {
				throw new Error(`No changes made to ${params.path}. The replacement produced identical content.`);
			}

			const finalContent = bom + restoreLineEndings(newContent, originalEnding);
			await fsWriteFile(fullPath, finalContent, "utf-8");

			const diffResult = generateDiffString(baseContent, newContent);

			log.info(
				`edit_file: ${params.path} — replaced${matchResult.usedFuzzyMatch ? " (fuzzy match)" : ""} at line ${diffResult.firstChangedLine ?? "?"}`,
			);
			return {
				content: [{ type: "text", text: `Successfully replaced text in ${params.path}.` }],
				details: { path: fullPath, diff: diffResult.diff, firstChangedLine: diffResult.firstChangedLine },
			};
		},
	};
}
