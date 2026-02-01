/**
 * BrowserTool Unit Tests
 *
 * Tests for browser automation operations (start, goto, screenshot, act, extract, snapshot, close).
 * Covers session management, URL validation, and browser interactions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock Playwright BEFORE importing BrowserTool
const { mockPage, mockContext, mockBrowser, mockChromium } = vi.hoisted(() => {
  const page = {
    goto: vi.fn(),
    click: vi.fn(),
    fill: vi.fn(),
    press: vi.fn(),
    screenshot: vi.fn(),
    content: vi.fn(),
    textContent: vi.fn(),
    innerHTML: vi.fn(),
    getAttribute: vi.fn(),
    evaluate: vi.fn(),
    close: vi.fn(),
  };

  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn(),
  };

  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn(),
  };

  return {
    mockPage: page,
    mockContext: context,
    mockBrowser: browser,
    mockChromium: {
      launch: vi.fn().mockResolvedValue(browser),
    },
  };
});

vi.mock("playwright", () => ({
  default: {
    chromium: mockChromium,
  },
  chromium: mockChromium,
}));

// Import AFTER mocks are set up
import { BrowserTool } from "./BrowserTool.js";

describe("BrowserTool", () => {
  let browserTool: BrowserTool;

  beforeEach(() => {
    vi.clearAllMocks();
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
    it("T1: should create instance with default maxConcurrent", () => {
      const tool = new BrowserTool();
      expect(tool).toBeDefined();
    });

    it("T2: should create instance with custom maxConcurrent", () => {
      const tool = new BrowserTool(10);
      expect(tool).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("T3: should initialize browser successfully", async () => {
      await browserTool.initialize(true);

      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: true,
      });
    });

    it("T4: should initialize with headless=false", async () => {
      await browserTool.initialize(false);

      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: false,
      });
    });

    it("T5: should only initialize once", async () => {
      await browserTool.initialize(true);
      await browserTool.initialize(true);

      expect(mockChromium.launch).toHaveBeenCalledTimes(1);
    });

    it("T6: should handle Playwright import errors", async () => {
      // Mock launch to throw an error
      mockChromium.launch.mockRejectedValueOnce(new Error("Playwright not installed"));

      const errorTool = new BrowserTool();
      await expect(errorTool.initialize(true)).rejects.toThrow();
    });
  });

  describe("start", () => {
    beforeEach(async () => {
      await browserTool.initialize(true);
    });

    it("T7: should start a new session successfully", async () => {
      const result = await browserTool.start({ sessionKey: "test-session" });

      expect(result.sessionId).toBeDefined();
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
    });

    it("T8: should use default session key when not provided", async () => {
      const result = await browserTool.start({});

      expect(result.sessionId).toBeDefined();
    });

    it("T9: should use custom headless setting", async () => {
      const result = await browserTool.start({ sessionKey: "test", headless: false });

      expect(result.sessionId).toBeDefined();
    });

    it("T10: should throw error if browser not initialized", async () => {
      const uninitializedTool = new BrowserTool();

      await expect(
        uninitializedTool.start({ sessionKey: "test" })
      ).rejects.toThrow("Browser not initialized");
    });

    it("T11: should return existing session for same key", async () => {
      const result1 = await browserTool.start({ sessionKey: "test" });
      const result2 = await browserTool.start({ sessionKey: "test" });

      expect(result1.sessionId).toBe(result2.sessionId);
    });
  });

  describe("goto", () => {
    beforeEach(async () => {
      await browserTool.initialize(true);
      await browserTool.start({ sessionKey: "test" });
    });

    it("T12: should navigate to HTTPS URL successfully", async () => {
      mockPage.goto.mockResolvedValue(undefined);

      const result = await browserTool.goto({
        sessionKey: "test",
        url: "https://example.com",
      });

      expect(result.success).toBe(true);
      expect(result.url).toBe("https://example.com");
      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({ timeout: 30000 })
      );
    });

    it("T13: should navigate to HTTP URL successfully", async () => {
      mockPage.goto.mockResolvedValue(undefined);

      const result = await browserTool.goto({
        sessionKey: "test",
        url: "http://example.com",
      });

      expect(result.success).toBe(true);
      expect(mockPage.goto).toHaveBeenCalled();
    });

    it("T14: should block file:// protocol", async () => {
      await expect(
        browserTool.goto({
          sessionKey: "test",
          url: "file:///etc/passwd",
        })
      ).rejects.toThrow("file://");
    });

    it("T15: should reject non-existent session", async () => {
      await expect(
        browserTool.goto({
          sessionKey: "nonexistent",
          url: "https://example.com",
        })
      ).rejects.toThrow("Session not found");
    });

    it("T16: should handle navigation errors", async () => {
      mockPage.goto.mockRejectedValue(new Error("Navigation failed"));

      await expect(
        browserTool.goto({
          sessionKey: "test",
          url: "https://example.com",
        })
      ).rejects.toThrow();
    });
  });

  describe("screenshot", () => {
    beforeEach(async () => {
      await browserTool.initialize(true);
      await browserTool.start({ sessionKey: "test" });
    });

    it("T17: should take viewport screenshot successfully", async () => {
      const mockBuffer = Buffer.from("fake-image-data");
      mockPage.screenshot.mockResolvedValue(mockBuffer);

      const result = await browserTool.screenshot({
        sessionKey: "test",
        fullPage: false,
      });

      expect(result.imageData).toBeDefined();
      expect(result.format).toBe("png");
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        fullPage: false,
        type: "png",
      });
    });

    it("T18: should take full page screenshot", async () => {
      const mockBuffer = Buffer.from("fake-full-page");
      mockPage.screenshot.mockResolvedValue(mockBuffer);

      const result = await browserTool.screenshot({
        sessionKey: "test",
        fullPage: true,
      });

      expect(result.imageData).toBeDefined();
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        fullPage: true,
        type: "png",
      });
    });

    it("T19: should reject non-existent session", async () => {
      await expect(
        browserTool.screenshot({ sessionKey: "nonexistent" })
      ).rejects.toThrow("Session not found");
    });

    it("T20: should handle screenshot errors", async () => {
      mockPage.screenshot.mockRejectedValue(new Error("Screenshot failed"));

      await expect(
        browserTool.screenshot({ sessionKey: "test" })
      ).rejects.toThrow();
    });
  });

  describe("act", () => {
    beforeEach(async () => {
      await browserTool.initialize(true);
      await browserTool.start({ sessionKey: "test" });
    });

    it("T21: should perform click action successfully", async () => {
      mockPage.click.mockResolvedValue(undefined);

      const result = await browserTool.act({
        sessionKey: "test",
        type: "click",
        selector: "#submit-button",
      });

      expect(result.success).toBe(true);
      expect(mockPage.click).toHaveBeenCalledWith("#submit-button", {
        timeout: 5000,
      });
    });

    it("T22: should perform type action successfully", async () => {
      mockPage.fill.mockResolvedValue(undefined);

      const result = await browserTool.act({
        sessionKey: "test",
        type: "type",
        selector: "input[name='username']",
        text: "testuser",
      });

      expect(result.success).toBe(true);
      expect(mockPage.fill).toHaveBeenCalledWith(
        "input[name='username']",
        "testuser",
        { timeout: 5000 }
      );
    });

    it("T23: should perform press action successfully", async () => {
      mockPage.press.mockResolvedValue(undefined);

      const result = await browserTool.act({
        sessionKey: "test",
        type: "press",
        selector: "body",
        key: "Enter",
      });

      expect(result.success).toBe(true);
      expect(mockPage.press).toHaveBeenCalledWith("body", "Enter", {
        timeout: 5000,
      });
    });

    it("T24: should require text for type action", async () => {
      await expect(
        browserTool.act({
          sessionKey: "test",
          type: "type",
          selector: "input",
        })
      ).rejects.toThrow("Text is required for type action");
    });

    it("T25: should require key for press action", async () => {
      await expect(
        browserTool.act({
          sessionKey: "test",
          type: "press",
          selector: "body",
        })
      ).rejects.toThrow("Key is required for press action");
    });

    it("T26: should reject unknown action type", async () => {
      await expect(
        browserTool.act({
          sessionKey: "test",
          type: "unknown" as any,
          selector: "body",
        })
      ).rejects.toThrow("Unknown action type");
    });

    it("T27: should reject non-existent session", async () => {
      await expect(
        browserTool.act({
          sessionKey: "nonexistent",
          type: "click",
          selector: "button",
        })
      ).rejects.toThrow("Session not found");
    });
  });

  describe("extract", () => {
    beforeEach(async () => {
      await browserTool.initialize(true);
      await browserTool.start({ sessionKey: "test" });
    });

    it("T28: should extract text content successfully", async () => {
      mockPage.textContent.mockResolvedValue("Sample text content");

      const result = await browserTool.extract({
        sessionKey: "test",
        kind: "text",
        selector: ".content",
      });

      expect(result.content).toBe("Sample text content");
      expect(mockPage.textContent).toHaveBeenCalledWith(".content");
    });

    it("T29: should extract HTML content successfully", async () => {
      mockPage.innerHTML.mockResolvedValue("<div>HTML content</div>");

      const result = await browserTool.extract({
        sessionKey: "test",
        kind: "html",
        selector: ".content",
      });

      expect(result.content).toBe("<div>HTML content</div>");
      expect(mockPage.innerHTML).toHaveBeenCalledWith(".content");
    });

    it("T30: should extract attribute successfully", async () => {
      mockPage.getAttribute.mockResolvedValue("https://example.com");

      const result = await browserTool.extract({
        sessionKey: "test",
        kind: "attribute",
        selector: "a.link",
        attribute: "href",
      });

      expect(result.content).toBe("https://example.com");
      expect(mockPage.getAttribute).toHaveBeenCalledWith("a.link", "href");
    });

    it("T31: should require attribute for attribute extraction", async () => {
      await expect(
        browserTool.extract({
          sessionKey: "test",
          kind: "attribute",
          selector: "a",
        })
      ).rejects.toThrow("Attribute name is required");
    });

    it("T32: should reject unknown extraction kind", async () => {
      await expect(
        browserTool.extract({
          sessionKey: "test",
          kind: "unknown" as any,
          selector: "div",
        })
      ).rejects.toThrow("Unknown extraction kind");
    });

    it("T33: should reject non-existent session", async () => {
      await expect(
        browserTool.extract({
          sessionKey: "nonexistent",
          kind: "text",
          selector: "body",
        })
      ).rejects.toThrow("Session not found");
    });
  });

  describe("snapshot", () => {
    beforeEach(async () => {
      await browserTool.initialize(true);
      await browserTool.start({ sessionKey: "test" });
    });

    it("T34: should get ARIA snapshot successfully", async () => {
      const mockTree = { role: "document", children: [] };
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockTree);

      const result = await browserTool.snapshot({
        sessionKey: "test",
        mode: "aria",
      });

      expect(result.tree).toBeDefined();
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it("T35: should get DOM snapshot successfully", async () => {
      const mockHtml = "<html><body>Content</body></html>";
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.content.mockResolvedValue(mockHtml);

      const result = await browserTool.snapshot({
        sessionKey: "test",
        mode: "dom",
      });

      expect(result.tree).toBe(mockHtml);
      expect(mockPage.content).toHaveBeenCalled();
    });

    it("T36: should reject non-existent session", async () => {
      await expect(
        browserTool.snapshot({ sessionKey: "nonexistent", mode: "aria" })
      ).rejects.toThrow("Session not found");
    });
  });

  describe("closeSession", () => {
    beforeEach(async () => {
      await browserTool.initialize(true);
      await browserTool.start({ sessionKey: "test" });
    });

    it("T37: should close session successfully", async () => {
      const result = await browserTool.closeSession({ sessionKey: "test" });

      expect(result.success).toBe(true);
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
    });

    it("T38: should return success for non-existent session (idempotent)", async () => {
      const result = await browserTool.closeSession({ sessionKey: "nonexistent" });

      expect(result.success).toBe(true);
    });
  });

  describe("close", () => {
    it("T39: should close without error when browser not initialized", async () => {
      const uninitializedTool = new BrowserTool();

      await expect(uninitializedTool.close()).resolves.not.toThrow();
    });

    it("T40: should close browser and all sessions", async () => {
      await browserTool.initialize(true);
      await browserTool.start({ sessionKey: "test1" });
      await browserTool.start({ sessionKey: "test2" });

      await browserTool.close();

      expect(mockBrowser.close).toHaveBeenCalled();
      expect(mockPage.close).toHaveBeenCalledTimes(2);
    });

    it("T41: should allow re-initialize after close", async () => {
      await browserTool.initialize(true);
      await browserTool.close();
      await browserTool.initialize(true);

      expect(mockChromium.launch).toHaveBeenCalledTimes(2);
    });
  });
});
