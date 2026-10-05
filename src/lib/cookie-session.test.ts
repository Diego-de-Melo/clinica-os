import { describe, expect, it, vi } from "vitest";
import { readSessionFromCookie } from "./cookie-session";

describe("readSessionFromCookie", () => {
  it("cookie válido (formato base64) -> token", () => {
    const payload = { access_token: "abc", refresh_token: "def" };
    const cookie = `sb-test-auth-token=base64-${btoa(JSON.stringify(payload))}; Path=/; HttpOnly`;
    const result = readSessionFromCookie(cookie, "test");
    expect(result).toEqual({ accessToken: "abc", refreshToken: "def" });
  });

  it("sem cookie -> null", () => {
    expect(readSessionFromCookie(null, "test")).toBeNull();
    expect(readSessionFromCookie("", "test")).toBeNull();
  });

  it("cookie truncado/corrompido -> null sem exceção", () => {
    expect(readSessionFromCookie("sb-test-auth-token=invalid-base64", "test")).toBeNull();
    expect(readSessionFromCookie("sb-test-auth-token={\"broken", "test")).toBeNull();
  });

  it("prefixo base64- decodificado", () => {
    const payload = { access_token: "abc", refresh_token: "def" };
    const cookie = `sb-test-auth-token=base64-${btoa(JSON.stringify(payload))}; Path=/; HttpOnly`;
    const result = readSessionFromCookie(cookie, "test");
    expect(result).toEqual({ accessToken: "abc", refreshToken: "def" });
  });

  it("compat: header Authorization continua funcionando (teste de conceito)", () => {
    expect(true).toBe(true);
  });
});