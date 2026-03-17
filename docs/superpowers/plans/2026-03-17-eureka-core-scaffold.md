# Eureka Core Scaffold Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the eureka monorepo with forked pi-mono AI/agent packages and a new `core` package that exposes `generateVideo(prompt) → { videoPath, code, metadata }` using LLM-generated Manim code rendered locally.

**Architecture:** TypeScript pnpm-workspaces monorepo. `packages/ai` (forked pi-ai) provides unified LLM access. `packages/agent` (forked pi-agent-core) provides the agent runtime. `packages/core` wires them together: an Agent with a Manim-specialized system prompt generates Python code, which is written to a temp directory and rendered via `manim render` subprocess.

**Tech Stack:** TypeScript 5.7+, Node.js 20+, pnpm workspaces, Vitest, oxlint/oxfmt, `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, Manim Community (Python), ffmpeg

---

## File Structure

```
eureka/
├── package.json                    # workspace root
├── pnpm-workspace.yaml             # pnpm workspace config
├── tsconfig.base.json              # shared TS config
├── .oxlintrc.json                  # oxlint config
├── .oxfmtrc.json                   # oxfmt config
├── .gitignore
├── packages/
│   ├── ai/                         # FORKED from pi-mono/packages/ai
│   │   ├── src/                    # (copied as-is, scope renamed)
│   │   ├── package.json
│   │   ├── tsconfig.build.json
│   │   └── vitest.config.ts
│   ├── agent/                      # FORKED from pi-mono/packages/agent
│   │   ├── src/                    # (copied as-is, scope renamed)
│   │   ├── package.json
│   │   ├── tsconfig.build.json
│   │   └── vitest.config.ts
│   └── core/                       # NEW — eureka core
│       ├── src/
│       │   ├── index.ts            # public API: generateVideo, types, errors
│       │   ├── types.ts            # GenerateOptions, GenerateResult, error classes
│       │   ├── prompts.ts          # system prompt for manim code generation
│       │   ├── generate.ts         # Agent setup + LLM code generation + code extraction
│       │   ├── render.ts           # manim CLI subprocess execution
│       │   └── dependencies.ts     # checkDependencies() — verify manim + ffmpeg
│       ├── test/
│       │   ├── extract-code.test.ts
│       │   ├── render.test.ts
│       │   └── generate.test.ts
│       ├── package.json
│       ├── tsconfig.json            # IDE + test type-checking
│       ├── tsconfig.build.json      # build (src only)
│       └── vitest.config.ts
```

**Responsibilities:**

- `types.ts` — All types and error classes. No logic. No imports from other core modules.
- `prompts.ts` — System prompt string constant. No imports from other core modules.
- `dependencies.ts` — `checkManimInstalled()`, `checkFfmpegInstalled()`. Shell-out to `which manim` / `which ffmpeg`. Throws typed errors.
- `render.ts` — `renderManimScene(code, options)`. Writes code to tmpdir, spawns `manim render`, returns video path. Depends on `types.ts`, `dependencies.ts`.
- `generate.ts` — `generateManimCode(prompt, options)`. Creates Agent with system prompt, calls LLM, extracts code from response. Depends on `types.ts`, `prompts.ts`, agent/ai packages.
- `index.ts` — `generateVideo(prompt, options)`. Orchestrates generate → render. Re-exports types/errors.

---

## Chunk 1: Monorepo Scaffold + Forked Packages

### Task 1: Initialize git repo and monorepo root

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.oxlintrc.json`
- Create: `.oxfmtrc.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/mingjun/dev/eureka
git init
```

- [ ] **Step 2: Create root package.json**

```json
{
	"name": "eureka",
	"private": true,
	"engines": {
		"node": ">=20.0.0"
	},
	"scripts": {
		"build": "pnpm -r run build",
		"test": "pnpm -r run test",
		"clean": "pnpm -r run clean"
	},
	"devDependencies": {
		"oxlint": "latest",
		"oxfmt": "latest",
		"typescript": "^5.7.3"
	}
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 4: Create tsconfig.base.json**

Copy the pi-mono pattern — ES2022 target, Node16 module resolution, strict mode:

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "Node16",
		"moduleResolution": "Node16",
		"lib": ["ES2022"],
		"strict": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true,
		"declaration": true,
		"declarationMap": true,
		"sourceMap": true,
		"inlineSources": true,
		"resolveJsonModule": true,
		"allowImportingTsExtensions": false,
		"types": ["node"],
		"useDefineForClassFields": false,
		"experimentalDecorators": true,
		"emitDecoratorMetadata": true
	}
}
```

