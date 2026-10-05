/**
 * Leitura de sessão a partir de cookie httpOnly (M3).
 * Suporta o formato do @supabase/ssr: `sb-<ref>-auth-token` (pode vir prefixado com `base64-`).
 * Ordem de autenticação no servidor: header Authorization -> cookie.
 */
export function readSessionFromCookie(
  cookieHeader: string | null,
  ref: string
): { accessToken: string; refreshToken?: string } | null {
  if (!cookieHeader) return null;

  const cookieName = `sb-${ref}-auth-token=`;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const authCookie = cookies.find((c) => c.startsWith(cookieName));
  if (!authCookie) return null;

  const encoded = authCookie.slice(cookieName.length);
  let payload: { access_token?: string; refresh_token?: string } | null = null;

  try {
    // Formato novo: pode vir prefixado com "base64-"
    if (encoded.startsWith("base64-")) {
      const b64 = encoded.slice("base64-".length);
      payload = JSON.parse(atob(b64));
    } else {
      // Formato antigo: JSON direto
      payload = JSON.parse(decodeURIComponent(encoded));
    }
  } catch {
    return null; // cookie truncado/corrompido -> falha silenciosa
  }

  if (!payload?.access_token) return null;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}