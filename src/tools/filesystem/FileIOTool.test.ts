/**
 * FileIOTool Unit Tests
 *
 * Tests for file system operations (read, write, list, glob).
 * Covers path validation, size limits, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ToolContext } from "../../types/index.js";

// Mock fs/promises and PathValidator BEFORE importing FileIOTool
const { mockReadFile, mockWriteFile, mockReaddir, mockStat, mockRename, mockPathValidatorValidate } = vi.hoisted(() => {
  return {
    mockReadFile: vi.fn(),
    mockWriteFile: vi.fn(),
    mockReaddir: vi.fn(),
    mockStat: vi.fn(),
    mockRename: vi.fn(),
    mockPathValidatorValidate: vi.fn((inputPath: string, workspaceRoot: string) => {
      // Simple mock: reject absolute paths outside workspace, reject paths with ".." at start
      // Relative paths within workspace are valid
      if (inputPath.startsWith("/") && !inputPath.startsWith(workspaceRoot)) {
        return {
          valid: false,
          error: "Path traversal detected: path outside workspace boundary",
        };
      }
      // Reject paths starting with ".."
      if (inputPath.startsWith("..") || inputPath.includes("../")) {
        return {
          valid: false,
          error: "Path traversal detected: '..' not allowed",
        };
      }
      // Valid path
      return {
        valid: true,
        resolvedPath: workspaceRoot + "/" + inputPath.replace(/^\.\//, ""),
      };
    }),
  };
});

// Mock PathValidator
vi.mock("./PathValidator.js", () => ({
  PathValidator: {
    validate: mockPathValidatorValidate,
  },
}));

vi.mock("fs/promises", async () => {
  const actual = await vi.importActual<typeof import("fs/promises")>("fs/promises");
  return {
    ...actual,
    default: {
      ...actual,
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      readdir: mockReaddir,
      stat: mockStat,
      rename: mockRename,
    },
  };
});

// Import AFTER mocks are set up
import {
  createFileReadTool,
  createFileWriteTool,
  createFileListTool,
  createFileGlobTool,
} from "./FileIOTool.js";

describe("FileIOTool", () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.resetAllMocks();
    mockContext = {
      workspaceRoot: "/workspace",
      policy: {
        maxBytes: 1024 * 1024, // 1MB
        timeoutMs: 5000,
      },
      userId: "test-user",
      sessionId: "test-session",
    };
  });

  describe("createFileReadTool", () => {
    const readTool = createFileReadTool();

    it("T1: should read file successfully", async () => {
      mockReadFile.mockResolvedValue("file content");
      mockStat.mockResolvedValue({ size: 100 });

      const result = await readTool.run({ path: "test.txt" }, mockContext);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({
        content: "file content",
        size: expect.any(Number),
      });
    });

    it("T2: should reject path outside workspace", async () => {
      // Use absolute path outside workspace
      const result = await readTool.run({ path: "/etc/passwd" }, mockContext);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INVALID_PATH");
    });

    it("T3: should reject file exceeding size limit", async () => {
      const largeContent = "x".repeat(2 * 1024 * 1024); // 2MB
      mockReadFile.mockResolvedValue(largeContent);

      const result = await readTool.run({ path: "large.txt" }, mockContext);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SIZE_LIMIT");
    });

    it("T4: should handle file read errors", async () => {
      mockReadFile.mockRejectedValue(new Error("Permission denied"));

      const result = await readTool.run({ path: "restricted.txt" }, mockContext);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("READ_ERROR");
    });

    it("T5: should support different encodings", async () => {
      mockReadFile.mockResolvedValue("buffer content");
      mockStat.mockResolvedValue({ size: 50 });

      const result = await readTool.run({ path: "test.txt", encoding: "base64" }, mockContext);

      expect(result.ok).toBe(true);
      expect(mockReadFile).toHaveBeenCalledWith(expect.any(String), { encoding: "base64" });
    });
  });

  describe("createFileWriteTool", () => {
    const writeTool = createFileWriteTool();

    beforeEach(() => {
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);
    });

    it("T6: should write file successfully with atomic write", async () => {
      const result = await writeTool.run(
        { path: "test.txt", content: "hello world" },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({
        success: true,
        path: "test.txt",
      });
      expect(mockRename).toHaveBeenCalled(); // Atomic write uses rename
    });

    it("T7: should write file non-atomically when atomic=false", async () => {
      const result = await writeTool.run(
        { path: "test.txt", content: "hello", atomic: false },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining("test.txt"),
        "hello",
        { encoding: "utf8" }
      );
    });

    it("T8: should reject path outside workspace", async () => {
      const result = await writeTool.run(
        { path: "/etc/passwd", content: "malicious" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INVALID_PATH");
    });

    it("T9: should reject content exceeding size limit", async () => {
      const largeContent = "x".repeat(2 * 1024 * 1024); // 2MB

      const result = await writeTool.run(
        { path: "large.txt", content: largeContent },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SIZE_LIMIT");
    });

    it("T10: should handle write errors", async () => {
      mockWriteFile.mockRejectedValue(new Error("Disk full"));

      const result = await writeTool.run(
        { path: "test.txt", content: "data", atomic: false },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("WRITE_ERROR");
    });

    it("T11: should support different encodings", async () => {
      const result = await writeTool.run(
        { path: "test.txt", content: "aGVsbG8=", encoding: "base64", atomic: false },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        "aGVsbG8=",
        { encoding: "base64" }
      );
    });
  });

  describe("createFileListTool", () => {
    const listTool = createFileListTool();

    beforeEach(() => {
      mockReaddir.mockResolvedValue([]);
      mockStat.mockResolvedValue({ size: 100 });
    });

    it("T12: should list files non-recursively", async () => {
      const mockEntries = [
        { name: "file1.txt", isFile: () => true, isDirectory: () => false },
        { name: "file2.txt", isFile: () => true, isDirectory: () => false },
        { name: "subdir", isFile: () => false, isDirectory: () => true },
      ] as any;
      mockReaddir.mockResolvedValue(mockEntries);

      const result = await listTool.run({ path: ".", recursive: false }, mockContext);

      expect(result.ok).toBe(true);
      expect(result.data?.entries).toHaveLength(3);
      expect(result.data?.entries[0]).toMatchObject({
        name: "file1.txt",
        type: "file",
        size: expect.any(Number),
      });
    });

    it("T13: should list files recursively", async () => {
      mockReaddir.mockImplementation(async (dirPath: string) => {
        if (dirPath === "/workspace" || dirPath === "/workspace/.") {
          return [
            { name: "file.txt", isFile: () => true, isDirectory: () => false },
            { name: "subdir", isFile: () => false, isDirectory: () => true },
          ] as any;
        }
        return [
          { name: "nested.txt", isFile: () => true, isDirectory: () => false },
        ] as any;
      });

      const result = await listTool.run({ path: ".", recursive: true }, mockContext);

      expect(result.ok).toBe(true);
      expect(result.data?.entries.length).toBeGreaterThan(0);
    });

    it("T14: should reject path outside workspace", async () => {
      const result = await listTool.run({ path: "/etc", recursive: false }, mockContext);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INVALID_PATH");
    });

    it("T15: should handle directory read errors", async () => {
      mockReaddir.mockRejectedValue(new Error("Permission denied"));

      const result = await listTool.run({ path: "restricted", recursive: false }, mockContext);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("LIST_ERROR");
    });

    it("T16: should handle inaccessible files in recursive mode", async () => {
      mockReaddir.mockImplementation(async () => {
        throw new Error("Cannot read");
      });

      const result = await listTool.run({ path: ".", recursive: true }, mockContext);

      // Should still succeed but with empty entries for inaccessible directories
      expect(result.ok).toBe(true);
    });
  });

  describe("createFileGlobTool", () => {
    const globTool = createFileGlobTool();

    // Helper to create mock directory entries
    const createMockDirent = (name: string, isDir: boolean): import("fs").Dirent => ({
      name,
      isFile: () => !isDir,
      isDirectory: () => isDir,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      path: "",
      parentPath: "",
    });

    it("T17: should match files with glob pattern at workspace root", async () => {
      // Mock virtual file system structure
      mockReaddir.mockImplementation(async (dirPath: string) => {
        if (dirPath === "/workspace" || dirPath === "/workspace/.") {
          return [
            createMockDirent("test.txt", false),
            createMockDirent("test.js", false),
            createMockDirent("other.txt", false),
            createMockDirent("src", true),
          ] as import("fs").Dirent[];
        }
        if (dirPath === "/workspace/src") {
          return [createMockDirent("file.ts", false)] as import("fs").Dirent[];
        }
        return [];
      });

      mockStat.mockResolvedValue({ size: 100 } as import("fs").Stats);

      const result = await globTool.run({ pattern: "*.txt" }, mockContext);

      expect(result.ok).toBe(true);
      expect(result.data?.paths).toBeDefined();
      expect(result.data?.paths.length).toBeGreaterThanOrEqual(2);
      expect(result.data?.paths).toContain("test.txt");
      expect(result.data?.paths).toContain("other.txt");
    });

    it("T18: should match files in subdirectories", async () => {
      // Mock virtual file system with subdirectory
      mockReaddir.mockImplementation(async (dirPath: string) => {
        if (dirPath === "/workspace" || dirPath === "/workspace/.") {
          return [
            createMockDirent("test.txt", false),
            createMockDirent("src", true),
          ] as import("fs").Dirent[];
        }
        if (dirPath === "/workspace/src") {
          return [createMockDirent("file.ts", false)] as import("fs").Dirent[];
        }
        return [];
      });

      mockStat.mockResolvedValue({ size: 100 } as import("fs").Stats);

      const result = await globTool.run({ pattern: "src/file.ts" }, mockContext);

      expect(result.ok).toBe(true);
      expect(result.data?.paths).toBeDefined();
      // Check for the file in paths (platform-independent)
      const hasFile = result.data?.paths.some(
        (p: string) => p === "src/file.ts" || p === "src\\file.ts"
      );
      expect(hasFile).toBe(true);
    });

    it("T19: should return empty array when no matches", async () => {
      const result = await globTool.run({ pattern: "nonexistent*" }, mockContext);

      expect(result.ok).toBe(true);
      expect(result.data?.paths).toEqual([]);
    });

    it("T20: should handle glob errors gracefully", async () => {
      // The implementation silently handles readdir errors in getFilesRecursively
      // by returning empty array, so the glob succeeds with no matches
      mockReaddir.mockRejectedValue(new Error("Cannot read"));

      const result = await globTool.run({ pattern: "*.txt" }, mockContext);

      // Returns success with empty paths due to error handling in implementation
      expect(result.ok).toBe(true);
      expect(result.data?.paths).toEqual([]);
    });
  });
});
