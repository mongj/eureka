import { readdir as fsReaddir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Recursively walk a directory tree, calling onFile for each regular file.
 */
export async function walkFiles(dir: string, onFile: (fullPath: string) => Promise<void>): Promise<void> {
	const entries = await fsReaddir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			await walkFiles(fullPath, onFile);
		} else if (entry.isFile()) {
			await onFile(fullPath);
		}
	}
}
