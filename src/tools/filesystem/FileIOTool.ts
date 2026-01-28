// File I/O Tool with workspace boundary enforcement

import fs from "fs/promises";
import path from "path";
import type { ToolSpec, ToolResult } from "../../types/index.js";
import { PathValidator } from "./PathValidator.js";

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

interface FileReadInput {
  path: string;
  encoding?: BufferEncoding;
}

interface FileWriteInput {
  path: string;
  content: string;
  encoding?: BufferEncoding;
  atomic?: boolean;
}

interface FileListInput {
  path: string;
  recursive?: boolean;
}

interface FileGlobInput {
  pattern: string;
}

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

/**
 * Create file I/O tools for read, write, list, and glob operations.
 */
export function createFileReadTool(): ToolSpec<FileReadInput, { content: string; size: number }> {
  return {
    id: "fs.read",
    description: "Read file content from within workspace",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        encoding: { type: "string", enum: ["utf8", "ascii", "base64"], default: "utf8" },
      },
      required: ["path"],
    },
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const validation = PathValidator.validate(input.path, ctx.workspaceRoot);

        if (!validation.valid) {
          return {
            ok: false,
            error: { code: "INVALID_PATH", message: validation.error ?? "Invalid path" },
            meta: { durationMs: Date.now() - startTime },
          };
        }

        const content = await fs.readFile(validation.resolvedPath!, {
          encoding: input.encoding ?? "utf8",
        });

        const size = Buffer.byteLength(content, input.encoding ?? "utf8");

        // Check size limit
        if (size > ctx.policy.maxBytes) {
          return {
            ok: false,
            error: {
              code: "SIZE_LIMIT",
              message: `File too large: ${size} bytes (max: ${ctx.policy.maxBytes})`,
            },
            meta: { durationMs: Date.now() - startTime },
          };
        }

        return {
          ok: true,
          data: { content, size },
          meta: { durationMs: Date.now() - startTime },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "READ_ERROR",
            message: error instanceof Error ? error.message : "Failed to read file",
          },
          meta: { durationMs: Date.now() - startTime },
        };
      }
    },
  };
}

export function createFileWriteTool(): ToolSpec<FileWriteInput, { success: boolean; path: string }> {
  return {
    id: "fs.write",
    description: "Write content to a file within workspace",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
        content: { type: "string", description: "Content to write" },
        encoding: { type: "string", enum: ["utf8", "ascii", "base64"], default: "utf8" },
        atomic: { type: "boolean", default: true },
      },
      required: ["path", "content"],
    },
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const validation = PathValidator.validate(input.path, ctx.workspaceRoot);

        if (!validation.valid) {
          return {
            ok: false,
            error: { code: "INVALID_PATH", message: validation.error ?? "Invalid path" },
            meta: { durationMs: Date.now() - startTime },
          };
        }

        const targetPath = validation.resolvedPath!;

        // Check content size
        const size = Buffer.byteLength(input.content, input.encoding ?? "utf8");
        if (size > ctx.policy.maxBytes) {
          return {
            ok: false,
            error: {
              code: "SIZE_LIMIT",
              message: `Content too large: ${size} bytes (max: ${ctx.policy.maxBytes})`,
            },
            meta: { durationMs: Date.now() - startTime },
          };
        }

        if (input.atomic !== false) {
          // Atomic write: write to temp file then rename
          const tempPath = `${targetPath}.tmp.${Date.now()}`;
          await fs.writeFile(tempPath, input.content, { encoding: input.encoding ?? "utf8" });
          await fs.rename(tempPath, targetPath);
        } else {
          await fs.writeFile(targetPath, input.content, { encoding: input.encoding ?? "utf8" });
        }

        return {
          ok: true,
          data: { success: true, path: input.path },
          meta: { durationMs: Date.now() - startTime },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "WRITE_ERROR",
            message: error instanceof Error ? error.message : "Failed to write file",
          },
          meta: { durationMs: Date.now() - startTime },
        };
      }
    },
  };
}

export function createFileListTool(): ToolSpec<FileListInput, { entries: FileEntry[] }> {
  return {
    id: "fs.list",
    description: "List files and directories in a path",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to workspace root" },
        recursive: { type: "boolean", default: false },
      },
      required: ["path"],
    },
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        const validation = PathValidator.validate(input.path, ctx.workspaceRoot);

        if (!validation.valid) {
          return {
            ok: false,
            error: { code: "INVALID_PATH", message: validation.error ?? "Invalid path" },
            meta: { durationMs: Date.now() - startTime },
          };
        }

        const targetPath = validation.resolvedPath!;

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

          return {
            ok: true,
            data: { entries },
            meta: { durationMs: Date.now() - startTime },
          };
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

          return {
            ok: true,
            data: { entries },
            meta: { durationMs: Date.now() - startTime },
          };
        }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "LIST_ERROR",
            message: error instanceof Error ? error.message : "Failed to list directory",
          },
          meta: { durationMs: Date.now() - startTime },
        };
      }
    },
  };
}

export function createFileGlobTool(): ToolSpec<FileGlobInput, { paths: string[] }> {
  return {
    id: "fs.glob",
    description: "Find files matching a glob pattern within workspace",
    schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g., '**/*.ts')" },
      },
      required: ["pattern"],
    },
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        // Simple glob pattern matching
        const parts = input.pattern.split(path.sep);
        const baseDir = parts[0] === "**" ? ctx.workspaceRoot : path.join(ctx.workspaceRoot, parts[0]);

        // Get all files recursively
        const allFiles = await getFilesRecursively(baseDir, baseDir);

        // Filter by pattern
        const matched = allFiles.filter((filePath) => {
          const relativePath = path.relative(ctx.workspaceRoot, filePath);

          // Convert glob pattern to regex
          let patternRegex = input.pattern
            .replace(/\./g, "\\.")
            .replace(/\*\*/g, ".*")
            .replace(/\*/g, "[^/]*")
            .replace(/\?/g, ".");

          // Handle platform-specific path separators
          if (path.sep === "\\") {
            patternRegex = patternRegex.replace(/\//g, "\\\\");
          }

          const regex = new RegExp(`^${patternRegex}$`);
          return regex.test(relativePath);
        });

        const relativePaths = matched.map((p) => path.relative(ctx.workspaceRoot, p));

        return {
          ok: true,
          data: { paths: relativePaths },
          meta: { durationMs: Date.now() - startTime },
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "GLOB_ERROR",
            message: error instanceof Error ? error.message : "Failed to execute glob",
          },
          meta: { durationMs: Date.now() - startTime },
        };
      }
    },
  };
}
