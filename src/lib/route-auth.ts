import { redirect } from "@tanstack/react-router";
import { getSessionContext, type SessionContext } from "@/lib/session.functions";

async function loadSessionContext(): Promise<SessionContext> {
  try {
    return await getSessionContext();
  } catch {
    throw redirect({ to: "/login" });
  }
}

export function getPostLoginPath(session: SessionContext): "/master-admin" | "/dashboard" {
  return session.role === "super_admin" ? "/master-admin" : "/dashboard";
}

/** Sessão autenticada para rotas do app clínico (/_app/*). Super admin vai ao painel global. */
export async function requireAppSession(): Promise<SessionContext> {
  const session = await loadSessionContext();
  if (session.role === "super_admin") {
    throw redirect({ to: "/master-admin" });
  }
  if (session.isBlocked) {
    throw redirect({ to: "/bloqueio" });
  }
  return session;
}

/** Sessão autenticada para /master-admin (apenas super_admin). */
export async function requireSuperAdminSession(): Promise<SessionContext> {
  const session = await loadSessionContext();
  if (session.role !== "super_admin") {
    throw redirect({ to: "/dashboard" });
  }
  return session;
}
