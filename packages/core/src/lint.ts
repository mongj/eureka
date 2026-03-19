import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createLogger } from "@eureka/utils/logger";
import type { LintViolation } from "./types.js";

const execFileAsync = promisify(execFile);
const log = createLogger("Lint");

/** Default timeout for fixit subprocess (5 seconds — generous for single-file lint). */
const FIXIT_TIMEOUT_MS = 5_000;

/**
 * Parse fixit CLI stdout into structured violations.
 *
 * Fixit output format per violation:
 *   <path>@<line>:<col> <RuleName>: <message> [(has autofix)]
 *
 * Syntax errors appear as:
 *   <path>: EXCEPTION: Syntax Error @ <line>:<col>.
 */
export function parseLintOutput(output: string): LintViolation[] {
	if (!output.trim()) return [];

	const violations: LintViolation[] = [];

	// Match syntax error exceptions
	const syntaxMatch = output.match(/EXCEPTION: Syntax Error @ (\d+):(\d+)/);
	if (syntaxMatch) {
		const errorLines = output.split("\n").filter((l) => !l.startsWith("🛠️") && !l.startsWith("🧼") && l.trim());
		violations.push({
			rule: "SyntaxError",
			line: parseInt(syntaxMatch[1], 10),
			col: parseInt(syntaxMatch[2], 10),
			message: errorLines.join("\n").trim(),
			hasAutofix: false,
		});
		return violations;
	}

	// Match normal violation lines: path@line:col RuleName: message [(has autofix)]
	const violationPattern = /@(\d+):(\d+)\s+(\w+):\s+(.+?)(?:\s+\(has autofix\))?\s*$/;

	for (const line of output.split("\n")) {
		// Skip summary lines (emoji lines)
		if (line.startsWith("🛠️") || line.startsWith("🧼") || !line.trim()) continue;

		const match = line.match(violationPattern);
		if (match) {
			violations.push({
				rule: match[3],
				line: parseInt(match[1], 10),
				col: parseInt(match[2], 10),
				message: match[4].replace(/\s+\(has autofix\)$/, ""),
				hasAutofix: line.includes("(has autofix)"),
			});
		}
	}

	return violations;
}

export interface LintResult {
	/** True if no violations remain after autofix */
	passed: boolean;
	/** Remaining violations that could not be auto-fixed */
	violations: LintViolation[];
	/** True if fixit fix modified the file */
	autofixApplied: boolean;
	/** Number of issues auto-fixed */
	autofixCount: number;
}

/**
 * Run fixit lint + autofix on a Python file.
 *
 * Phase 1: `fixit fix --automatic` — silently fixes what it can (edits file in-place).
 * Phase 2: `fixit lint` — checks for remaining violations.
 *
 * If fixit itself crashes or times out, returns a passing result (graceful degradation).
 * The lint step is an optimization, not a gate — manim will catch errors fixit misses.
 */
export async function lintManimCode(filePath: string, workDir: string): Promise<LintResult> {
	const codeBefore = await readFile(filePath, "utf-8");

	// Phase 1: Autofix
	let autofixApplied = false;
	let autofixCount = 0;
	try {
		const { stderr } = await execFileAsync("fixit", ["fix", "--automatic", filePath], {
			cwd: workDir,
			timeout: FIXIT_TIMEOUT_MS,
		});

		// Check if file was modified
		const codeAfter = await readFile(filePath, "utf-8");
		autofixApplied = codeBefore !== codeAfter;

		// Count fixes from stderr summary: "N fix(es) applied"
		if (stderr) {
			const countMatch = stderr.match(/(\d+)\s+fix(?:es)?\s+applied/);
			autofixCount = countMatch ? parseInt(countMatch[1], 10) : autofixApplied ? 1 : 0;
		}

		if (autofixApplied) {
			log.info(`lint: autofix applied ${autofixCount} change(s) to ${filePath}`);
		}
	} catch (error) {
		// Fixit fix crashed or timed out — log and continue to lint phase
		const msg = error instanceof Error ? error.message : String(error);
		log.warn(`lint: fixit fix failed (${msg}), skipping autofix`);
	}

	// Phase 2: Lint check
	try {
		const { stdout } = await execFileAsync("fixit", ["lint", filePath], {
			cwd: workDir,
			timeout: FIXIT_TIMEOUT_MS,
		});

		// Exit 0 = clean
		const violations = parseLintOutput(stdout);
		if (violations.length === 0) {
			log.info("lint: clean — 0 violations");
		}
		return { passed: violations.length === 0, violations, autofixApplied, autofixCount };
	} catch (error: any) {
		// execFileAsync throws on non-zero exit codes
		if (error.stdout) {
			// Exit 1 or 2 — fixit found violations or syntax errors
			const violations = parseLintOutput(error.stdout);
			log.warn(`lint: ${violations.length} violation(s) found`);
			return { passed: false, violations, autofixApplied, autofixCount };
		}

		// Fixit itself crashed — degrade gracefully
		const msg = error instanceof Error ? error.message : String(error);
		log.warn(`lint: fixit lint failed (${msg}), skipping lint`);
		return { passed: true, violations: [], autofixApplied, autofixCount };
	}
}
