-- C1: soft_delete_attendance com filtro de tenant, clínica ativa e papel
-- DROP obrigatório: PostgreSQL não troca tipo de retorno com CREATE OR REPLACE (void -> boolean)

DROP FUNCTION IF EXISTS public.soft_delete_attendance(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_attendance(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _cid  uuid := public.current_clinic_id();
  _role public.app_role := public."current_role"();
BEGIN
  IF _cid IS NULL OR NOT public.is_clinic_active() THEN RETURN FALSE; END IF;
  IF _role NOT IN ('admin', 'operador') THEN RETURN FALSE; END IF;
  UPDATE public.attendances
     SET deleted_at = now()
   WHERE id = p_id AND clinic_id = _cid AND deleted_at IS NULL;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.soft_delete_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_attendance(uuid) TO authenticated;