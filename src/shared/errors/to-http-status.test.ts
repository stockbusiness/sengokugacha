import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  IdempotencyConflictError,
  NotFoundError,
  ValidationError,
  toHttpStatus,
} from "./index";

describe("toHttpStatus", () => {
  it("maps known error types to their HTTP status", () => {
    expect(toHttpStatus(new ValidationError("x"))).toBe(422);
    expect(toHttpStatus(new AuthenticationError("x"))).toBe(401);
    expect(toHttpStatus(new AuthorizationError("x"))).toBe(403);
    expect(toHttpStatus(new NotFoundError("x"))).toBe(404);
    expect(toHttpStatus(new ConflictError("x"))).toBe(409);
    expect(toHttpStatus(new IdempotencyConflictError("x"))).toBe(409);
    expect(toHttpStatus(new ExternalServiceError("x"))).toBe(502);
    expect(toHttpStatus(new DatabaseError("x"))).toBe(500);
  });

  it("defaults unknown errors to 500", () => {
    expect(toHttpStatus(new Error("plain error"))).toBe(500);
    expect(toHttpStatus("not an error")).toBe(500);
    expect(toHttpStatus(null)).toBe(500);
  });
});
