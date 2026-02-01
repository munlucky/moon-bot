// SSRF (Server-Side Request Forgery) protection

import { URL } from "url";
import { lookup } from "dns/promises";

export interface SsrfCheckResult {
  allowed: boolean;
  reason?: string;
  resolvedIp?: string;
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
    { start: "127.0.0.0", end: "127.255.255.255" }, // 127.0.0.0/8 loopback
    { start: "169.254.0.0", end: "169.254.255.255" }, // 169.254.0.0/16 link-local
    { start: "0.0.0.0", end: "0.255.255.255" }, // 0.0.0.0/8
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
   * Supports both IPv4 and IPv6 addresses.
   */
  private static checkIpAddress(hostname: string): SsrfCheckResult {
    // Remove brackets from IPv6 addresses
    const cleanHostname = hostname.replace(/^\[|\]$/g, "");

    // Check IPv6 first
    const ipv6Check = this.checkIpv6Address(cleanHostname);
    if (ipv6Check !== null) {
      return ipv6Check;
    }

    // Check if it's an IP address (IPv4)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = cleanHostname.match(ipv4Regex);

    if (!match) {
      // Not an IP address, hostname will be resolved later
      return { allowed: true };
    }

    return this.checkIpv4Address(cleanHostname, match);
  }

  /**
   * Check if an IPv4 address is in a blocked range.
   */
  private static checkIpv4Address(hostname: string, match: RegExpMatchArray): SsrfCheckResult {
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
   * Check if an IPv6 address is in a blocked range.
   * Returns null if not a valid IPv6 address.
   */
  private static checkIpv6Address(address: string): SsrfCheckResult | null {
    // Basic IPv6 validation - contains at least one colon
    if (!address.includes(":")) {
      return null;
    }

    // Normalize the address to lowercase
    const normalized = address.toLowerCase();

    // Check loopback (::1)
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
      return { allowed: false, reason: "Blocked IPv6 loopback address" };
    }

    // Check unspecified (::)
    if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") {
      return { allowed: false, reason: "Blocked IPv6 unspecified address" };
    }

    // Expand the address for easier checking
    const expanded = this.expandIpv6(normalized);
    if (!expanded) {
      return { allowed: false, reason: "Invalid IPv6 address" };
    }

    // Check link-local (fe80::/10)
    if (expanded.startsWith("fe8") || expanded.startsWith("fe9") ||
        expanded.startsWith("fea") || expanded.startsWith("feb")) {
      return { allowed: false, reason: "Blocked IPv6 link-local address" };
    }

    // Check unique local (fc00::/7 = fc00:: to fdff::)
    if (expanded.startsWith("fc") || expanded.startsWith("fd")) {
      return { allowed: false, reason: "Blocked IPv6 unique local address" };
    }

    // Check multicast (ff00::/8)
    if (expanded.startsWith("ff")) {
      return { allowed: false, reason: "Blocked IPv6 multicast address" };
    }

    // Check IPv4-mapped IPv6 (::ffff:0:0/96)
    if (normalized.includes("::ffff:")) {
      const ipv4Part = normalized.split("::ffff:")[1];
      if (ipv4Part) {
        const ipv4Check = this.checkIpAddress(ipv4Part);
        if (!ipv4Check.allowed) {
          return { allowed: false, reason: `Blocked IPv4-mapped IPv6: ${ipv4Part}` };
        }
      }
    }

    // Check IPv4-compatible IPv6 (deprecated but still should block)
    // ::x.x.x.x format
    const ipv4CompatMatch = normalized.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (ipv4CompatMatch) {
      const ipv4Check = this.checkIpAddress(ipv4CompatMatch[1]);
      if (!ipv4Check.allowed) {
        return { allowed: false, reason: `Blocked IPv4-compatible IPv6: ${ipv4CompatMatch[1]}` };
      }
    }

    return { allowed: true };
  }

  /**
   * Expand a shortened IPv6 address to full form.
   * Returns the first 4 characters (first group) or null if invalid.
   */
  private static expandIpv6(address: string): string | null {
    try {
      // Handle :: expansion
      const parts = address.split("::");
      if (parts.length > 2) {
        return null; // Invalid: multiple ::
      }

      let groups: string[];
      if (parts.length === 2) {
        const left = parts[0] ? parts[0].split(":") : [];
        const right = parts[1] ? parts[1].split(":") : [];
        const missing = 8 - left.length - right.length;
        if (missing < 0) {
          return null;
        }
        groups = [...left, ...Array(missing).fill("0"), ...right];
      } else {
        groups = address.split(":");
      }

      if (groups.length !== 8) {
        // Might be IPv4-mapped, allow 7 groups + IPv4
        if (groups.length === 7 && groups[6]?.includes(".")) {
          return groups[0]?.padStart(4, "0") ?? null;
        }
        return null;
      }

      return groups[0]?.padStart(4, "0") ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Check multiple URLs at once.
   */
  static checkMany(urlStrings: string[]): SsrfCheckResult[] {
    return urlStrings.map((url) => this.checkUrl(url));
  }

  /**
   * Resolve hostname and check the resolved IP (DNS Rebinding defense).
   * This should be called right before making the actual request to prevent
   * DNS rebinding attacks where the attacker's DNS server returns different
   * IPs on subsequent lookups.
   *
   * @returns The resolved IP address if safe, or throws an error if blocked
   */
  static async resolveAndCheck(urlString: string): Promise<SsrfCheckResult> {
    // First, do static URL check
    const staticCheck = this.checkUrl(urlString);
    if (!staticCheck.allowed) {
      return staticCheck;
    }

    try {
      const url = new URL(urlString);
      const hostname = url.hostname.replace(/^\[|\]$/g, "");

      // Skip DNS resolution for IP addresses (using Node.js built-in net.isIP)
      const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      // Use net.isIP for robust IP address detection (returns 0 for non-IP, 4 for IPv4, 6 for IPv6)
      const { isIP } = await import("net");
      if (isIP(hostname) !== 0) {
        return { allowed: true, resolvedIp: hostname };
      }

      // Resolve hostname to IP address
      const { address, family } = await lookup(hostname);

      // Check the resolved IP address
      const ipCheck = family === 4
        ? this.checkIpv4Address(address, address.match(ipv4Regex)!)
        : this.checkIpv6Address(address);

      if (ipCheck && !ipCheck.allowed) {
        return {
          allowed: false,
          reason: `DNS resolved to blocked IP: ${address} (${ipCheck.reason})`,
        };
      }

      return { allowed: true, resolvedIp: address };
    } catch (error) {
      if (error instanceof Error && error.message.includes("Blocked")) {
        return { allowed: false, reason: error.message };
      }
      return {
        allowed: false,
        reason: `DNS resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Create a safe fetch function that uses the resolved IP to prevent DNS rebinding.
   * This replaces the hostname with the resolved IP in the URL while preserving
   * the original Host header for virtual hosting.
   */
  static createSafeFetchUrl(originalUrl: string, resolvedIp: string): { url: string; headers: Record<string, string> } {
    const url = new URL(originalUrl);
    const originalHost = url.host;

    // For IPv6, wrap in brackets
    const ipForUrl = resolvedIp.includes(":") ? `[${resolvedIp}]` : resolvedIp;

    // Replace hostname with resolved IP
    url.hostname = ipForUrl;

    return {
      url: url.toString(),
      headers: {
        Host: originalHost,
      },
    };
  }
}
