ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_status_check;
ALTER TABLE public.attendances ADD CONSTRAINT attendances_status_check
  CHECK (status IN ('Pendente','CPF Inválido','Corrigido','Emitido','Cancelado'));