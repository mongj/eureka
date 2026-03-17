#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import type { GenerateOptions, GenerateResult, ManimQuality } from "./src/types.js";

const VALID_QUALITIES = new Set<ManimQuality>(["low", "medium", "high", "fourk"]);

export type CliParseResult =
	| {
			help: true;
	  }
	| {
			prompt: string;
			options: GenerateOptions;
	  };

type GenerateVideoFn = (prompt: string, options?: GenerateOptions) => Promise<GenerateResult>;

interface CliDependencies {
	generateVideo?: GenerateVideoFn;
	stdout?: (line: string) => void;
	stderr?: (line: string) => void;
}

function getFlagValue(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for "${flag}"`);
	}
	return value;
}

async function loadGenerateVideo(): Promise<GenerateVideoFn> {
	const module = await import(new URL("./index.js", import.meta.url).href);
	return module.generateVideo as GenerateVideoFn;
}

export function printHelp(): string {
	return [
		"Usage: eureka-core [options] <prompt>",
		"",
		"Options:",
		"  --quality <low|medium|high|fourk>  Render quality",
		"  --model <provider/model-id>         Model override",
		"  --render-timeout-ms <number>        Render timeout in milliseconds",
		"  --keep-artifacts                    Keep generated temp files",
		"  --help                              Show this help message",
	].join("\n");
}

export function parseCliArgs(args: string[]): CliParseResult {
	const positionals: string[] = [];
	const options: GenerateOptions = {};
	let parsingFlags = true;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (parsingFlags && (arg === "--help" || arg === "-h")) {
			return { help: true };
		}

		if (parsingFlags && arg === "--") {
			parsingFlags = false;
			continue;
		}

		if (parsingFlags && arg === "--quality") {
			const value = getFlagValue(args, i, arg);
			if (!VALID_QUALITIES.has(value as ManimQuality)) {
				throw new Error(`"--quality" must be one of: ${[...VALID_QUALITIES].join(", ")}`);
			}
			options.quality = value as ManimQuality;
			i++;
			continue;
		}

		if (parsingFlags && arg === "--model") {
			options.model = getFlagValue(args, i, arg);
			i++;
			continue;
		}

		if (parsingFlags && arg === "--render-timeout-ms") {
			const value = getFlagValue(args, i, arg);
			if (!/^[1-9]\d*$/.test(value)) {
				throw new Error('"--render-timeout-ms" must be a positive integer');
			}
			options.renderTimeoutMs = Number.parseInt(value, 10);
			i++;
			continue;
		}

		if (parsingFlags && arg === "--keep-artifacts") {
			options.keepArtifacts = true;
			continue;
		}

		if (parsingFlags && arg.startsWith("--")) {
			throw new Error(`Unknown option: "${arg}"`);
		}

		positionals.push(arg);
	}

	const prompt = positionals.join(" ").trim();
	if (!prompt) {
		throw new Error("Prompt is required");
	}

	return { prompt, options };
}

export async function runCli(argv: string[], dependencies: CliDependencies = {}): Promise<number> {
	const stdout = dependencies.stdout ?? console.log;
	const stderr = dependencies.stderr ?? console.error;

	try {
		const parsed = parseCliArgs(argv);
		if ("help" in parsed) {
			stdout(printHelp());
			return 0;
		}

		const runGenerateVideo = dependencies.generateVideo ?? (await loadGenerateVideo());

		stdout(`[eureka] Prompt: ${parsed.prompt}`);
		stdout("[eureka] Generating video...");

		const result = await runGenerateVideo(parsed.prompt, parsed.options);

		stdout(`[eureka] Video: ${result.videoPath}`);
		stdout(`[eureka] Scene: ${result.sceneName}`);
		stdout(`[eureka] Generate: ${result.generateDurationMs}ms`);
		stdout(`[eureka] Render: ${result.renderDurationMs}ms`);

		if (result.artifactsDir) {
			stdout(`[eureka] Artifacts: ${result.artifactsDir}`);
		}

		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		stderr(`[eureka] Error: ${message}`);
		return 1;
	}
}

async function main(): Promise<void> {
	const exitCode = await runCli(process.argv.slice(2));
	process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	void main();
}
