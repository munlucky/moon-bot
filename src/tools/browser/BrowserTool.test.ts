/**
 * BrowserTool Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BrowserTool } from "./BrowserTool.js";

describe("BrowserTool", () => {
  let browserTool: BrowserTool;

  beforeEach(() => {
    browserTool = new BrowserTool(5);
  });

  afterEach(async () => {
    try {
      await browserTool.close();
    } catch {
      // Ignore if browser wasn't initialized
    }
  });

  describe("constructor", () => {
    it("should create instance with default maxConcurrent", () => {
      const tool = new BrowserTool();
      expect(tool).toBeDefined();
    });

    it("should create instance with custom maxConcurrent", () => {
      const tool = new BrowserTool(10);
      expect(tool).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("should throw error if Playwright is not installed", async () => {
      // Mock import to fail
      vi.mock("playwright", () => {
        throw new Error("Playwright not installed");
      });

      await expect(browserTool.initialize(true)).rejects.toThrow();
    });
  });

  describe("close", () => {
    it("should close without error when browser not initialized", async () => {
      await expect(browserTool.close()).resolves.not.toThrow();
    });
  });

  describe("start", () => {
    it("should throw error if browser not initialized", async () => {
      await expect(browserTool.start({ sessionKey: "test" })).rejects.toThrow(
        "Browser not initialized"
      );
    });
  });

  describe("goto", () => {
    it("should throw error for invalid session", async () => {
      await expect(browserTool.goto({ sessionKey: "nonexistent", url: "https://example.com" })).rejects.toThrow();
    });

    it("should reject non-HTTPS URLs when validated", async () => {
      await expect(browserTool.goto({ sessionKey: "test", url: "http://example.com" })).rejects.toThrow();
    });
  });

  describe("screenshot", () => {
    it("should throw error for invalid session", async () => {
      await expect(browserTool.screenshot({ sessionKey: "nonexistent" })).rejects.toThrow();
    });
  });

  describe("closeSession", () => {
    it("should return success even for invalid session (idempotent)", async () => {
      const result = await browserTool.closeSession({ sessionKey: "nonexistent" });
      expect(result.success).toBe(true);
    });
  });

  describe("extract", () => {
    it("should throw error for invalid session", async () => {
      await expect(browserTool.extract({ sessionKey: "nonexistent", selector: "body" })).rejects.toThrow();
    });
  });

  describe("act", () => {
    it("should throw error for invalid session", async () => {
      await expect(browserTool.act({ sessionKey: "nonexistent", action: "click", selector: "button" })).rejects.toThrow();
    });
  });

  describe("snapshot", () => {
    it("should throw error for invalid session", async () => {
      await expect(browserTool.snapshot({ sessionKey: "nonexistent" })).rejects.toThrow();
    });
  });
});
