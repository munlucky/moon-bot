// Browser automation tool using Playwright
// Uses TypeBox for compile-time type safety

import type { ToolSpec } from "../../types/index.js";
import { SessionManager } from "./SessionManager.js";
import type { Browser, Page } from "playwright";
import { ToolResultBuilder } from "../runtime/ToolResultBuilder.js";
import {
  BrowserStartInputSchema,
  BrowserGotoInputSchema,
  BrowserSnapshotInputSchema,
  BrowserActInputSchema,
  BrowserScreenshotInputSchema,
  BrowserCloseInputSchema,
  BrowserExtractInputSchema,
  BrowserStartResultSchema,
  BrowserGotoResultSchema,
  BrowserSnapshotResultSchema,
  BrowserActResultSchema,
  BrowserScreenshotResultSchema,
  BrowserCloseResultSchema,
  BrowserExtractResultSchema,
  toJSONSchema,
  type BrowserStartInput,
  type BrowserGotoInput,
  type BrowserSnapshotInput,
  type BrowserActInput,
  type BrowserScreenshotInput,
  type BrowserCloseInput,
  type BrowserExtractInput,
  type BrowserStartResult,
  type BrowserGotoResult,
  type BrowserSnapshotResult,
  type BrowserActResult,
  type BrowserScreenshotResult,
  type BrowserCloseResult,
  type BrowserExtractResult,
} from "../schemas/TypeBoxSchemas.js";

// Lazy import Playwright to avoid issues if not installed
let playwright: typeof import("playwright") | null = null;

async function getPlaywright(): Promise<typeof import("playwright")> {
  if (!playwright) {
    playwright = await import("playwright");
  }
  return playwright;
}

// Interfaces now imported from TypeBoxSchemas

/**
 * Browser tool implementation using Playwright.
 */
export class BrowserTool {
  private browser: Browser | null = null;
  private sessionManager: SessionManager;

  constructor(maxConcurrent: number = 5) {
    this.sessionManager = new SessionManager(maxConcurrent);
  }

  /**
   * Initialize the browser (must be called before other operations).
   */
  async initialize(headless: boolean = true): Promise<void> {
    if (this.browser) {
      return;
    }

    const pw = await getPlaywright();
    this.browser = await pw.chromium.launch({ headless });
  }

