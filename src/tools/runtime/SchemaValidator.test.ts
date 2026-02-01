/**
 * SchemaValidator Unit Tests
 *
 * Tests for Zod schema validation and JSON Schema conversion.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SchemaValidator, type ValidationResult } from "./SchemaValidator.js";

describe("SchemaValidator", () => {
  describe("validate()", () => {
    // T1: Successful validation with correct input
    it("T1: should return success with valid data", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        active: z.boolean().optional(),
      });

      const input = {
        name: "John Doe",
        age: 30,
        active: true,
      };

      const result: ValidationResult = SchemaValidator.validate(schema, input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
      expect(result.errors).toBeUndefined();
    });

    // T2: Failed validation with type mismatch
    it("T2: should return errors when type mismatch occurs", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().email(),
      });

      const input = {
        name: "Jane Doe",
        age: "not-a-number", // Wrong type
        email: "invalid-email", // Invalid email format
      };

      const result: ValidationResult = SchemaValidator.validate(schema, input);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.data).toBeUndefined();

      // Check error paths are formatted as strings
      const paths = result.errors?.map((e) => e.path.join(".")) || [];
      expect(paths).toContain("age");
      expect(paths).toContain("email");
    });

    // T3: Missing required fields should fail validation
    it("T3: should return errors for missing required fields", () => {
      const schema = z.object({
        username: z.string(),
        password: z.string().min(8),
        role: z.string().default("user"),
      });

      const input = {
        password: "short", // Too short
        // username is missing
      };

      const result: ValidationResult = SchemaValidator.validate(schema, input);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();

      const errorFields = result.errors?.map((e) => e.path[0]) || [];
      expect(errorFields).toContain("username");
      expect(errorFields).toContain("password");
    });

    // T4: Nested object validation
    it("T4: should validate nested objects correctly", () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          address: z.object({
            street: z.string(),
            city: z.string(),
          }),
        }),
      });

      const input = {
        user: {
          name: "Alice",
          address: {
            street: "123 Main St",
            city: "Springfield",
          },
        },
      };

      const result: ValidationResult = SchemaValidator.validate(schema, input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
    });

    // T5: Array validation
    it("T5: should validate arrays correctly", () => {
      const schema = z.object({
        tags: z.array(z.string()),
        scores: z.array(z.number()).min(1),
      });

      const validInput = {
        tags: ["tag1", "tag2", "tag3"],
        scores: [100, 95, 87],
      };

      const result: ValidationResult = SchemaValidator.validate(schema, validInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validInput);
    });

    // T6: Array validation failure
    it("T6: should return errors for invalid array items", () => {
      const schema = z.object({
        numbers: z.array(z.number()),
      });

      const invalidInput = {
        numbers: [1, 2, "three", 4], // String in number array
      };

      const result: ValidationResult = SchemaValidator.validate(schema, invalidInput);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].path[0]).toBe("numbers");
    });
  });

  describe("fromJsonSchema()", () => {
    // T7: Convert JSON Schema string type
    it("T7: should convert JSON Schema string type to Zod string", () => {
      const jsonSchema = {
        type: "string",
      };

      const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);

      expect(zodSchema.parse("hello")).toBe("hello");
      expect(() => zodSchema.parse(123)).toThrow();
    });

    // T8: Convert JSON Schema number type
    it("T8: should convert JSON Schema number type to Zod number", () => {
      const jsonSchema = {
        type: "number",
      };

      const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);

      expect(zodSchema.parse(42.5)).toBe(42.5);
      expect(() => zodSchema.parse("not a number")).toThrow();
    });

    // T9: Convert JSON Schema boolean type
    it("T9: should convert JSON Schema boolean type to Zod boolean", () => {
      const jsonSchema = {
        type: "boolean",
      };

      const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);

      expect(zodSchema.parse(true)).toBe(true);
      expect(zodSchema.parse(false)).toBe(false);
      expect(() => zodSchema.parse("true")).toThrow();
    });

    // T10: Convert JSON Schema array type
    it("T10: should convert JSON Schema array type to Zod array", () => {
      const jsonSchema = {
        type: "array",
        items: {
          type: "string",
        },
      };

      const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);

      const validArray = ["a", "b", "c"];
      expect(zodSchema.parse(validArray)).toEqual(validArray);
      expect(() => zodSchema.parse([1, 2, 3])).toThrow();
    });

    // T11: Convert JSON Schema object type without properties
    it("T11: should create z.record for object without properties", () => {
      const jsonSchema = {
        type: "object",
      };

      const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);

      const anyObject = { foo: "bar", num: 123 };
      expect(zodSchema.parse(anyObject)).toEqual(anyObject);
    });

    // T12: Convert JSON Schema object with required fields
    it("T12: should handle required fields in JSON Schema object", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
          email: { type: "string" },
        },
        required: ["name", "age"],
      };

      const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);

      // Valid input
      const validInput = { name: "John", age: 30 };
      expect(() => zodSchema.parse(validInput)).not.toThrow();

      // Missing required field
      expect(() => zodSchema.parse({ name: "John" })).toThrow();
      expect(() => zodSchema.parse({ age: 30 })).toThrow();
    });

    // T13: Convert JSON Schema object with optional fields
    it("T13: should make non-required fields optional", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          required: { type: "string" },
          optional: { type: "string" },
        },
        required: ["required"],
      };

      const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);

      // Should work with only required field
      const partialInput = { required: "value" };
      expect(() => zodSchema.parse(partialInput)).not.toThrow();

      // Should work with both fields
      const fullInput = { required: "value", optional: "value" };
      expect(() => zodSchema.parse(fullInput)).not.toThrow();
    });

    // T14: Handle unknown type with fallback to z.unknown
    it("T14: should fallback to z.unknown for unknown types", () => {
      const jsonSchema = {
        type: "unknown-type",
      };

      const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);

      // Should accept any value
      expect(zodSchema.parse("anything")).toBe("anything");
      expect(zodSchema.parse(123)).toBe(123);
      expect(zodSchema.parse(null)).toBe(null);
    });

    // T15: Nested object conversion
    it("T15: should convert nested JSON Schema objects", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
            },
            required: ["name"],
          },
        },
        required: ["user"],
      };

      const zodSchema = SchemaValidator.fromJsonSchema(jsonSchema);

      const validInput = { user: { name: "Alice" } };
      expect(() => zodSchema.parse(validInput)).not.toThrow();

      expect(() => zodSchema.parse({ user: {} })).toThrow();
    });
  });

  describe("validateJsonSchema()", () => {
    // T16: Integration test - validate valid input against JSON Schema
    it("T16: should validate valid input against JSON Schema", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          username: { type: "string" },
          age: { type: "number" },
          active: { type: "boolean" },
        },
        required: ["username"],
      };

      const validInput = {
        username: "testuser",
        age: 25,
        active: true,
      };

      const result: ValidationResult = SchemaValidator.validateJsonSchema(jsonSchema, validInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validInput);
    });

    // T17: Integration test - validate invalid input against JSON Schema
    it("T17: should return errors for invalid input against JSON Schema", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          count: { type: "number" },
          items: { type: "array" },
        },
        required: ["count"],
      };

      const invalidInput = {
        count: "not-a-number",
        items: "not-an-array",
      };

      const result: ValidationResult = SchemaValidator.validateJsonSchema(jsonSchema, invalidInput);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    // T18: Validate complex nested JSON Schema
    it("T18: should validate complex nested JSON Schema structures", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          config: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              priority: { type: "number" },
            },
            required: ["enabled"],
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["config"],
      };

      const validInput = {
        config: { enabled: true },
        tags: ["tag1", "tag2"],
      };

      const result: ValidationResult = SchemaValidator.validateJsonSchema(jsonSchema, validInput);

      expect(result.success).toBe(true);
    });

    // T19: Missing required nested field
    it("T19: should fail when required nested field is missing", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          config: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
            },
            required: ["enabled"],
          },
        },
        required: ["config"],
      };

      const invalidInput = {
        config: {}, // Missing required enabled field
      };

      const result: ValidationResult = SchemaValidator.validateJsonSchema(jsonSchema, invalidInput);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    // T20: Array type validation with items schema
    it("T20: should validate array types with item schemas", () => {
      const jsonSchema = {
        type: "object",
        properties: {
          numbers: {
            type: "array",
            items: { type: "number" },
          },
        },
        required: ["numbers"],
      };

      const validInput = { numbers: [1, 2, 3.5, -10] };
      const invalidInput = { numbers: [1, "two", 3] };

      const validResult = SchemaValidator.validateJsonSchema(jsonSchema, validInput);
      expect(validResult.success).toBe(true);

      const invalidResult = SchemaValidator.validateJsonSchema(jsonSchema, invalidInput);
      expect(invalidResult.success).toBe(false);
    });
  });
});
