/**
 * Schema Zod para validação de snapshot de backup.
 * Allowlist estrita por tabela; clinic_id PROIBIDO em qualquer linha.
 * Arrays limitados a 50.000 itens.
 */
import { z } from "zod";

const PatientRow = z.object({
  id: z.string().uuid(),
  clinic_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  cpf: z.string().trim().max(20).nullable().optional(),
  cnpj: z.string().trim().max(20).nullable().optional(),
  company_name: z.string().trim().max(120).nullable().optional(),
  father_name: z.string().trim().max(120).nullable().optional(),
  father_cpf: z.string().trim().max(20).nullable().optional(),
  mother_name: z.string().trim().max(120).nullable().optional(),
  mother_cpf: z.string().trim().max(20).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
}).strict(); // proíbe clinic_id extra ou qualquer campo desconhecido

const AttendanceRow = z.object({
  id: z.string().uuid(),
  clinic_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().positive().max(1_000_000),
  payment_method: z.string().max(30).nullable().optional(),
  status: z.enum(["Pendente", "Emitido", "CPF Inválido", "Corrigido", "Cancelado"]),
  invoice_for: z.enum(["patient", "father", "mother", "cnpj"]).default("patient"),
  observacoes: z.string().trim().max(2000).nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
}).strict();

const ClinicRow = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  status: z.enum(["ativo", "inativo"]),
  expiration_date: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable().optional(),
}).strict();

const ProfileRow = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["super_admin", "admin", "contador", "operador", "usuario"]),
  clinic_id: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable().optional(),
}).strict();

const MAX_ITEMS = 50_000;

const SnapshotSchema = z.object({
  patients: z.array(PatientRow).max(MAX_ITEMS),
  attendances: z.array(AttendanceRow).max(MAX_ITEMS),
  clinics: z.array(ClinicRow).max(100),
  profiles: z.array(ProfileRow).max(MAX_ITEMS),
  metadata: z.object({
    version: z.number().int().positive(),
    created_at: z.string().datetime(),
    clinic_id: z.string().uuid(),
  }),
}).strict();

export type Snapshot = z.infer<typeof SnapshotSchema>;

export function parseBackupSnapshot(raw: unknown): Snapshot {
  return SnapshotSchema.parse(raw);
}

/** Constrói payload de upsert a partir do snapshot (sem clinic_id nas linhas). */
export function buildUpsertPayload(snapshot: Snapshot) {
  const patients = snapshot.patients.map(({ clinic_id, ...rest }) => rest);
  const attendances = snapshot.attendances.map(({ clinic_id, ...rest }) => rest);
  const clinics = snapshot.clinics; // clinic_id é PK, mantém
  const profiles = snapshot.profiles.map(({ clinic_id, ...rest }) => rest);
  return { patients, attendances, clinics, profiles };
}