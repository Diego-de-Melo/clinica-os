-- Add optional company_name column to patients table
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS company_name text;