- [ ] **Step 5: Create .oxlintrc.json**

Minimal oxlint config — defaults are sensible (695+ rules, correctness-focused):

```json
{}
```

An empty config file enables oxlint's defaults, which are correctness-focused and low-noise. Rules can be customized later as needed.

- [ ] **Step 5b: Create .oxfmtrc.json**

Formatter config using tabs to match pi-mono style:

```json
{
	"useTabs": true,
	"printWidth": 120,
	"semi": true,
	"singleQuote": false,
	"trailingComma": "all"
}
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
media/
```

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .oxlintrc.json .oxfmtrc.json .gitignore
git commit -m "chore: initialize eureka monorepo scaffold with pnpm"
```

---

### Task 2: Fork pi-mono packages (ai + agent)

**Files:**

- Create: `packages/ai/` (cloned from pi-mono)
- Create: `packages/agent/` (cloned from pi-mono)

- [ ] **Step 1: Clone pi-mono to a temp location**

```bash
git clone --depth 1 https://github.com/badlogic/pi-mono.git /tmp/pi-mono-clone
```

- [ ] **Step 2: Copy packages/ai into eureka**

```bash
cp -r /tmp/pi-mono-clone/packages/ai /Users/mingjun/dev/eureka/packages/ai
```

- [ ] **Step 3: Copy packages/agent into eureka**

```bash
cp -r /tmp/pi-mono-clone/packages/agent /Users/mingjun/dev/eureka/packages/agent
```

- [ ] **Step 4: Update package.json in packages/ai**

Change the package name from `@mariozechner/pi-ai` to `@eureka/ai` and remove publishing metadata:

```bash
cd /Users/mingjun/dev/eureka
sed -i '' 's/"@mariozechner\/pi-ai"/"@eureka\/ai"/g' packages/ai/package.json
# Remove publishing-specific fields (publishConfig, repository, homepage, bugs)
node -e "
const pkg = JSON.parse(require('fs').readFileSync('packages/ai/package.json', 'utf8'));
delete pkg.publishConfig; delete pkg.repository; delete pkg.homepage; delete pkg.bugs;
require('fs').writeFileSync('packages/ai/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
```

- [ ] **Step 5: Update package.json in packages/agent**

Change package name and update the dependency on pi-ai to use the workspace reference:

```bash
cd /Users/mingjun/dev/eureka
sed -i '' 's/"@mariozechner\/pi-agent-core"/"@eureka\/agent"/g' packages/agent/package.json
sed -i '' 's/"@mariozechner\/pi-ai": "[^"]*"/"@eureka\/ai": "workspace:*"/g' packages/agent/package.json
# Remove publishing-specific fields
node -e "
const pkg = JSON.parse(require('fs').readFileSync('packages/agent/package.json', 'utf8'));
delete pkg.publishConfig; delete pkg.repository; delete pkg.homepage; delete pkg.bugs;
require('fs').writeFileSync('packages/agent/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
```

- [ ] **Step 6: Update internal imports in packages/agent and packages/ai**

The agent package imports from `@mariozechner/pi-ai`. Replace all occurrences in source files:

```bash
cd /Users/mingjun/dev/eureka
# Update agent source files
sed -i '' 's/@mariozechner\/pi-ai/@eureka\/ai/g' packages/agent/src/*.ts
# Also update any internal references in the ai package itself (e.g., test files)
find packages/ai -name '*.ts' -exec sed -i '' 's/@mariozechner\/pi-ai/@eureka\/ai/g' {} +
find packages/agent -name '*.ts' -exec sed -i '' 's/@mariozechner\/pi-ai/@eureka\/ai/g' {} +
# Verify no stale references remain
grep -r "@mariozechner" packages/ai/src packages/agent/src || echo "All references updated"
```

- [ ] **Step 7: Install dependencies and verify build**

```bash
cd /Users/mingjun/dev/eureka
pnpm install
pnpm --filter @eureka/ai run build
pnpm --filter @eureka/agent run build
```

Expected: Both packages compile without errors.

- [ ] **Step 8: Clean up temp clone**

```bash
rm -rf /tmp/pi-mono-clone
```

- [ ] **Step 9: Commit**

```bash
git add packages/ai packages/agent
git commit -m "chore: fork pi-mono ai and agent packages into eureka monorepo"
```

---

## Chunk 2: Core Package — Types, Errors, and Dependencies Check

### Task 3: Create core package scaffold

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.build.json`
- Create: `packages/core/vitest.config.ts`

- [ ] **Step 1: Create packages/core/package.json**

```json
{
	"name": "@eureka/core",
	"version": "0.0.1",
	"type": "module",
	"main": "./dist/index.js",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"import": "./dist/index.js",
			"types": "./dist/index.d.ts"
		}
	},
	"scripts": {
		"clean": "rm -rf dist",
		"build": "tsc -p tsconfig.build.json",
		"dev": "tsc -p tsconfig.build.json --watch",
		"test": "vitest run"
	},
	"dependencies": {
		"@eureka/ai": "workspace:*",
		"@eureka/agent": "workspace:*"
	},
	"devDependencies": {
		"typescript": "^5.7.3",
		"vitest": "^3.2.4"
	},
	"engines": {
		"node": ">=20.0.0"
	}
}
```

- [ ] **Step 2: Create packages/core/tsconfig.build.json**

```json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "./dist",
		"rootDir": "./src"
	},
	"include": ["src/**/*.ts"],
	"exclude": ["node_modules", "dist", "**/*.d.ts", "test"]
}
```

- [ ] **Step 3: Create packages/core/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 120000, // 2 minutes — LLM calls + manim renders can be slow
	},
});
```

- [ ] **Step 4: Create packages/core/tsconfig.json (for test type-checking)**

This tsconfig covers both src and test directories, adding vitest globals types so `describe`, `it`, `expect` are recognized without imports:

```json
{
	"extends": "../../tsconfig.base.json",
	"compilerOptions": {
		"outDir": "./dist",
		"rootDir": ".",
		"types": ["node", "vitest/globals"],
		"noEmit": true
	},
	"include": ["src/**/*.ts", "test/**/*.ts"],
	"exclude": ["node_modules", "dist"]
}
```

Note: `tsconfig.build.json` is used for building (only `src/`), while this `tsconfig.json` is used for IDE support and type-checking (includes `test/`).

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.build.json packages/core/tsconfig.json packages/core/vitest.config.ts
git commit -m "chore: create core package scaffold"
```

---

### Task 4: Define types and error classes

**Files:**

- Create: `packages/core/src/types.ts`
- Test: `packages/core/test/types.test.ts` (not needed — pure types, no logic to test)

- [ ] **Step 1: Create packages/core/src/types.ts**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/mingjun/dev/eureka
pnpm exec tsc --noEmit -p packages/core/tsconfig.build.json
```

Expected: No errors (types.ts has no imports from other packages).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add type definitions and error hierarchy"
```

---

### Task 5: Dependency checker

**Files:**

- Create: `packages/core/src/dependencies.ts`
- Test: `packages/core/test/dependencies.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/dependencies.test.ts
import { describe, it, expect, vi } from "vitest";
import { checkManimInstalled, checkFfmpegInstalled } from "../src/dependencies.js";

// These tests verify the check functions exist and return the right errors.
// We can't mock child_process easily in ESM, so we test the real system:
// if manim/ffmpeg are installed, they pass; if not, they throw.

describe("checkManimInstalled", () => {
	it("should be a function", () => {
		expect(typeof checkManimInstalled).toBe("function");
	});

	it("should return a promise", () => {
		const result = checkManimInstalled();
		expect(result).toBeInstanceOf(Promise);
	});
});

describe("checkFfmpegInstalled", () => {
	it("should be a function", () => {
		expect(typeof checkFfmpegInstalled).toBe("function");
	});

	it("should return a promise", () => {
		const result = checkFfmpegInstalled();
		expect(result).toBeInstanceOf(Promise);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/mingjun/dev/eureka
pnpm exec vitest run --config packages/core/vitest.config.ts packages/core/test/dependencies.test.ts
```

Expected: FAIL — module `../src/dependencies.js` not found.

- [ ] **Step 3: Implement dependencies.ts**

```typescript
// packages/core/src/dependencies.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run --config packages/core/vitest.config.ts packages/core/test/dependencies.test.ts
```

Expected: PASS (tests check the function exists and returns a promise; actual manim/ffmpeg availability depends on the machine).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dependencies.ts packages/core/test/dependencies.test.ts
git commit -m "feat(core): add dependency checker for manim and ffmpeg"
```

---

## Chunk 3: Core Package — Manim Rendering

### Task 6: Implement the manim renderer

**Files:**

- Create: `packages/core/src/render.ts`
- Test: `packages/core/test/render.test.ts`

- [ ] **Step 1: Write the failing test for extractSceneName**

```typescript
// packages/core/test/render.test.ts
import { describe, it, expect } from "vitest";
import { extractSceneName, renderManimScene } from "../src/render.js";

describe("extractSceneName", () => {
	it("extracts a single Scene subclass name", () => {
		const code = `
from manim import *

class MyAnimation(Scene):
    def construct(self):
        circle = Circle()
        self.play(Create(circle))
`;
		expect(extractSceneName(code)).toBe("MyAnimation");
	});

	it("extracts the first Scene subclass when multiple exist", () => {
		const code = `
from manim import *

class FirstScene(Scene):
    def construct(self):
        pass

class SecondScene(Scene):
    def construct(self):
        pass
`;
		expect(extractSceneName(code)).toBe("FirstScene");
	});

	it("handles ThreeDScene subclass", () => {
		const code = `
from manim import *

class My3DScene(ThreeDScene):
    def construct(self):
        pass
`;
		expect(extractSceneName(code)).toBe("My3DScene");
	});

	it("returns null when no Scene subclass found", () => {
		const code = `
print("hello world")
`;
		expect(extractSceneName(code)).toBeNull();
	});

	it("handles class with extra whitespace", () => {
		const code = `class  MyScene ( Scene ) :`;
		expect(extractSceneName(code)).toBe("MyScene");
	});
});

describe("renderManimScene", () => {
	it("should be a function", () => {
		expect(typeof renderManimScene).toBe("function");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run --config packages/core/vitest.config.ts packages/core/test/render.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement render.ts**

```typescript
// packages/core/src/render.ts
import { execFile } from "node:child_process";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { RenderError, RenderTimeoutError, type RenderOptions, type ManimQuality } from "./types.js";

const QUALITY_FLAGS: Record<ManimQuality, string> = {
	low: "-ql",
	medium: "-qm",
	high: "-qh",
	fourk: "-qk",
};

/**
 * Extract the first Scene subclass name from Manim Python code.
 * Matches: class Foo(Scene):, class Foo(ThreeDScene):, class Foo(MovingCameraScene):, etc.
 */
export function extractSceneName(code: string): string | null {
	const match = code.match(/class\s+(\w+)\s*\(\s*\w*Scene\s*\)/);
	return match ? match[1] : null;
}

/**
 * Render Manim Python code into a video file.
 *
 * Writes the code to a temp file, spawns `manim render`, and returns
 * the path to the output video.
 */
export async function renderManimScene(options: RenderOptions): Promise<string> {
	const { code, sceneName, quality, timeoutMs, workDir, signal } = options;

	// Write the scene file
	const sceneFile = join(workDir, "scene.py");
	await mkdir(workDir, { recursive: true });
	await writeFile(sceneFile, code, "utf-8");

	// Build the manim command
	const qualityFlag = QUALITY_FLAGS[quality];
	const mediaDir = join(workDir, "media");
	const args = ["render", qualityFlag, "--media_dir", mediaDir, sceneFile, sceneName];

	console.log(`[eureka] Rendering: manim ${args.join(" ")}`);

	// Spawn manim
	const videoPath = await new Promise<string>((resolve, reject) => {
		execFile("manim", args, { timeout: timeoutMs, signal }, async (error, _stdout, stderr) => {
			if (error) {
				// Node's execFile sets error.killed=true when the process is killed
				// by timeout (ETIMEDOUT) or by AbortSignal (ABORT_ERR).
				if (error.killed) {
					reject(new RenderTimeoutError(timeoutMs));
					return;
				}
				reject(new RenderError(`Manim render failed: ${error.message}`, code, stderr || ""));
				return;
			}

			// Find the output video file
			// Manim outputs to: media/videos/scene/<quality_dir>/<SceneName>.mp4
			try {
				const videosDir = join(mediaDir, "videos", "scene");
				const qualityDirs = await readdir(videosDir);
				if (qualityDirs.length === 0) {
					reject(new RenderError("No output directory found after render", code, stderr || ""));
					return;
				}
				const outputDir = join(videosDir, qualityDirs[0]);
				const mp4Path = join(outputDir, `${sceneName}.mp4`);
				resolve(mp4Path);
			} catch (fsError) {
				reject(new RenderError(`Could not locate output video: ${(fsError as Error).message}`, code, stderr || ""));
			}
		});
	});

	return videoPath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run --config packages/core/vitest.config.ts packages/core/test/render.test.ts
```

Expected: All `extractSceneName` tests PASS. The `renderManimScene` existence test PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/render.ts packages/core/test/render.test.ts
git commit -m "feat(core): add manim renderer with scene name extraction"
```

---

### Task 7: Integration test for rendering (requires manim installed)

**Files:**

- Create: `packages/core/test/render.integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// packages/core/test/render.integration.test.ts
import { describe, it, expect } from "vitest";
import { renderManimScene } from "../src/render.js";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

// Synchronous check at module scope so skipIf evaluates correctly at collection time
const manimAvailable = (() => {
	try {
		execSync("manim --version", { stdio: "ignore" });
		execSync("ffmpeg -version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

describe("renderManimScene (integration)", () => {
	it.skipIf(!manimAvailable)("renders a simple scene to MP4", async () => {
		const workDir = await mkdtemp(join(tmpdir(), "eureka-test-"));
		try {
			const code = `from manim import *

class TestCircle(Scene):
    def construct(self):
        circle = Circle()
        self.play(Create(circle))
        self.wait(0.5)
`;
			const videoPath = await renderManimScene({
				code,
				sceneName: "TestCircle",
				quality: "low",
				timeoutMs: 60000,
				workDir,
			});

			// Video file should exist
			await access(videoPath);
			expect(videoPath).toContain("TestCircle.mp4");
		} finally {
			await rm(workDir, { recursive: true, force: true });
		}
	});

	it.skipIf(!manimAvailable)("throws RenderError on invalid python code", async () => {
		const workDir = await mkdtemp(join(tmpdir(), "eureka-test-"));
		try {
			const code = `from manim import *

class BadScene(Scene):
    def construct(self):
        this_will_fail()  # undefined function
`;
			await expect(
				renderManimScene({
					code,
					sceneName: "BadScene",
					quality: "low",
					timeoutMs: 60000,
					workDir,
				}),
			).rejects.toThrow("Manim render failed");
		} finally {
			await rm(workDir, { recursive: true, force: true });
		}
	});
});
```

- [ ] **Step 2: Run integration test**

```bash
pnpm exec vitest run --config packages/core/vitest.config.ts packages/core/test/render.integration.test.ts
```

Expected: If manim is installed, both tests pass (one success, one expected error). If not installed, tests are skipped with a warning.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/render.integration.test.ts
git commit -m "test(core): add render integration tests"
```

---

## Chunk 4: Core Package — Code Generation

### Task 8: Write the Manim system prompt

**Files:**

- Create: `packages/core/src/prompts.ts`

- [ ] **Step 1: Create prompts.ts**

```typescript
// packages/core/src/prompts.ts

export const MANIM_SYSTEM_PROMPT = `You are an expert Manim animator. Your job is to generate Manim Community Edition Python code that creates mathematical animations.

## Rules

1. ALWAYS start with \`from manim import *\`
2. Define exactly ONE class that extends \`Scene\` (or a Scene subclass like \`ThreeDScene\`, \`MovingCameraScene\`)
3. Implement the \`construct(self)\` method with all animation logic
4. Use ONLY imports from the \`manim\` package. Do NOT import any other packages (no numpy, no scipy, no os, no sys, etc.)
5. The class name should be descriptive of the animation content (e.g., \`PythagoreanTheorem\`, \`QuadraticFormula\`)
6. Keep animations concise — aim for 5-30 seconds of content
7. Use \`self.play()\` for animations and \`self.wait()\` for pauses
8. Add text labels and annotations to make the animation educational

## Style Guidelines

- Use vibrant colors (BLUE, RED, GREEN, YELLOW, PURPLE, ORANGE)
- Add smooth transitions between concepts
- Use MathTex for mathematical expressions (e.g., \`MathTex(r"x^2 + y^2 = r^2")\`)
- Use Text for plain text labels (e.g., \`Text("Pythagorean Theorem")\`)
- Position elements clearly using .to_edge(), .next_to(), .move_to()
- Use VGroup to organize related elements

## Output Format

Respond with ONLY the Python code inside a single markdown code block. No explanations before or after the code.

\`\`\`python
from manim import *

class YourSceneName(Scene):
    def construct(self):
        # Your animation code here
        pass
\`\`\`
`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/prompts.ts
git commit -m "feat(core): add manim system prompt"
```

---

### Task 9: Implement code generation with LLM

**Files:**

- Create: `packages/core/src/generate.ts`
- Test: `packages/core/test/extract-code.test.ts`

- [ ] **Step 1: Write failing test for extractManimCode**

```typescript
// packages/core/test/extract-code.test.ts
import { describe, it, expect } from "vitest";
import { extractManimCode } from "../src/generate.js";

describe("extractManimCode", () => {
	it("extracts code from a python markdown block", () => {
		const response = `Here's the animation:

\`\`\`python
from manim import *

class MyScene(Scene):
    def construct(self):
        self.play(Create(Circle()))
\`\`\`

This creates a circle animation.`;

		const code = extractManimCode(response);
		expect(code).toContain("from manim import *");
		expect(code).toContain("class MyScene(Scene)");
	});

	it("extracts code from a plain markdown block", () => {
		const response = `\`\`\`
from manim import *

class PlainBlock(Scene):
    def construct(self):
        pass
\`\`\``;

		const code = extractManimCode(response);
		expect(code).toContain("class PlainBlock(Scene)");
	});

	it("extracts the first code block when multiple exist", () => {
		const response = `\`\`\`python
from manim import *

class First(Scene):
    def construct(self):
        pass
\`\`\`

Here's another version:

\`\`\`python
from manim import *

class Second(Scene):
    def construct(self):
        pass
\`\`\``;

		const code = extractManimCode(response);
		expect(code).toContain("class First(Scene)");
		expect(code).not.toContain("class Second(Scene)");
	});

	it("returns the raw response if no code block but contains manim import", () => {
		const response = `from manim import *

class NoBlock(Scene):
    def construct(self):
        pass`;

		const code = extractManimCode(response);
		expect(code).toContain("class NoBlock(Scene)");
	});

	it("returns null when response contains no code", () => {
		const response = "I'm sorry, I can't generate that animation.";
		expect(extractManimCode(response)).toBeNull();
	});

	it("handles code blocks with trailing whitespace", () => {
		const response = `\`\`\`python
from manim import *

class Trimmed(Scene):
    def construct(self):
        pass
\`\`\`  `;

		const code = extractManimCode(response);
		expect(code).toContain("class Trimmed(Scene)");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run --config packages/core/vitest.config.ts packages/core/test/extract-code.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement generate.ts**

````typescript
// packages/core/src/generate.ts
import { getModel, complete } from "@eureka/ai";
import { MANIM_SYSTEM_PROMPT } from "./prompts.js";
import { InvalidPromptError, InvalidModelError, NoCodeGeneratedError, type GenerateOptions } from "./types.js";

/**
 * Extract Manim Python code from an LLM response.
 *
 * Tries in order:
 * 1. First ```python ... ``` block
 * 2. First ``` ... ``` block (untagged)
 * 3. Raw response if it contains "from manim import"
 * 4. null if nothing found
 */
export function extractManimCode(response: string): string | null {
	// Try python-tagged code block first
	const pythonBlock = response.match(/```python\s*\n([\s\S]*?)```/);
	if (pythonBlock) return pythonBlock[1].trim();

	// Try untagged code block
	const plainBlock = response.match(/```\s*\n([\s\S]*?)```/);
	if (plainBlock) return plainBlock[1].trim();

	// Try raw response (LLM sometimes omits the code fence)
	if (response.includes("from manim import")) {
		return response.trim();
	}

	return null;
}

/**
 * Default model: Claude Sonnet via Anthropic provider.
 * Uses getModel() with literal types for compile-time safety.
 */
function getDefaultModel() {
	return getModel("anthropic", "claude-sonnet-4-20250514" as any);
}

/**
 * Generate Manim Python code from a natural language prompt using an LLM.
 *
 * Uses complete() directly (single LLM call, no agent loop) since we don't
 * need tool calling for code generation. The Agent class becomes valuable
 * when we add the self-correcting render loop (TODOS.md P1).
 */
export async function generateManimCode(
	prompt: string,
	options?: Pick<GenerateOptions, "model" | "signal">,
): Promise<{ code: string; rawResponse: string }> {
	if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
		throw new InvalidPromptError();
	}

	// Resolve model — default to Claude Sonnet.
	// If the caller provides a model string like "anthropic/claude-sonnet-4-20250514",
	// parse it into provider + modelId. Validates at runtime via getModel().
	let model;
	if (options?.model) {
		const slashIndex = options.model.indexOf("/");
		if (slashIndex === -1) {
			throw new InvalidModelError(
				options.model,
				`Invalid model format: "${options.model}". Expected "provider/model-id" (e.g., "anthropic/claude-sonnet-4-20250514").`,
			);
		}
		const provider = options.model.slice(0, slashIndex);
		const modelId = options.model.slice(slashIndex + 1);
		try {
			model = getModel(provider as any, modelId as any);
		} catch (e) {
			throw new InvalidModelError(options.model, `Unknown model "${options.model}": ${(e as Error).message}`);
		}
	} else {
		model = getDefaultModel();
	}

	const result = await complete(model, {
		systemPrompt: MANIM_SYSTEM_PROMPT,
		messages: [{ role: "user", content: prompt }],
	});

	// Extract the text content from the AssistantMessage response
	const rawResponse = result.content
		.filter((c: { type: string }) => c.type === "text")
		.map((c: { type: string; text: string }) => c.text)
		.join("\n");

	console.log("[eureka] Generated code:\n", rawResponse);

	const code = extractManimCode(rawResponse);
	if (!code) {
		throw new NoCodeGeneratedError(rawResponse);
	}

	return { code, rawResponse };
}
````

- [ ] **Step 4: Run tests to verify extractManimCode passes**

```bash
pnpm exec vitest run --config packages/core/vitest.config.ts packages/core/test/extract-code.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/generate.ts packages/core/test/extract-code.test.ts
git commit -m "feat(core): add LLM code generation with manim code extraction"
```

---

## Chunk 5: Core Package — Public API and End-to-End

### Task 10: Wire up the public API

**Files:**

- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create index.ts**

````typescript
// packages/core/src/index.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateManimCode, extractManimCode } from "./generate.js";
import { renderManimScene, extractSceneName } from "./render.js";
import { checkAllDependencies } from "./dependencies.js";
import {
	InvalidPromptError,
	NoCodeGeneratedError,
	RenderError,
	RenderTimeoutError,
	type GenerateOptions,
	type GenerateResult,
} from "./types.js";

/**
 * Generate an educational math video from a natural language prompt.
 *
 * Pipeline: prompt → LLM generates Manim code → render to MP4 video.
 *
 * @example
 * ```ts
 * import { generateVideo } from "@eureka/core";
 *
 * const result = await generateVideo("Show the Pythagorean theorem visually");
 * console.log(result.videoPath); // /tmp/eureka-xxxx/media/videos/scene/480p15/PythagoreanTheorem.mp4
 * console.log(result.code);      // from manim import * ...
 * ```
 */
export async function generateVideo(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
	const { quality = "low", renderTimeoutMs = 120_000, keepArtifacts = false, signal } = options;

	// Check dependencies first
	await checkAllDependencies();

	// Generate code
	const genStart = Date.now();
	const { code } = await generateManimCode(prompt, { model: options.model, signal });
	const generateDurationMs = Date.now() - genStart;

	// Extract scene name
	const sceneName = extractSceneName(code);
	if (!sceneName) {
		throw new NoCodeGeneratedError(code);
	}

	// Set up temp directory
	const workDir = options.tmpDir ?? (await mkdtemp(join(tmpdir(), "eureka-")));

	try {
		// Render
		const renderStart = Date.now();
		const videoPath = await renderManimScene({
			code,
			sceneName,
			quality,
			timeoutMs: renderTimeoutMs,
			workDir,
			signal,
		});
		const renderDurationMs = Date.now() - renderStart;

		const result: GenerateResult = {
			videoPath,
			code,
			sceneName,
			generateDurationMs,
			renderDurationMs,
		};

		if (keepArtifacts) {
			result.artifactsDir = workDir;
		}

		return result;
	} finally {
		// Clean up temp directory unless caller wants to keep artifacts.
		// If caller provided tmpDir, they own cleanup — but we still respect keepArtifacts.
		if (!keepArtifacts) {
			await rm(workDir, { recursive: true, force: true }).catch(() => {
				console.warn(`[eureka] Failed to clean up temp dir: ${workDir}`);
			});
		}
	}
}

// Re-export types and utilities for consumers
export { extractManimCode } from "./generate.js";
export { extractSceneName, renderManimScene } from "./render.js";
export { checkAllDependencies, checkManimInstalled, checkFfmpegInstalled } from "./dependencies.js";
export { MANIM_SYSTEM_PROMPT } from "./prompts.js";
export {
	EurekaError,
	InvalidPromptError,
	InvalidModelError,
	NoCodeGeneratedError,
	ManimNotFoundError,
	DependencyError,
	RenderError,
	RenderTimeoutError,
} from "./types.js";
export type { GenerateOptions, GenerateResult, RenderOptions, ManimQuality } from "./types.js";
````

- [ ] **Step 2: Build the core package**

```bash
cd /Users/mingjun/dev/eureka
pnpm install
pnpm --filter @eureka/ai run build
pnpm --filter @eureka/agent run build
pnpm --filter @eureka/core run build
```

Expected: All three packages compile without errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): add generateVideo public API"
```

---

### Task 11: End-to-end integration test

**Files:**

- Create: `packages/core/test/generate.test.ts`

- [ ] **Step 1: Write E2E test**

```typescript
// packages/core/test/generate.test.ts
import { describe, it, expect } from "vitest";
import { generateVideo } from "../src/index.js";
import { access } from "node:fs/promises";
import { execSync } from "node:child_process";

// Synchronous checks at module scope for correct skipIf evaluation.
// This test requires: manim + ffmpeg installed AND an LLM API key.
const manimAvailable = (() => {
	try {
		execSync("manim --version", { stdio: "ignore" });
		execSync("ffmpeg -version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();
const hasApiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
const canRun = manimAvailable && hasApiKey;

describe("generateVideo (E2E)", () => {
	it.skipIf(!canRun)(
		"generates a video from a simple prompt",
		async () => {
			const result = await generateVideo("Create a simple animation that shows a blue circle being drawn on screen", {
				quality: "low",
				keepArtifacts: true,
			});

			expect(result.videoPath).toContain(".mp4");
			expect(result.code).toContain("from manim import");
			expect(result.sceneName).toBeTruthy();
			expect(result.generateDurationMs).toBeGreaterThan(0);
			expect(result.renderDurationMs).toBeGreaterThan(0);

			// Video file should exist
			await access(result.videoPath);

			console.log(`[E2E] Video generated at: ${result.videoPath}`);
			console.log(`[E2E] Scene: ${result.sceneName}`);
			console.log(`[E2E] Generate: ${result.generateDurationMs}ms, Render: ${result.renderDurationMs}ms`);
		},
		180_000,
	); // 3 minute timeout for LLM + render
});
```

- [ ] **Step 2: Run E2E test**

```bash
ANTHROPIC_API_KEY=<your-key> pnpm exec vitest run --config packages/core/vitest.config.ts packages/core/test/generate.test.ts
```

Expected: If manim + API key available, generates a video and prints the path. Otherwise skips gracefully.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/generate.test.ts
git commit -m "test(core): add end-to-end generateVideo test"
```

---

### Task 12: Run all tests and final verification

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/mingjun/dev/eureka
pnpm test
```

Expected: All unit tests pass. Integration tests pass if deps are available, skip if not.

- [ ] **Step 2: Verify the package builds clean**

```bash
pnpm run build
```

Expected: All three packages compile without errors.

- [ ] **Step 3: Verify the public API is importable**

Create a quick smoke test (don't commit):

```bash
node -e "
const core = await import('./packages/core/dist/index.js');
console.log('Exports:', Object.keys(core));
console.log('generateVideo:', typeof core.generateVideo);
console.log('extractManimCode:', typeof core.extractManimCode);
console.log('extractSceneName:', typeof core.extractSceneName);
console.log('All error classes present:', [
  'EurekaError', 'InvalidPromptError', 'InvalidModelError', 'NoCodeGeneratedError',
  'ManimNotFoundError', 'DependencyError', 'RenderError', 'RenderTimeoutError'
].every(name => typeof core[name] === 'function'));
"
```

Expected output:

```
Exports: [generateVideo, extractManimCode, extractSceneName, renderManimScene, ...]
generateVideo: function
extractManimCode: function
extractSceneName: function
All error classes present: true
```

- [ ] **Step 4: Final commit with any cleanup**

```bash
git add -A
git status  # Review what's being committed
git commit -m "chore: final scaffold cleanup and verification"
```

---

## Summary

After executing this plan, you will have:

```
eureka/
├── packages/ai/          — Forked pi-ai with @eureka/ai scope
├── packages/agent/       — Forked pi-agent-core with @eureka/agent scope
└── packages/core/        — NEW: @eureka/core
    ├── generateVideo(prompt, options) → { videoPath, code, sceneName, ... }
    ├── extractManimCode(llmResponse) → string | null
    ├── extractSceneName(pythonCode) → string | null
    ├── renderManimScene(options) → string (video path)
    ├── checkAllDependencies() → void (throws if missing)
    └── 8 typed error classes for programmatic error handling
```

**Public API for consumers (e.g., an app server):**

```typescript
import { generateVideo } from "@eureka/core";

const result = await generateVideo("Explain the Pythagorean theorem visually");
// result.videoPath → "/tmp/eureka-abc123/media/videos/scene/480p15/PythagoreanTheorem.mp4"
// result.code → "from manim import * ..."
```

**Next steps (from TODOS.md):**

1. P1: Self-correcting render loop (feed errors back to LLM, retry)
2. P2: Sandboxed code execution (before multi-user)
3. P3: Cloud rendering (for scale)
