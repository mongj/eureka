import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, LogLevel } from "../src/logger.js";

describe("createLogger", () => {
	let originalEnv: string | undefined;

	beforeEach(() => {
		originalEnv = process.env.LOG_LEVEL;
	});

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.LOG_LEVEL;
		} else {
			process.env.LOG_LEVEL = originalEnv;
		}
	});

	it("creates a logger with a namespace", () => {
		const log = createLogger("Test");
		expect(log).toBeDefined();
		expect(typeof log.debug).toBe("function");
		expect(typeof log.info).toBe("function");
		expect(typeof log.warn).toBe("function");
		expect(typeof log.error).toBe("function");
	});

	it("outputs messages to console with namespace prefix", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const log = createLogger("MyModule", { level: "debug", color: false });
		log.info("hello world");
		expect(spy).toHaveBeenCalledTimes(1);
		const output = spy.mock.calls[0][0];
		expect(output).toContain("[MyModule]");
		expect(output).toContain("hello world");
		spy.mockRestore();
	});

	it("respects log level - suppresses debug when level is info", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const log = createLogger("Test", { level: "info", color: false });
		log.debug("should not appear");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("respects log level - allows warn when level is warn", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const log = createLogger("Test", { level: "warn", color: false });
		log.warn("warning message");
		expect(warnSpy).toHaveBeenCalledTimes(1);
		warnSpy.mockRestore();
	});

	it("respects log level - suppresses warn when level is error", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const log = createLogger("Test", { level: "error", color: false });
		log.error("error message");
		expect(errorSpy).toHaveBeenCalledTimes(1);
		log.warn("should not appear");
		expect(warnSpy).not.toHaveBeenCalled();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
	});

	it("uses LOG_LEVEL env var when no explicit level is set", () => {
		process.env.LOG_LEVEL = "error";
		const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const log = createLogger("Test", { color: false });
		log.warn("should be suppressed");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("formats multiple arguments", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const log = createLogger("Test", { level: "debug", color: false });
		log.info("count:", 42);
		expect(spy).toHaveBeenCalledTimes(1);
		const output = spy.mock.calls[0][0];
		expect(output).toContain("[Test]");
		expect(output).toContain("count:");
		expect(spy.mock.calls[0][1]).toBe(42);
		spy.mockRestore();
	});

	it("uses warn level as default in production", () => {
		const origNode = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		delete process.env.LOG_LEVEL;
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const log = createLogger("Test", { color: false });
		log.info("should be suppressed in production");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
		if (origNode === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = origNode;
		}
	});

	it("disables color when NO_COLOR is set", () => {
		const origNoColor = process.env.NO_COLOR;
		process.env.NO_COLOR = "1";
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const log = createLogger("Test", { level: "debug" });
		log.info("no color");
		const output = spy.mock.calls[0][0];
		expect(output).not.toMatch(/\x1b\[/);
		expect(output).toContain("[Test]");
		spy.mockRestore();
		if (origNoColor === undefined) {
			delete process.env.NO_COLOR;
		} else {
			process.env.NO_COLOR = origNoColor;
		}
	});

	it("uses debug level as default in development", () => {
		const origNode = process.env.NODE_ENV;
		delete process.env.NODE_ENV;
		delete process.env.LOG_LEVEL;
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const log = createLogger("Test", { color: false });
		log.debug("should appear in dev");
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
		if (origNode === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = origNode;
		}
	});
});

describe("LogLevel", () => {
	it("exports numeric log level constants", () => {
		expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
		expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
		expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
		expect(LogLevel.ERROR).toBeLessThan(LogLevel.SILENT);
	});
});
