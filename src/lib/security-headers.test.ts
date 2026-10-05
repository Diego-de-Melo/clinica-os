import { describe, expect, it, vi } from "vitest";
import { securityHeaders, applySecurityHeaders } from "./security-headers";

describe("securityHeaders", () => {
  it("produção contém CSP completa + headers essenciais", () => {
    vi.stubEnv("CSP_REPORT_ONLY", "");
    const h = securityHeaders(true);
    expect(h["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
  });

  it("report-only troca header quando CSP_REPORT_ONLY=1", () => {
    vi.stubEnv("CSP_REPORT_ONLY", "1");
    const h = securityHeaders(true);
    expect(h["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
    expect(h["Content-Security-Policy"]).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("dev retorna CSP permissiva + headers essenciais", () => {
    const h = securityHeaders(false);
    expect(h["Content-Security-Policy"]).toContain("'unsafe-inline'");
    expect(h["Content-Security-Policy"]).toContain("'unsafe-eval'");
    expect(h["X-Frame-Options"]).toBe("DENY");
  });

  it("applySecurityHeaders não sobrescreve headers existentes", () => {
    const resp = new Response("ok", {
      headers: { "X-Custom": "value", "X-Frame-Options": "SAMEORIGIN" },
    });
    const out = applySecurityHeaders(resp, false);
    expect(out.headers.get("X-Custom")).toBe("value");
    expect(out.headers.get("X-Frame-Options")).toBe("SAMEORIGIN"); // preserva o original
  });
});