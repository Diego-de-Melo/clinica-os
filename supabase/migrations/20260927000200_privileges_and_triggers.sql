-- A7 + A8 + B1 + B2: privilégios e gatilhos

-- 1) REVOKE DML de anon em todas as tabelas públicas (mantém SELECT, anulado pelo RLS)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLES FROM anon;

-- 2) Recriar handle_new_user() SEM leitura de raw_user_meta_data
-- Sempre cria perfil com role='usuario', clinic_id=NULL.
-- Lança exceção se metadata tentar trazer role ou clinic_id (sinaliza tentativa).
DROP FUNCTION IF EXISTS public.handle_new_user();
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  IF _meta ? 'role' OR _meta ? 'clinic_id' THEN
    RAISE EXCEPTION 'Tentativa de definir role ou clinic_id via metadata de signup - use service_role';
  END IF;
  INSERT INTO public.profiles (id, email, role, clinic_id)
  VALUES (NEW.id, NEW.email, 'usuario'::public.app_role, NULL)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;

-- 3) Recriar as 10 funções SECURITY DEFINER com SET search_path explícito
-- As que já referenciam tudo como public.x usam search_path = ''
-- As demais usam search_path = public, pg_temp

-- 3.1 current_role
DROP FUNCTION IF EXISTS public.current_role();
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;
REVOKE EXECUTE ON FUNCTION public.current_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;

-- 3.2 is_super_admin
DROP FUNCTION IF EXISTS public.is_super_admin();
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin') $$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- 3.3 is_clinic_active
DROP FUNCTION IF EXISTS public.is_clinic_active();
CREATE OR REPLACE FUNCTION public.is_clinic_active()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinics c
    JOIN public.profiles p ON p.clinic_id = c.id
    WHERE p.id = auth.uid()
      AND c.status = 'ativo'
      AND (c.expiration_date IS NULL OR c.expiration_date > now())
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_clinic_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_active() TO authenticated;

-- 3.4 current_clinic_id
DROP FUNCTION IF EXISTS public.current_clinic_id();
CREATE OR REPLACE FUNCTION public.current_clinic_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT clinic_id FROM public.profiles WHERE id = auth.uid() $$;
REVOKE EXECUTE ON FUNCTION public.current_clinic_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_clinic_id() TO authenticated;

-- 3.5 prevent_profile_privilege_escalation (trigger function)
DROP FUNCTION IF EXISTS public.prevent_profile_privilege_escalation();
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not allowed to change role';
  END IF;
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
    RAISE EXCEPTION 'Not allowed to change clinic_id';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() TO authenticated;

-- 3.6 log_audit
DROP FUNCTION IF EXISTS public.log_audit(text, text, uuid, jsonb, text);
CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity text,
  _record_id uuid,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _clinic_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (action, entity, record_id, metadata, clinic_id)
  VALUES (_action, _entity, _record_id, _metadata, COALESCE(_clinic_id, public.current_clinic_id()));
END $$;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text) TO authenticated;

-- 3.7 dashboard_summary
DROP FUNCTION IF EXISTS public.dashboard_summary(uuid, date, date);
CREATE OR REPLACE FUNCTION public.dashboard_summary(
  _clinic_id uuid,
  _from date,
  _to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_faturado', COALESCE(SUM(CASE WHEN a.status = 'Emitido' THEN a.value ELSE 0 END), 0),
    'pendentes', COUNT(*) FILTER (WHERE a.status = 'Pendente'),
    'cpf_invalido', COUNT(*) FILTER (WHERE a.status = 'CPF Inválido'),
    'emitidos', COUNT(*) FILTER (WHERE a.status = 'Emitido')
  ) INTO _result
  FROM public.attendances a
  WHERE a.clinic_id = _clinic_id
    AND a.deleted_at IS NULL
    AND a.date BETWEEN _from AND _to;
  RETURN COALESCE(_result, '{}'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.dashboard_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(uuid, date, date) TO authenticated;

-- 3.8 soft_delete_attendance (já criado em T2, aqui só garante REVOKE/GRANT)
REVOKE EXECUTE ON FUNCTION public.soft_delete_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_attendance(uuid) TO authenticated;

-- 3.9 trigger prevent_profile_privilege_escalation (re-criar trigger)
DROP TRIGGER IF EXISTS profiles_prevent_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 4) REVOKE EXECUTE de funções em DEFAULT PRIVILEGES + funções específicas
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.current_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_clinic_active() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_clinic_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_summary(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_attendance(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;