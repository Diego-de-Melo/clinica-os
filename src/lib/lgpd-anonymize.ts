/**
 * Gera o patch de anonimização LGPD para um paciente.
 * Zera/anonimiza TODOS os campos pessoais da tabela patients; preserva id, clinic_id, deleted_at.
 */
import type { Json } from "@/integrations/supabase/types";

export function anonymizePatch(row: {
  name: string | null;
  cpf: string | null;
  father_name: string | null;
  father_cpf: string | null;
  mother_name: string | null;
  mother_cpf: string | null;
  cnpj: string | null;
  company_name: string | null;
  responsible_name: string | null;
  responsible_cpf: string | null;
}): Partial<typeof row> {
  return {
    name: "[anonimizado]",
    cpf: null,
    father_name: null,
    father_cpf: null,
    mother_name: null,
    mother_cpf: null,
    cnpj: null,
    company_name: null,
    responsible_name: null,
    responsible_cpf: null,
    // id, clinic_id, created_at, deleted_at preservados
  };
}