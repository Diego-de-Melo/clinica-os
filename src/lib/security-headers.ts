/**
 * Cabeçalhos de segurança para respostas do Worker (M9).
 * Em dev retorna apenas headers essenciais; CSP estrita só em produção.
 * Toggle CSP_REPORT_ONLY=1 troca para Content-Security-Policy-Report-Only.
 */
export function securityHeaders(isProduction: boolean): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://klwqeycfdfeulqrwngky.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");

  const headers: Record<string, string> = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };

  if (isProduction) {
    const reportOnly = process.env.CSP_REPORT_ONLY === "1";
    headers[reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy"] = csp;
  } else {
    // Dev: apenas headers essenciais, sem CSP estrita (quebra Vite HMR)
    headers["Content-Security-Policy"] = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; frame-ancestors 'none';";
  }

  return headers;
}

/**
 * Aplica headers de segurança a uma Response sem sobrescrever headers já definidos.
 */
export function applySecurityHeaders(response: Response, isProduction: boolean): Response {
  const headers = securityHeaders(isProduction);
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}