  /**
   * Close the browser and all sessions.
   */
  async close(): Promise<void> {
    await this.sessionManager.closeAll();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Start a browser session.
   */
  async start(input: BrowserStartInput): Promise<BrowserStartResult> {
    if (!this.browser) {
      throw new Error("Browser not initialized. Call initialize() first.");
    }

    const session = await this.sessionManager.createSession(this.browser, {
      sessionKey: input.sessionKey,
      headless: input.headless ?? true,
    });

    return { sessionId: session.id };
  }

  /**
   * Navigate to a URL (HTTPS only).
   */
  async goto(input: BrowserGotoInput): Promise<BrowserGotoResult> {
    const session = await this.sessionManager.acquireLock(input.sessionKey ?? "default");

    if (!session) {
      throw new Error("Session not found. Call start() first.");
    }

    try {
      const url = input.url;

      // Security check: only allow HTTPS URLs
      if (!url.startsWith("https://") && !url.startsWith("http://")) {
        throw new Error(`Protocol not allowed: ${url}. Only http:// and https:// URLs are allowed.`);
      }

      // Security check: block file:// protocol
      if (url.startsWith("file://")) {
        throw new Error("file:// protocol is not allowed");
      }

      await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      return { success: true, url };
    } finally {
      this.sessionManager.releaseLock(input.sessionKey ?? "default");
    }
  }

  /**
   * Get an ARIA or DOM snapshot of the current page.
   */
  async snapshot(input: BrowserSnapshotInput): Promise<BrowserSnapshotResult> {
    const session = await this.sessionManager.acquireLock(input.sessionKey ?? "default");

    if (!session) {
      throw new Error("Session not found. Call start() first.");
    }

    try {
      if (input.mode === "aria") {
        // Get ARIA tree using Playwright's built-in methods
        const tree = await session.page.evaluate(`(() => {
          const getAriaTree = (el) => {
            const result = {
              role: el.getAttribute('role') || el.tagName.toLowerCase(),
              label: el.getAttribute('aria-label') || el.textContent?.slice(0, 50) || '',
              children: []
            };

            for (const child of el.children) {
              if (child.getAttribute('role') || ['BUTTON', 'INPUT', 'A', 'SELECT'].includes(child.tagName)) {
                result.children.push(getAriaTree(child));
              }
            }
            return result;
          };
          return getAriaTree(document.body);
        })()`);
        return { tree: JSON.stringify(tree, null, 2) };
      } else {
        const html = await session.page.content();
        return { tree: html };
      }
    } finally {
      this.sessionManager.releaseLock(input.sessionKey ?? "default");
    }
  }

  /**
   * Perform an action (click, type, key press).
   */
  async act(input: BrowserActInput): Promise<BrowserActResult> {
    const session = await this.sessionManager.acquireLock(input.sessionKey ?? "default");

    if (!session) {
      throw new Error("Session not found. Call start() first.");
    }

    try {
      switch (input.type) {
        case "click":
          await session.page.click(input.selector, { timeout: 5000 });
          break;
        case "type":
          if (!input.text) {
            throw new Error("Text is required for type action");
          }
          await session.page.fill(input.selector, input.text, { timeout: 5000 });
          break;
        case "press":
          if (!input.key) {
            throw new Error("Key is required for press action");
          }
          await session.page.press(input.selector, input.key, { timeout: 5000 });
          break;
        default:
          throw new Error(`Unknown action type: ${input.type}`);
      }

      return { success: true };
    } finally {
      this.sessionManager.releaseLock(input.sessionKey ?? "default");
    }
  }

  /**
   * Take a screenshot.
   */
  async screenshot(input: BrowserScreenshotInput): Promise<BrowserScreenshotResult> {
    const session = await this.sessionManager.acquireLock(input.sessionKey ?? "default");

    if (!session) {
      throw new Error("Session not found. Call start() first.");
    }

    try {
      const screenshot = await session.page.screenshot({
        fullPage: input.fullPage ?? false,
        type: "png",
      });

      const imageData = screenshot.toString("base64");

      return { imageData, format: "png" };
    } finally {
      this.sessionManager.releaseLock(input.sessionKey ?? "default");
    }
  }

  /**
   * Extract content from the page.
   */
  async extract(input: BrowserExtractInput): Promise<BrowserExtractResult> {
    const session = await this.sessionManager.acquireLock(input.sessionKey ?? "default");

    if (!session) {
      throw new Error("Session not found. Call start() first.");
    }

    try {
      switch (input.kind) {
        case "text":
          const text = await session.page.textContent(input.selector);
          return { content: text ?? "" };
        case "html":
          const html = await session.page.innerHTML(input.selector);
          return { content: html };
        case "attribute":
          if (!input.attribute) {
            throw new Error("Attribute name is required for attribute extraction");
          }
          const attr = await session.page.getAttribute(input.selector, input.attribute);
          return { content: attr ?? "" };
        default:
          throw new Error(`Unknown extraction kind: ${input.kind}`);
      }
    } finally {
      this.sessionManager.releaseLock(input.sessionKey ?? "default");
    }
  }

  /**
   * Close a session.
   */
  async closeSession(input: BrowserCloseInput): Promise<BrowserCloseResult> {
    await this.sessionManager.closeSession(input.sessionKey ?? "default");
    return { success: true };
  }
}

/**
 * Create tool specs for browser operations.
 */
export function createBrowserTools(browserTool: BrowserTool): ToolSpec[] {
  return [
    {
      id: "browser.start",
      description: "Start a browser session",
      schema: toJSONSchema(BrowserStartInputSchema),
      run: async (input) => {
        const startTime = Date.now();
        try {
          const data = await browserTool.start(input as BrowserStartInput);
          return ToolResultBuilder.success(data, { durationMs: Date.now() - startTime });
        } catch (error) {
          return ToolResultBuilder.failureWithDuration(
            "BROWSER_ERROR",
            error instanceof Error ? error.message : "Failed to start browser",
            Date.now() - startTime
          );
        }
      },
    },
    {
      id: "browser.goto",
      description: "Navigate to a URL (HTTPS only)",
      schema: toJSONSchema(BrowserGotoInputSchema),
      run: async (input) => {
        const startTime = Date.now();
        try {
          const data = await browserTool.goto(input as BrowserGotoInput);
          return ToolResultBuilder.success(data, { durationMs: Date.now() - startTime });
        } catch (error) {
          return ToolResultBuilder.failureWithDuration(
            "BROWSER_ERROR",
            error instanceof Error ? error.message : "Failed to navigate",
            Date.now() - startTime
          );
        }
      },
    },
    {
      id: "browser.snapshot",
      description: "Get ARIA or DOM snapshot of the page",
      schema: toJSONSchema(BrowserSnapshotInputSchema),
      run: async (input) => {
        const startTime = Date.now();
        try {
          const data = await browserTool.snapshot(input as BrowserSnapshotInput);
          return ToolResultBuilder.success(data, { durationMs: Date.now() - startTime });
        } catch (error) {
          return ToolResultBuilder.failureWithDuration(
            "BROWSER_ERROR",
            error instanceof Error ? error.message : "Failed to get snapshot",
            Date.now() - startTime
          );
        }
      },
    },
    {
      id: "browser.act",
      description: "Perform an action (click, type, press)",
      schema: toJSONSchema(BrowserActInputSchema),
      run: async (input) => {
        const startTime = Date.now();
        try {
          const data = await browserTool.act(input as BrowserActInput);
          return ToolResultBuilder.success(data, { durationMs: Date.now() - startTime });
        } catch (error) {
          return ToolResultBuilder.failureWithDuration(
            "BROWSER_ERROR",
            error instanceof Error ? error.message : "Failed to perform action",
            Date.now() - startTime
          );
        }
      },
    },
    {
      id: "browser.screenshot",
      description: "Take a screenshot",
      schema: toJSONSchema(BrowserScreenshotInputSchema),
      run: async (input) => {
        const startTime = Date.now();
        try {
          const data = await browserTool.screenshot(input as BrowserScreenshotInput);
          return ToolResultBuilder.success(data, { durationMs: Date.now() - startTime });
        } catch (error) {
          return ToolResultBuilder.failureWithDuration(
            "BROWSER_ERROR",
            error instanceof Error ? error.message : "Failed to take screenshot",
            Date.now() - startTime
          );
        }
      },
    },
    {
      id: "browser.extract",
      description: "Extract content from the page",
      schema: toJSONSchema(BrowserExtractInputSchema),
      run: async (input) => {
        const startTime = Date.now();
        try {
          const data = await browserTool.extract(input as BrowserExtractInput);
          return ToolResultBuilder.success(data, { durationMs: Date.now() - startTime });
        } catch (error) {
          return ToolResultBuilder.failureWithDuration(
            "BROWSER_ERROR",
            error instanceof Error ? error.message : "Failed to extract content",
            Date.now() - startTime
          );
        }
      },
    },
    {
      id: "browser.close",
      description: "Close a browser session",
      schema: toJSONSchema(BrowserCloseInputSchema),
      run: async (input) => {
        const startTime = Date.now();
        try {
          const data = await browserTool.closeSession(input as BrowserCloseInput);
          return ToolResultBuilder.success(data, { durationMs: Date.now() - startTime });
        } catch (error) {
          return ToolResultBuilder.failureWithDuration(
            "BROWSER_ERROR",
            error instanceof Error ? error.message : "Failed to close session",
            Date.now() - startTime
          );
        }
      },
    },
  ];
}
