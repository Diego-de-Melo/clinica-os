/**
 * Lógica pura para decidir se um e-mail pode ser anexado a uma clínica existente
 * ou se deve ser rejeitado (já tem cadastro).
 *
 * Regra: `attach` **somente** quando `profile === null`.
 * Qualquer perfil existente (incluindo `clinic_id` nulo = super_admin) rejeita.
 */
import type { AppRole } from "@/lib/auth-guards";

export type JoinDecision =
  | { mode: "attach" }
  | { mode: "reject"; reason: string };

export function joinDecision(profile: {
  clinic_id: string | null;
  role: AppRole;
  email: string;
} | null): JoinDecision {
  if (profile === null) {
    return { mode: "attach" };
  }

  // super_admin tem clinic_id = null -> rejeita (não pode ser membro de clínica)
  if (profile.clinic_id === null) {
    return {
      mode: "reject",
      reason:
        "Este e-mail já possui cadastro como super administrador. Use o painel global ou peça para reenviar o convite.",
    };
  }

  // Perfil já pertence a alguma clínica (mesma ou outra) -> rejeita
  return {
    mode: "reject",
    reason:
      "Este e-mail já possui cadastro. Peça ao administrador para reenviar o convite ou use 'Esqueci minha senha'.",
  };
}