// Common formatting utilities for approval handlers

/**
 * Truncate a string to a maximum length.
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Format tool input for display in approval messages.
 * Truncates long inputs to prevent message overflow.
 */
export function formatInputForDisplay(input: unknown): string {
  if (input === null || input === undefined) {
    return "`(empty)`";
  }

  if (typeof input === "string") {
    return truncateString(input, 500);
  }

  if (typeof input === "object") {
    // For system.run, extract command and cwd
    const obj = input as Record<string, unknown>;
    if ("argv" in obj) {
      const argv = obj.argv as string | string[];
      const command = Array.isArray(argv) ? argv.join(" ") : argv;
      const cwd = obj.cwd as string | undefined;
      const result = `\`\`\`\n${command}${cwd ? `\n(cwd: ${cwd})` : ""}\n\`\`\``;
      return truncateString(result, 500);
    }
    const json = JSON.stringify(input, null, 2);
    return truncateString(`\`\`\`json\n${json}\n\`\`\``, 500);
  }

  return `\`\`\`${String(input)}\`\`\``;
}
