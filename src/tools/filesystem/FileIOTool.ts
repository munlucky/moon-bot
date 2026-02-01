// File I/O Tool with workspace boundary enforcement
// Uses TypeBox for compile-time type safety

import fs from "fs/promises";
import path from "path";
import type { ToolSpec } from "../../types/index.js";
import { PathValidator } from "./PathValidator.js";
import { ToolResultBuilder } from "../runtime/ToolResultBuilder.js";
import {
  FileReadInputSchema,
  FileWriteInputSchema,
  FileListInputSchema,
  FileGlobInputSchema,
  toJSONSchema,
  type FileReadInput,
  type FileWriteInput,
  type FileListInput,
  type FileGlobInput,
  type FileEntry,
} from "../schemas/TypeBoxSchemas.js";

/**
 * Recursively get all files in a directory.
 */
async function getFilesRecursively(dirPath: string, basePath: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await getFilesRecursively(fullPath, basePath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return files;
}

// TypeBox types now used instead of manual interfaces
// Import from TypeBoxSchemas:
// - FileReadInput, FileWriteInput, FileListInput, FileGlobInput, FileEntry

/**
 * Create file I/O tools for read, write, list, and glob operations.
 * Uses TypeBox schemas for compile-time type safety.
 */
export function createFileReadTool(): ToolSpec<FileReadInput, { content: string; size: number }> {
  return {
    id: "fs.read",
    description: "Read file content from within workspace",
    schema: toJSONSchema(FileReadInputSchema),
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const validation = PathValidator.validate(input.path, ctx.workspaceRoot);

        if (!validation.valid || !validation.resolvedPath) {
          return ToolResultBuilder.failureWithDuration(
            "INVALID_PATH",
            validation.error ?? "Invalid path",
            Date.now() - startTime
          );
        }

        const content = await fs.readFile(validation.resolvedPath, {
          encoding: input.encoding ?? "utf8",
        });

        const size = Buffer.byteLength(content, input.encoding ?? "utf8");

        // Check size limit
        if (size > ctx.policy.maxBytes) {
          return ToolResultBuilder.failureWithDuration(
            "SIZE_LIMIT",
            `File too large: ${size} bytes (max: ${ctx.policy.maxBytes})`,
            Date.now() - startTime
          );
        }

        return ToolResultBuilder.success({ content, size }, { durationMs: Date.now() - startTime });
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "READ_ERROR",
          error instanceof Error ? error.message : "Failed to read file",
          Date.now() - startTime
        );
      }
    },
  };
}

export function createFileWriteTool(): ToolSpec<FileWriteInput, { success: boolean; path: string }> {
  return {
    id: "fs.write",
    description: "Write content to a file within workspace",
    schema: toJSONSchema(FileWriteInputSchema),
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const validation = PathValidator.validate(input.path, ctx.workspaceRoot);

        if (!validation.valid || !validation.resolvedPath) {
          return ToolResultBuilder.failureWithDuration(
            "INVALID_PATH",
            validation.error ?? "Invalid path",
            Date.now() - startTime
          );
        }

        const targetPath = validation.resolvedPath;

        // Check content size
        const size = Buffer.byteLength(input.content, input.encoding ?? "utf8");
        if (size > ctx.policy.maxBytes) {
          return ToolResultBuilder.failureWithDuration(
            "SIZE_LIMIT",
            `Content too large: ${size} bytes (max: ${ctx.policy.maxBytes})`,
            Date.now() - startTime
          );
        }

        if (input.atomic !== false) {
          // Atomic write: write to temp file then rename
          const tempPath = `${targetPath}.tmp.${Date.now()}`;
          await fs.writeFile(tempPath, input.content, { encoding: input.encoding ?? "utf8" });
          await fs.rename(tempPath, targetPath);
        } else {
          await fs.writeFile(targetPath, input.content, { encoding: input.encoding ?? "utf8" });
        }

        return ToolResultBuilder.success(
          { success: true, path: input.path },
          { durationMs: Date.now() - startTime }
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "WRITE_ERROR",
          error instanceof Error ? error.message : "Failed to write file",
          Date.now() - startTime
        );
      }
    },
  };
}

