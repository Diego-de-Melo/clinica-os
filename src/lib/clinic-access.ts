/**
 * Avalia se a clínica está ativa e não vencida.
 * super_admin passa incondicionalmente (clinic_id pode ser nulo).
 */
export type ClinicAccessResult =
  | { active: true }
  | { active: false; reason: string };

export function evaluateClinicAccess(args: {
  status: string;
  expirationDate: string | null;
  role: string;
  now?: number;
}): ClinicAccessResult {
  const now = args.now ?? Date.now();

  // super_admin bypassa tudo
  if (args.role === "super_admin") {
    return { active: true };
  }

  if (args.status !== "ativo") {
    return { active: false, reason: "Clínica inativa." };
  }

  if (args.expirationDate) {
    const exp = new Date(args.expirationDate).getTime();
    if (exp < now) {
      return { active: false, reason: "Clínica vencida." };
    }
  }

  return { active: true };
}