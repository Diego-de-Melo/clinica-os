import { describe, expect, it } from "vitest";
import { isAuthorizedHook } from "./hook-auth";

describe("isAuthorizedHook", () => {
  const secret = "test-secret-12345678901234567890123456789012";

  it("secret ausente -> false", () => {
    expect(isAuthorizedHook("Bearer anything", undefined)).toBe(false);
    expect(isAuthorizedHook("Bearer anything", "")).toBe(false);
  });

  it("header null -> false", () => {
    expect(isAuthorizedHook(null, secret)).toBe(false);
  });

  it("header sem prefixo Bearer -> false", () => {
    expect(isAuthorizedHook("Basic abc", secret)).toBe(false);
    expect(isAuthorizedHook(secret, secret)).toBe(false);
  });

  it("Bearer errado -> false", () => {
    expect(isAuthorizedHook("Bearer wrong-secret", secret)).toBe(false);
  });

  it("Bearer certo -> true", () => {
    expect(isAuthorizedHook(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("mesmo prefixo com 1 byte diferente -> false", () => {
    const almost = secret.slice(0, -1) + (secret.endsWith("0") ? "1" : "0");
    expect(isAuthorizedHook(`Bearer ${almost}`, secret)).toBe(false);
  });

  it("tamanhos diferentes -> false sem lançar", () => {
    expect(isAuthorizedHook("Bearer short", secret)).toBe(false);
    expect(isAuthorizedHook(`Bearer ${secret}extra`, secret)).toBe(false);
  });
});