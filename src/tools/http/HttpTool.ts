// HTTP Tool with SSRF protection

import type { ToolSpec } from "../../types/index.js";
import { SsrfGuard } from "./SsrfGuard.js";
import { ToolResultBuilder } from "../runtime/ToolResultBuilder.js";

interface HttpRequestInput {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/**
 * Validate HTTP headers for security.
 * Blocks dangerous headers and XSS patterns.
 */
function validateHeaders(headers?: Record<string, string>): { valid: boolean; reason?: string } {
  if (!headers) {
    return { valid: true };
  }

  // Headers that could be used for attacks or should be controlled by fetch
  const dangerousHeaders = [
    'host',                  // Could be used for cache poisoning
    'referer',               // Information leakage
    'origin',                // CORS bypass attempt
    'cookie',                // Credential forwarding
    'authorization',         // Credential forwarding
    'proxy-authorization',   // Credential forwarding
    'user-agent',            // Could be used for fingerprinting/injection
    'accept',                // Could manipulate content negotiation
    'accept-encoding',       // Could affect compression attacks
    'content-length',        // Could be used for request smuggling
    'content-type',          // Could bypass boundary checks
  ];

  // XSS and injection patterns in header values
  const forbiddenPatterns = [
    '<script',
    'javascript:',
    'onerror=',
    'onload=',
    'onclick=',
    'data:',
    'vbscript:',
  ];

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    // Check for forbidden headers
    if (dangerousHeaders.includes(lowerKey)) {
      return { valid: false, reason: `Forbidden header: ${key}` };
    }

    // Check for dangerous patterns in values
    const lowerValue = value.toLowerCase();
    for (const pattern of forbiddenPatterns) {
      if (lowerValue.includes(pattern)) {
        return { valid: false, reason: 'Dangerous content in headers' };
      }
    }
  }

  return { valid: true };
}

interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

interface HttpDownloadInput {
  url: string;
  destPath: string;
}

interface HttpDownloadResult {
  success: boolean;
  path: string;
  size: number;
}

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Create HTTP request tool with SSRF protection.
 */
export function createHttpRequestTool(): ToolSpec<HttpRequestInput, HttpResponse> {
  return {
    id: "http.request",
    description: "Make an HTTP request with SSRF protection",
    schema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        },
        url: { type: "string" },
        headers: { type: "object" },
        query: { type: "object" },
        body: { type: "string" },
        timeoutMs: { type: "number" },
      },
      required: ["method", "url"],
    },
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        // Validate headers for security
        if (input.headers) {
          const headerCheck = validateHeaders(input.headers);
          if (!headerCheck.valid) {
            return ToolResultBuilder.failureWithDuration(
              "INVALID_HEADERS",
              headerCheck.reason ?? "Invalid headers",
              Date.now() - startTime
            );
          }
        }

        // SSRF check
        const ssrfCheck = SsrfGuard.checkUrl(input.url);
        if (!ssrfCheck.allowed) {
          return ToolResultBuilder.failureWithDuration(
            "BLOCKED_URL",
            ssrfCheck.reason ?? "URL is blocked by security policy",
            Date.now() - startTime
          );
        }

        // Build URL with query params
        let url = input.url;
        if (input.query && Object.keys(input.query).length > 0) {
          const searchParams = new URLSearchParams();
          for (const [key, value] of Object.entries(input.query)) {
            searchParams.append(key, value);
          }
          const separator = url.includes("?") ? "&" : "?";
          url = `${url}${separator}${searchParams.toString()}`;
        }

        // Prepare fetch options
        const options: RequestInit = {
          method: input.method,
          headers: input.headers,
          body: input.body,
        };

        // Set timeout
        const timeoutMs = input.timeoutMs ?? ctx.policy.timeoutMs;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        options.signal = controller.signal;

        // Make request
        const response = await fetch(url, options);
        clearTimeout(timeoutId);

        // Get headers
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        // Check content length
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
          return ToolResultBuilder.failureWithDuration(
            "SIZE_LIMIT",
            `Response too large: ${contentLength} bytes (max: ${MAX_RESPONSE_SIZE})`,
            Date.now() - startTime
          );
        }

        // Get body with size limit
        const body = await response.text();
        if (body.length > MAX_RESPONSE_SIZE) {
          return ToolResultBuilder.failureWithDuration(
            "SIZE_LIMIT",
            "Response body exceeds size limit",
            Date.now() - startTime,
            { truncated: true }
          );
        }

        return ToolResultBuilder.success(
          { status: response.status, statusText: response.statusText, headers, body },
          { durationMs: Date.now() - startTime }
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "HTTP_ERROR",
          error instanceof Error ? error.message : "HTTP request failed",
          Date.now() - startTime
        );
      }
    },
  };
}

/**
 * Create HTTP download tool (requires filesystem access).
 * Note: This is optional and may not be available in all environments.
 */
export function createHttpDownloadTool(): ToolSpec<HttpDownloadInput, HttpDownloadResult> {
  return {
    id: "http.download",
    description: "Download a file from a URL (requires filesystem access)",
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        destPath: { type: "string", description: "Destination path relative to workspace" },
      },
      required: ["url", "destPath"],
    },
    run: async (input, ctx) => {
      const startTime = Date.now();

      try {
        // SSRF check
        const ssrfCheck = SsrfGuard.checkUrl(input.url);
        if (!ssrfCheck.allowed) {
          return ToolResultBuilder.failureWithDuration(
            "BLOCKED_URL",
            ssrfCheck.reason ?? "URL is blocked by security policy",
            Date.now() - startTime
          );
        }

        // Validate destination path
        const { PathValidator } = await import("../filesystem/PathValidator.js");
        const pathValidation = PathValidator.validate(input.destPath, ctx.workspaceRoot);

        if (!pathValidation.valid) {
          return ToolResultBuilder.failureWithDuration(
            "INVALID_PATH",
            pathValidation.error ?? "Invalid destination path",
            Date.now() - startTime
          );
        }

        // Set timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ctx.policy.timeoutMs);

        // Download with size limit
        const response = await fetch(input.url, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          return ToolResultBuilder.failureWithDuration(
            "HTTP_ERROR",
            `HTTP ${response.status}: ${response.statusText}`,
            Date.now() - startTime
          );
        }

        // Check content length
        const contentLength = response.headers.get("content-length");
        const maxSize = ctx.policy.maxBytes;

        if (contentLength && parseInt(contentLength, 10) > maxSize) {
          return ToolResultBuilder.failureWithDuration(
            "SIZE_LIMIT",
            `File too large: ${contentLength} bytes (max: ${maxSize})`,
            Date.now() - startTime
          );
        }

        // Get buffer
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > maxSize) {
          return ToolResultBuilder.failureWithDuration(
            "SIZE_LIMIT",
            "Downloaded file exceeds size limit",
            Date.now() - startTime
          );
        }

        // Write to file
        const { promises: fs } = await import("fs");
        await fs.writeFile(pathValidation.resolvedPath!, Buffer.from(buffer));

        return ToolResultBuilder.success(
          { success: true, path: input.destPath, size: buffer.byteLength },
          { durationMs: Date.now() - startTime }
        );
      } catch (error) {
        return ToolResultBuilder.failureWithDuration(
          "DOWNLOAD_ERROR",
          error instanceof Error ? error.message : "Download failed",
          Date.now() - startTime
        );
      }
    },
  };
}
