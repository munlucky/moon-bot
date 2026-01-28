// Path validation for workspace boundary enforcement

import path from "path";

export interface PathValidationResult {
  valid: boolean;
  resolvedPath?: string;
  error?: string;
}

export class PathValidator {
  /**
   * Validate and resolve a path to ensure it stays within workspace root.
   * Prevents directory traversal attacks using ".." segments.
   */
  static validate(inputPath: string, workspaceRoot: string): PathValidationResult {
    // Normalize workspace root
    const normalizedWorkspace = path.normalize(workspaceRoot);

    // Normalize the input path
    const normalized = path.normalize(inputPath);

    // Check for remaining ".." (should be resolved by normalize, but double-check)
    if (normalized.includes("..")) {
      return {
        valid: false,
        error: "Path traversal detected: '..' not allowed",
      };
    }

    // Resolve against workspace root
    const resolved = path.resolve(normalizedWorkspace, normalized);

    // Ensure the resolved path is within workspace root
    if (!resolved.startsWith(normalizedWorkspace)) {
      return {
        valid: false,
        error: "Path traversal detected: path outside workspace boundary",
      };
    }

    return { valid: true, resolvedPath: resolved };
  }

  /**
   * Validate multiple paths at once.
   */
  static validateMany(inputPaths: string[], workspaceRoot: string): {
    valid: boolean;
    results: PathValidationResult[];
  } {
    const results = inputPaths.map((p) => PathValidator.validate(p, workspaceRoot));
    const allValid = results.every((r) => r.valid);

    return { valid: allValid, results };
  }

  /**
   * Check if a path is absolute or relative.
   */
  static isAbsolute(inputPath: string): boolean {
    return path.isAbsolute(inputPath);
  }

  /**
   * Join path segments and validate against workspace root.
   */
  static joinAndValidate(segments: string[], workspaceRoot: string): PathValidationResult {
    const joined = path.join(...segments);
    return PathValidator.validate(joined, workspaceRoot);
  }

  /**
   * Get the relative path from workspace root.
   */
  static getRelativePath(inputPath: string, workspaceRoot: string): string | null {
    const result = PathValidator.validate(inputPath, workspaceRoot);

    if (!result.valid || !result.resolvedPath) {
      return null;
    }

    return path.relative(workspaceRoot, result.resolvedPath);
  }
}
