import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ManimNotFoundError, DependencyError } from "./types.js";

const execFileAsync = promisify(execFile);

export async function checkManimInstalled(): Promise<void> {
	try {
		await execFileAsync("manim", ["--version"]);
	} catch {
		throw new ManimNotFoundError();
	}
}

export async function checkFfmpegInstalled(): Promise<void> {
	try {
		await execFileAsync("ffmpeg", ["-version"]);
	} catch {
		throw new DependencyError("ffmpeg");
	}
}

export async function checkAllDependencies(): Promise<void> {
	await checkManimInstalled();
	await checkFfmpegInstalled();
}
