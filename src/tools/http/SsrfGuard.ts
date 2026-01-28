// SSRF (Server-Side Request Forgery) protection

import { URL } from "url";

export interface SsrfCheckResult {
  allowed: boolean;
  reason?: string;
}

export class SsrfGuard {
  private static readonly BLOCKED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "169.254.169.254", // AWS metadata
  ];

  private static readonly BLOCKED_IP_RANGES = [
    { start: "10.0.0.0", end: "10.255.255.255" }, // 10.0.0.0/8
    { start: "172.16.0.0", end: "172.31.255.255" }, // 172.16.0.0/12
    { start: "192.168.0.0", end: "192.168.255.255" }, // 192.168.0.0/16
  ];

  private static readonly ALLOWED_PROTOCOLS = ["http:", "https:"];

  /**
   * Check if a URL is safe to make a request to.
   */
  static checkUrl(urlString: string): SsrfCheckResult {
    try {
      const url = new URL(urlString);

      // Check protocol
      if (!this.ALLOWED_PROTOCOLS.includes(url.protocol)) {
        return {
          allowed: false,
          reason: `Protocol not allowed: ${url.protocol}`,
        };
      }

      // Check for blocked hosts
      const hostname = url.hostname.toLowerCase();
      if (this.BLOCKED_HOSTS.some((blocked) => hostname === blocked)) {
        return {
          allowed: false,
          reason: `Blocked hostname: ${hostname}`,
        };
      }

      // Check if hostname is an IP address in blocked range
      const ipCheck = this.checkIpAddress(hostname);
      if (!ipCheck.allowed) {
        return ipCheck;
      }

      // Check for file:// protocol (should already be blocked by protocol check)
      if (urlString.toLowerCase().startsWith("file://")) {
        return {
          allowed: false,
          reason: "file:// protocol is not allowed",
        };
      }

      return { allowed: true };
    } catch (error) {
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : "Invalid URL",
      };
    }
  }

  /**
   * Check if an IP address is in a blocked private range.
   */
  private static checkIpAddress(hostname: string): SsrfCheckResult {
    // Check if it's an IP address (IPv4)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);

    if (!match) {
      // Not an IPv4 address, might be IPv6 or hostname
      // For simplicity, we'll allow hostnames that aren't in BLOCKED_HOSTS
      return { allowed: true };
    }

    const ipParts = match.slice(1, 5).map(Number);

    // Check if octets are valid (0-255)
    if (ipParts.some((part) => part > 255 || part < 0)) {
      return { allowed: false, reason: "Invalid IP address" };
    }

    // Convert IP to number for comparison
    const ipNumber =
      ipParts[0] * 256 ** 3 + ipParts[1] * 256 ** 2 + ipParts[2] * 256 + ipParts[3];

    // Check against blocked ranges
    for (const range of this.BLOCKED_IP_RANGES) {
      const startParts = range.start.split(".").map(Number);
      const endParts = range.end.split(".").map(Number);

      const start =
        startParts[0] * 256 ** 3 + startParts[1] * 256 ** 2 + startParts[2] * 256 + startParts[3];
      const end =
        endParts[0] * 256 ** 3 + endParts[1] * 256 ** 2 + endParts[2] * 256 + endParts[3];

      if (ipNumber >= start && ipNumber <= end) {
        return {
          allowed: false,
          reason: `Blocked private IP range: ${hostname}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check multiple URLs at once.
   */
  static checkMany(urlStrings: string[]): SsrfCheckResult[] {
    return urlStrings.map((url) => this.checkUrl(url));
  }
}
