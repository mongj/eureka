#!/usr/bin/env node
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { createLogger } from "@eureka/utils/logger";
import { generateVideo } from "./src/index.js";
import type { GenerateOptions, ManimQuality } from "./src/types.js";

const log = createLogger("CLI");

const VALID_QUALITIES = new Set<ManimQuality>(["low", "medium", "high", "fourk"]);

export type CliParseResult =
	| {
			help: true;
	  }
	| {
			prompt: string;
			options: GenerateOptions;
	  };

function getFlagValue(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for "${flag}"`);
	}
	return value;
}

export function printHelp(): string {
	return [
		"Usage: eureka [options] <prompt>",
		"",
		"Options:",
		"  --quality <low|medium|high|fourk>  Render quality",
		"  --model <provider/model-id>         Model override",
		"  --render-timeout-ms <number>        Render timeout in milliseconds",
		"  --mode <default|snippet|image>      Generation mode",
		"  --title <text>                      Title for image mode",
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

		if (parsingFlags && arg === "--mode") {
			const value = getFlagValue(args, i, arg);
			const validModes = new Set(["default", "snippet", "image"]);
			if (!validModes.has(value)) {
				throw new Error(`"--mode" must be one of: ${[...validModes].join(", ")}`);
			}
			options.mode = value as GenerateOptions["mode"];
			i++;
			continue;
		}

		if (parsingFlags && arg === "--title") {
			options.title = getFlagValue(args, i, arg);
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

export async function runCli(argv: string[]): Promise<number> {
	try {
		const parsed = parseCliArgs(argv);
		if ("help" in parsed) {
			console.log(printHelp());
			return 0;
		}
		log.info(`Prompt: ${parsed.prompt}`);
		log.info("Generating video...");

		const result = await generateVideo(parsed.prompt, parsed.options);

		log.info(`Output: ${result.outputPath ?? "render failed"}`);
		log.info(`Scene: ${result.sceneName}`);
		log.info(`Duration: ${result.durationMs}ms`);

		if (result.artifactsDir) {
			log.info(`Artifacts: ${result.artifactsDir}`);
		}

		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.error(message);
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
