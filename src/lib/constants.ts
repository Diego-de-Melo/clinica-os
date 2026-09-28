export const APP_NAME = "ClinicaOS";

/**
 * E-mail de suporte desta instância (opcional).
 * Cada deploy define o seu em `VITE_SUPPORT_EMAIL`; sem valor, os botões de
 * contato/criação de conta ficam ocultos e a tela de bloqueio exibe apenas a
 * orientação padrão.
 */
export const SUPPORT_EMAIL: string = import.meta.env.VITE_SUPPORT_EMAIL ?? "";

function buildMailto(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildSupportMailto(subject: string, body: string): string | null {
  if (!SUPPORT_EMAIL) return null;
  return buildMailto(SUPPORT_EMAIL, subject, body);
}

export function buildActivationMailto(userEmail: string): string | null {
  if (!SUPPORT_EMAIL) return null;
  const body = `Olá, preciso ativar minha conta. Meu email é: ${userEmail}`;
  return buildMailto(SUPPORT_EMAIL, "Ativação de conta", body);
}
