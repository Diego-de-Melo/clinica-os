
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS father_cpf text,
  ADD COLUMN IF NOT EXISTS mother_name text,
  ADD COLUMN IF NOT EXISTS mother_cpf text;

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS invoice_for text NOT NULL DEFAULT 'patient';

ALTER TABLE public.attendances
  DROP CONSTRAINT IF EXISTS attendances_invoice_for_check;

ALTER TABLE public.attendances
  ADD CONSTRAINT attendances_invoice_for_check
  CHECK (invoice_for IN ('patient','father','mother'));