export function createFileListTool(): ToolSpec<FileListInput, { entries: FileEntry[] }> {
  return {
    id: "fs.list",
    description: "List files and directories in a path",
    schema: toJSONSchema(FileListInputSchema),
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const validation = PathValidator.validate(input.path, ctx.workspaceRoot);

        if (!validation.valid || !validation.resolvedPath) {
          return ToolResultBuilder.failureWithDuration(
            "INVALID_PATH",
            validation.error ?? "Invalid path",
            Date.now() - startTime
          );
        }

        const targetPath = validation.resolvedPath;

        if (input.recursive) {
          const allPaths = await getFilesRecursively(targetPath, targetPath);
          const entries: FileEntry[] = [];

          for (const filePath of allPaths) {
            try {
              const stat = await fs.stat(filePath);
              const relativePath = path.relative(ctx.workspaceRoot, filePath);

              entries.push({
                name: path.basename(filePath),
                path: relativePath,
                type: "file",
                size: stat.size,
              });
            } catch {
              // Skip files that can't be accessed
            }
          }

          return ToolResultBuilder.success({ entries }, { durationMs: Date.now() - startTime });
        } else {
          const dirents = await fs.readdir(targetPath, { withFileTypes: true });
          const entries: FileEntry[] = [];

          for (const dirent of dirents) {
            const fullPath = path.join(targetPath, dirent.name);
            const relativePath = path.relative(ctx.workspaceRoot, fullPath);

            if (dirent.isFile()) {
              const stat = await fs.stat(fullPath);
              entries.push({
                name: dirent.name,
                path: relativePath,
                type: "file",
                size: stat.size,
              });
            } else if (dirent.isDirectory()) {
              entries.push({
                name: dirent.name,
                path: relativePath,
                type: "directory",
              });
            }
          }

          return ToolResultBuilder.success({ entries }, { durationMs: Date.now() - startTime });
        }
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "LIST_ERROR",
          error instanceof Error ? error.message : "Failed to list directory",
          Date.now() - startTime
        );
      }
    },
  };
}

export function createFileGlobTool(): ToolSpec<FileGlobInput, { paths: string[] }> {
  return {
    id: "fs.glob",
    description: "Find files matching a glob pattern within workspace",
    schema: toJSONSchema(FileGlobInputSchema),
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        // Glob patterns always use '/' as separator (cross-platform standard)
        // Split by '/' instead of path.sep to work correctly on Windows
        const parts = input.pattern.split("/");

        // Determine base directory for search
        let baseDir: string;
        if (parts[0] === "**" || parts[0] === "") {
          // "**/" or leading "/" means start from workspace root
          baseDir = ctx.workspaceRoot;
        } else if (parts.length === 1 && !parts[0].includes("/")) {
          // Simple pattern like "*.txt" - search from workspace root
          baseDir = ctx.workspaceRoot;
        } else {
          // Pattern with directory prefix like "src/**/*.ts"
          // Convert the first segment to a platform-specific path
          baseDir = path.join(ctx.workspaceRoot, parts[0]);
        }

        // Normalize the baseDir to an absolute path
        // This ensures getFilesRecursively can find the directory correctly
        baseDir = path.resolve(baseDir);

        // Get all files recursively from base directory
        const allFiles = await getFilesRecursively(baseDir, baseDir);

        // Normalize paths to use '/' for pattern matching (glob standard)
        // This ensures patterns work consistently across platforms
        const normalizeForGlob = (p: string): string => {
          return p.replace(/\\/g, "/");
        };

        // Filter by pattern
        const matched = allFiles.filter((filePath) => {
          const relativePath = normalizeForGlob(path.relative(ctx.workspaceRoot, filePath));

          // Convert glob pattern to regex
          // Pattern uses '/' as separator (glob standard)
          const patternRegex = input.pattern
            .replace(/\./g, "\\.")     // Literal dots
            .replace(/\*\*/g, ".*")     // ** matches any number of directories
            .replace(/\*/g, "[^/]*")    // * matches any characters except /
            .replace(/\?/g, ".");       // ? matches any single character

          const regex = new RegExp(`^${patternRegex}$`);
          return regex.test(relativePath);
        });

        const relativePaths = matched.map((p) => path.relative(ctx.workspaceRoot, p));

        return ToolResultBuilder.success({ paths: relativePaths }, { durationMs: Date.now() - startTime });
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "GLOB_ERROR",
          error instanceof Error ? error.message : "Failed to execute glob",
          Date.now() - startTime
        );
      }
    },
  };
}
