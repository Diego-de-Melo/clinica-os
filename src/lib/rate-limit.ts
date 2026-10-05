/**
 * Rate limiting simples com janela deslizante em Map (M2).
 * Estado em memória por instância do Worker (melhor esforço).
 * Para proteção real em produção, usar Cloudflare WAF.
 */
interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
}

const windows = new Map<string, number[]>();

/** Limpeza preguiçosa de entradas expiradas */
function cleanup(key: string, windowMs: number, now: number) {
  const arr = windows.get(key);
  if (!arr) return;
  const cutoff = now - windowMs;
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  if (i > 0) {
    if (i === arr.length) windows.delete(key);
    else windows.set(key, arr.slice(i));
  }
}

/**
 * Verifica e consome 1 slot do rate limit.
 * @returns { ok: true } se permitido; { ok: false, retryAfterMs } se bloqueado.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  cleanup(key, windowMs, now);
  const arr = windows.get(key) ?? [];
  if (arr.length >= limit) {
    const oldest = arr[0];
    const retryAfterMs = oldest + windowMs - now;
    return { ok: false, retryAfterMs: Math.max(0, retryAfterMs) };
  }
  arr.push(now);
  windows.set(key, arr);
  return { ok: true, retryAfterMs: 0 };
}

/** Wrapper que lança erro se bloqueado (para usar em server functions) */
export function limitFor(key: string, limit: number, windowMs: number, now?: number): void {
  const result = checkRateLimit(key, limit, windowMs, now);
  if (!result.ok) {
    const secs = Math.ceil(result.retryAfterMs / 1000);
    throw new Error(`Muitas tentativas. Tente novamente em ${secs}s.`);
  }
}

/** Reseta o rate limit de uma chave (útil para testes) */
export function resetRateLimit(key: string): void {
  windows.delete(key);
}

/** Reseta todos (para testes) */
export function resetAllRateLimits(): void {
  windows.clear();
}