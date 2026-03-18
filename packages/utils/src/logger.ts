import chalk from "chalk";

export const LogLevel = {
	DEBUG: 0,
	INFO: 1,
	WARN: 2,
	ERROR: 3,
	SILENT: 4,
} as const;

export type LogLevelName = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_MAP: Record<LogLevelName, number> = {
	debug: LogLevel.DEBUG,
	info: LogLevel.INFO,
	warn: LogLevel.WARN,
	error: LogLevel.ERROR,
	silent: LogLevel.SILENT,
};

export interface LoggerOptions {
	/** Explicit log level. Overrides env/defaults. */
	level?: LogLevelName;
	/** Disable color output. Defaults to respecting NO_COLOR env var. */
	color?: boolean;
}

export interface Logger {
	debug(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
}

function resolveLevel(explicit?: LogLevelName): number {
	if (explicit) return LEVEL_MAP[explicit];
	const env = process.env.LOG_LEVEL?.toLowerCase() as LogLevelName | undefined;
	if (env && env in LEVEL_MAP) return LEVEL_MAP[env];
	return process.env.NODE_ENV === "production" ? LogLevel.WARN : LogLevel.DEBUG;
}

function useColor(explicit?: boolean): boolean {
	if (explicit !== undefined) return explicit;
	return !process.env.NO_COLOR;
}

export function createLogger(namespace: string, options: LoggerOptions = {}): Logger {
	const threshold = resolveLevel(options.level);
	const colored = useColor(options.color);

	function formatPrefix(levelTag: string, colorFn: (s: string) => string): string {
		const ns = colored ? chalk.bold(`[${namespace}]`) : `[${namespace}]`;
		const tag = colored ? colorFn(levelTag) : levelTag;
		return `${ns} ${tag}`;
	}

	return {
		debug(message: string, ...args: unknown[]) {
			if (threshold > LogLevel.DEBUG) return;
			const prefix = formatPrefix("DEBUG", chalk.gray);
			console.log(`${prefix} ${message}`, ...args);
		},
		info(message: string, ...args: unknown[]) {
			if (threshold > LogLevel.INFO) return;
			const prefix = formatPrefix("INFO", chalk.cyan);
			console.log(`${prefix} ${message}`, ...args);
		},
		warn(message: string, ...args: unknown[]) {
			if (threshold > LogLevel.WARN) return;
			const prefix = formatPrefix("WARN", chalk.yellow);
			console.warn(`${prefix} ${message}`, ...args);
		},
		error(message: string, ...args: unknown[]) {
			if (threshold > LogLevel.ERROR) return;
			const prefix = formatPrefix("ERROR", chalk.red);
			console.error(`${prefix} ${message}`, ...args);
		},
	};
}
