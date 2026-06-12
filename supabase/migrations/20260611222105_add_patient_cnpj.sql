-- Add optional CNPJ column to patients table
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS cnpj text;
