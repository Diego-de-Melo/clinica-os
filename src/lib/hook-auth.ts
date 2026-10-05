/**
 * Validação de webhook com timing-safe comparison.
 * O segredo vem da env `BACKUP_HOOK_SECRET` (gerado com `openssl rand -base64 32`).
 * NÃO usar `SUPABASE_SERVICE_ROLE_KEY` como senha de webhook.
 */
import { timingSafeEqual } from "node:crypto";

export function isAuthorizedHook(
  authHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length === 0) return false; // fail closed
  if (!authHeader) return false;

  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;

  const provided = authHeader.slice(prefix.length);
  const expected = secret;

  // timingSafeEqual exige buffers do mesmo tamanho
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}