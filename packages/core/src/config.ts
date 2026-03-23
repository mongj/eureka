/**
 * Model tasks used across the pipeline.
 */
export type ModelTask = "generate" | "plan-snippet" | "plan-image";

/**
 * Map of pipeline tasks to model identifiers.
 * Format: "provider/model-id" (e.g., "anthropic/claude-sonnet-4")
 */
export interface CoreConfig {
	models: Record<ModelTask, string>;
}
export const DEFAULT_MODELS: CoreConfig["models"] = {
	generate: "openai/gpt-5.3-codex",
	"plan-snippet": "openai/gpt-5.4",
	"plan-image": "openai/gpt-5.4",
};

let _config: CoreConfig = {
	models: DEFAULT_MODELS,
};

/**
 * Set the global configuration. Merges with existing config.
 *
 * @example
 * ```ts
 * import { configure } from "@eureka/core";
 *
 * configure({
 *   models: {
 *     generate: "anthropic/claude-sonnet-4",
 *   },
 * });
 * ```
 */
function configure(config: CoreConfig): void {
	_config = {
		..._config,
		...config,
		models: { ..._config.models, ...config.models },
	};
}

/**
 * Get the current configuration (read-only snapshot).
 */
function getConfig(): Readonly<CoreConfig> {
	return _config;
}

export { configure, getConfig };
