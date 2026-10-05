import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkRateLimit, limitFor, resetAllRateLimits, resetRateLimit } from "./rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    resetAllRateLimits();
    vi.useFakeTimers();
  });

  it("permite até 'limit' chamadas dentro da janela", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("test:1", 3, 60_000).ok).toBe(true);
    }
  });

  it("bloqueia a 4ª chamada", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 3; i++) checkRateLimit("test:2", 3, 60_000);
    const r = checkRateLimit("test:2", 3, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it("janela expira e volta a permitir", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 3; i++) checkRateLimit("test:3", 3, 60_000);
    expect(checkRateLimit("test:3", 3, 60_000).ok).toBe(false);

    vi.advanceTimersByTime(61_000); // passa da janela de 60s
    expect(checkRateLimit("test:3", 3, 60_000).ok).toBe(true);
  });

  it("chaves diferentes não interferem", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 3; i++) checkRateLimit("a:1", 3, 60_000);
    expect(checkRateLimit("b:1", 3, 60_000).ok).toBe(true);
  });

  it("now injetado (sem esperar tempo real)", () => {
    const now = new Date("2026-01-01T00:00:00Z").getTime();
    for (let i = 0; i < 3; i++) checkRateLimit("test:4", 3, 60_000, now);
    expect(checkRateLimit("test:4", 3, 60_000, now).ok).toBe(false);
  });

  it("limitFor lança erro quando bloqueado", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 3; i++) limitFor("test:5", 3, 60_000);
    expect(() => limitFor("test:5", 3, 60_000)).toThrow("Muitas tentativas");
  });

  it("resetRateLimit limpa uma chave", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 3; i++) checkRateLimit("reset:me", 3, 60_000);
    expect(checkRateLimit("reset:me", 3, 60_000).ok).toBe(false);
    resetRateLimit("reset:me");
    expect(checkRateLimit("reset:me", 3, 60_000).ok).toBe(true);
  });

  it("resetAllRateLimits limpa tudo", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    checkRateLimit("a", 1, 60_000);
    checkRateLimit("b", 1, 60_000);
    resetAllRateLimits();
    expect(checkRateLimit("a", 1, 60_000).ok).toBe(true);
    expect(checkRateLimit("b", 1, 60_000).ok).toBe(true);
  });
});