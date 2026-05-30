CREATE UNIQUE INDEX IF NOT EXISTS patients_clinic_cpf_unique
  ON public.patients (clinic_id, cpf)
  WHERE cpf IS NOT NULL AND btrim(cpf) <> '';
