export type ClinicLifecycle = "ativa" | "inativa" | "vencida";

export type ClinicListItem = {
  name: string;
  status: string;
  expiration_date: string | null;
  admins: string[];
};

export function isClinicExpired(expirationDate: string | null): boolean {
  if (!expirationDate) return false;
  return new Date(expirationDate).getTime() < Date.now();
}

/** Prioridade: vencida → inativa → ativa */
export function classifyClinic(clinic: {
  status: string;
  expiration_date: string | null;
}): ClinicLifecycle {
  if (isClinicExpired(clinic.expiration_date)) return "vencida";
  if (clinic.status === "ativo") return "ativa";
  return "inativa";
}

export function countClinicsByLifecycle<T extends ClinicListItem>(clinics: T[]) {
  return clinics.reduce(
    (acc, c) => {
      acc[classifyClinic(c)] += 1;
      return acc;
    },
    { ativa: 0, inativa: 0, vencida: 0 } as Record<ClinicLifecycle, number>,
  );
}

export function filterClinics<T extends ClinicListItem>(
  clinics: T[],
  opts: { search?: string; lifecycle?: ClinicLifecycle | "all" },
): T[] {
  const q = opts.search?.trim().toLowerCase();
  return clinics.filter((c) => {
    if (opts.lifecycle && opts.lifecycle !== "all" && classifyClinic(c) !== opts.lifecycle) {
      return false;
    }
    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    return c.admins.some((email) => email.toLowerCase().includes(q));
  });
}
