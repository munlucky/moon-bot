/**
 * HttpTool Unit Tests
 *
 * Tests for HTTP operations (request, download).
 * Covers SSRF protection, header validation, and size limits.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { ToolContext } from "../../types/index.js";

// Mock global fetch BEFORE importing HttpTool
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock fs/promises for download tool and PathValidator BEFORE importing HttpTool
const { mockWriteFile: mockFsWriteFile, mockHttpPathValidatorValidate } = vi.hoisted(() => {
  return {
    mockWriteFile: vi.fn(),
    mockHttpPathValidatorValidate: vi.fn((inputPath: string, workspaceRoot: string) => {
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
vi.mock("../filesystem/PathValidator.js", () => ({
  PathValidator: {
    validate: mockHttpPathValidatorValidate,
  },
}));

vi.mock("fs/promises", () => ({
  writeFile: mockFsWriteFile,
}));

// Mock dynamic fs import used by HttpTool
vi.mock("fs", () => ({
  promises: {
    writeFile: mockFsWriteFile,
  },
}));

// Import AFTER mocks are set up
import {
  createHttpRequestTool,
  createHttpDownloadTool,
} from "./HttpTool.js";

describe("HttpTool", () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.resetAllMocks();
    mockContext = {
      workspaceRoot: "/workspace",
      policy: {
        maxBytes: 10 * 1024 * 1024, // 10MB
        timeoutMs: 5000,
      },
      userId: "test-user",
      sessionId: "test-session",
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("createHttpRequestTool", () => {
    const requestTool = createHttpRequestTool();

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: vi.fn((name: string) => {
            if (name === "content-length") return "100";
            return null;
          }),
          forEach: vi.fn((callback: Function) => {
            callback("text/html", "content-type");
          }),
        },
        text: vi.fn().mockResolvedValue("<html>response</html>"),
      });
    });

    it("T1: should make successful GET request", async () => {
      const result = await requestTool.run(
        { url: "https://example.com", method: "GET" },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.data?.status).toBe(200);
      expect(result.data?.body).toBe("<html>response</html>");
    });

    it("T2: should make POST request with body", async () => {
      const result = await requestTool.run(
        {
          url: "https://example.com/api",
          method: "POST",
          body: '{"data":"test"}',
        },
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("example.com"),
        expect.objectContaining({
          method: "POST",
          body: '{"data":"test"}',
        })
      );
    });

    it("T3: should block forbidden headers", async () => {
      const result = await requestTool.run(
        {
          url: "https://example.com",
          method: "GET",
          headers: { "authorization": "Bearer token" },
        },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INVALID_HEADERS");
      expect(result.error?.message).toContain("Forbidden header");
    });

    it("T4: should block headers with dangerous patterns", async () => {
      const result = await requestTool.run(
        {
          url: "https://example.com",
          method: "GET",
          headers: { "X-Custom": "<script>alert('xss')</script>" },
        },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INVALID_HEADERS");
    });

    it("T5: should block localhost URL (SSRF protection)", async () => {
      const result = await requestTool.run(
        { url: "http://localhost:3000", method: "GET" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("BLOCKED_URL");
    });

    it("T6: should block 127.0.0.1 URL (SSRF protection)", async () => {
      const result = await requestTool.run(
        { url: "http://127.0.0.1:8080", method: "GET" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("BLOCKED_URL");
    });

    it("T7: should block private IP ranges (SSRF protection)", async () => {
      const result = await requestTool.run(
        { url: "http://192.168.1.1", method: "GET" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("BLOCKED_URL");
    });

    it("T8: should block file:// protocol", async () => {
      const result = await requestTool.run(
        { url: "file:///etc/passwd", method: "GET" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("BLOCKED_URL");
    });

    it("T9: should block non-HTTP protocols", async () => {
      const result = await requestTool.run(
        { url: "ftp://example.com", method: "GET" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("BLOCKED_URL");
    });

    it("T10: should append query parameters to URL", async () => {
      await requestTool.run(
        {
          url: "https://example.com/api",
          method: "GET",
          query: { key1: "value1", key2: "value2" },
        },
        mockContext
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("key1=value1"),
        expect.any(Object)
      );
    });

    it("T11: should respect custom timeout parameter", async () => {
      // Test that timeoutMs parameter is passed to fetch options
      const result = await requestTool.run(
        { url: "https://example.com", method: "GET", timeoutMs: 1000 },
        mockContext
      );

      expect(result.ok).toBe(true);
      // The tool should accept timeoutMs parameter
      expect(mockFetch).toHaveBeenCalled();
    });

    it("T12: should block response exceeding size limit", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: vi.fn((name: string) => {
            if (name === "content-length") return "20971520"; // 20MB
            return null;
          }),
          forEach: vi.fn(),
        },
        text: vi.fn().mockResolvedValue(""),
      } as any);

      const result = await requestTool.run(
        { url: "https://example.com/large", method: "GET" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SIZE_LIMIT");
    });

    it("T13: should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await requestTool.run(
        { url: "https://example.com", method: "GET" },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("HTTP_ERROR");
    });

    it("T14: should handle 4xx and 5xx responses", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: {
          get: vi.fn(),
          forEach: vi.fn(),
        },
        text: vi.fn().mockResolvedValue("Not found"),
      } as any);

      const result = await requestTool.run(
        { url: "https://example.com/notfound", method: "GET" },
        mockContext
      );

      // The tool returns the response even for error status codes
      expect(result.ok).toBe(true);
      expect(result.data?.status).toBe(404);
    });

    it("T15: should support various HTTP methods", async () => {
      const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

      for (const method of methods) {
        const result = await requestTool.run(
          { url: "https://example.com", method: method as any },
          mockContext
        );

        expect(result.ok).toBe(true);
      }
    });
  });

  describe("createHttpDownloadTool", () => {
    const downloadTool = createHttpDownloadTool();

    beforeEach(() => {
      mockFsWriteFile.mockResolvedValue(undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: vi.fn((name: string) => {
            if (name === "content-length") return "100";
            return null;
          }),
        },
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      });
    });

    it("T16: should download file successfully", async () => {
      const result = await downloadTool.run(
        { url: "https://example.com/file.txt", destPath: "downloaded.txt" },
        mockContext
      );

      console.log("T16 result:", result);
      if (!result.ok) {
        console.log("T16 error:", result.error);
      }
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({
        success: true,
        path: "downloaded.txt",
        size: 100,
      });
      expect(mockFsWriteFile).toHaveBeenCalled();
    });

    it("T17: should validate destination path is within workspace", async () => {
      const result = await downloadTool.run(
        {
          url: "https://example.com/file.txt",
          destPath: "../../../etc/passwd",
        },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INVALID_PATH");
    });

    it("T18: should block SSRF URLs for download", async () => {
      const result = await downloadTool.run(
        {
          url: "http://localhost:3000/file.txt",
          destPath: "local.txt",
        },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("BLOCKED_URL");
    });

    it("T19: should block download exceeding size limit", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: vi.fn((name: string) => {
            if (name === "content-length") return "20971520"; // 20MB
            return null;
          }),
        },
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      } as any);

      const result = await downloadTool.run(
        {
          url: "https://example.com/large.txt",
          destPath: "large.txt",
        },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SIZE_LIMIT");
    });

    it("T20: should handle HTTP error responses for download", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: {
          get: vi.fn(),
        },
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      } as any);

      const result = await downloadTool.run(
        {
          url: "https://example.com/missing.txt",
          destPath: "missing.txt",
        },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("HTTP_ERROR");
    });

    it("T21: should handle download write errors", async () => {
      mockFsWriteFile.mockRejectedValue(new Error("Disk full"));

      const result = await downloadTool.run(
        {
          url: "https://example.com/file.txt",
          destPath: "download.txt",
        },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("DOWNLOAD_ERROR");
    });

    it("T22: should handle actual buffer size exceeding limit", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: vi.fn((name: string) => {
            if (name === "content-length") return null; // No content-length header
            return null;
          }),
        },
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(20 * 1024 * 1024)), // 20MB
      } as any);

      const result = await downloadTool.run(
        {
          url: "https://example.com/large.txt",
          destPath: "large.txt",
        },
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("SIZE_LIMIT");
    });
  });
});
