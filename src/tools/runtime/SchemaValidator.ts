// Schema validation using Zod

import { z, type ZodSchema, type ZodError } from "zod";

export interface ValidationResult {
  success: boolean;
  data?: unknown;
  errors?: Array<{
    path: string[];
    message: string;
  }>;
}

export class SchemaValidator {
  /**
   * Validate input against a Zod schema.
   */
  static validate<T>(schema: ZodSchema<T>, input: unknown): ValidationResult {
    try {
      const data = schema.parse(input);
      return { success: true, data };
    } catch (error) {
      const zodError = error as ZodError;
      const errors = zodError.errors.map((e: { path: (string | number)[]; message: string }) => ({
        path: e.path.map(String),
        message: e.message,
      }));
      return { success: false, errors };
    }
  }

  /**
   * Create a Zod schema from JSON Schema format.
   * Supports basic types: string, number, boolean, array, object.
   */
  static fromJsonSchema(jsonSchema: unknown): ZodSchema {
    const schema = jsonSchema as Record<string, unknown>;

    switch (schema.type) {
      case "string":
        return z.string();
      case "number":
        return z.number();
      case "boolean":
        return z.boolean();
      case "array":
        return z.array(
          schema.items
            ? SchemaValidator.fromJsonSchema(schema.items as Record<string, unknown>)
            : z.unknown()
        );
      case "object": {
        const properties = schema.properties as Record<string, unknown> | undefined;
        const required = schema.required as string[] | undefined;

        if (!properties) {
          return z.record(z.unknown());
        }

        const shape: Record<string, ZodSchema> = {};
        for (const [key, value] of Object.entries(properties)) {
          shape[key] = SchemaValidator.fromJsonSchema(value as Record<string, unknown>);
        }

        if (required?.length) {
          // Make required fields non-optional
          const requiredShape: Record<string, ZodSchema> = {};
          for (const key of required) {
            if (shape[key]) {
              requiredShape[key] = shape[key];
            }
          }
          // Include optional fields too
          for (const key in shape) {
            if (!required.includes(key)) {
              requiredShape[key] = shape[key].optional();
            }
          }
          return z.object(requiredShape);
        }

        return z.object(shape);
      }
      default:
        return z.unknown();
    }
  }

  /**
   * Validate input against JSON Schema format.
   */
  static validateJsonSchema(jsonSchema: unknown, input: unknown): ValidationResult {
    const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);
    return SchemaValidator.validate(zodSchema, input);
  }
}
