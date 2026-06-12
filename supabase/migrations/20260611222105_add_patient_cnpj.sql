-- Add optional CNPJ column to patients table
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS cnpj text;

-- Allow 'cnpj' as invoice_for option in attendances
ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_invoice_for_check;
ALTER TABLE public.attendances ADD CONSTRAINT attendances_invoice_for_check CHECK (invoice_for IN ('patient','father','mother','cnpj'));
