// ============================================================
// Error hierarchy
// ============================================================

export class EurekaError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "EurekaError";
	}
}

export class InvalidPromptError extends EurekaError {
	constructor(message = "Prompt must be a non-empty string") {
		super(message);
		this.name = "InvalidPromptError";
	}
}

export class NoCodeGeneratedError extends EurekaError {
	/** The raw LLM response that didn't contain extractable code */
	rawResponse: string;
	constructor(rawResponse: string) {
		super("LLM did not generate extractable Manim code");
		this.name = "NoCodeGeneratedError";
		this.rawResponse = rawResponse;
	}
}

export class InvalidModelError extends EurekaError {
	model: string;
	constructor(model: string, message?: string) {
		super(message ?? `Invalid or unknown model: "${model}"`);
		this.name = "InvalidModelError";
		this.model = model;
	}
}

export class ManimNotFoundError extends EurekaError {
	constructor() {
		super("manim is not installed or not in PATH. Install with: pip install manim");
		this.name = "ManimNotFoundError";
	}
}

export class DependencyError extends EurekaError {
	dependency: string;
	constructor(dependency: string) {
		super(`Required dependency not found: ${dependency}`);
		this.name = "DependencyError";
		this.dependency = dependency;
	}
}

export class RenderError extends EurekaError {
	/** stderr output from the manim process */
	stderr: string;
	/** The python code that failed to render */
	code: string;
	constructor(message: string, code: string, stderr: string) {
		super(message);
		this.name = "RenderError";
		this.stderr = stderr;
		this.code = code;
	}
}

export class RenderTimeoutError extends EurekaError {
	timeoutMs: number;
	constructor(timeoutMs: number) {
		super(`Manim render exceeded timeout of ${timeoutMs}ms`);
		this.name = "RenderTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}

// ============================================================
// Options and results
// ============================================================

export type ManimQuality = "low" | "medium" | "high" | "fourk";

export interface GenerateOptions {
	/** LLM model to use (e.g., "anthropic/claude-sonnet-4-20250514"). Defaults to claude sonnet. */
	model?: string;

	/** Manim render quality. Defaults to "low" for fast iteration. */
	quality?: ManimQuality;

	/** Render timeout in milliseconds. Defaults to 120000 (2 minutes). */
	renderTimeoutMs?: number;

	/** If true, keep the temp directory with source files after render. Defaults to false. */
	keepArtifacts?: boolean;

	/** Custom temp directory path. Defaults to os.tmpdir()/eureka-<random>. */
	tmpDir?: string;

	/** AbortSignal for cancellation. */
	signal?: AbortSignal;
}

export interface GenerateResult {
	/** Absolute path to the rendered video file (MP4). */
	videoPath: string;

	/** The generated Manim Python code. */
	code: string;

	/** Name of the Scene class that was rendered. */
	sceneName: string;

	/** Time taken for LLM code generation in ms. */
	generateDurationMs: number;

	/** Time taken for manim render in ms. */
	renderDurationMs: number;

	/** Path to the temp directory (only present if keepArtifacts=true). */
	artifactsDir?: string;
}

export interface RenderOptions {
	/** The Manim Python code to render. */
	code: string;

	/** Name of the Scene class in the code. */
	sceneName: string;

	/** Manim render quality. */
	quality: ManimQuality;

	/** Render timeout in milliseconds. */
	timeoutMs: number;

	/** Directory to write the scene file and capture output. */
	workDir: string;

	/** AbortSignal for cancellation. */
	signal?: AbortSignal;
}
