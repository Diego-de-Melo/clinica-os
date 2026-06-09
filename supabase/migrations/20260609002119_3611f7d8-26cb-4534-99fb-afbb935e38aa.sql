CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  _is_service_role boolean := COALESCE(_claims->>'role','') = 'service_role';
BEGIN
  IF _is_service_role OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Not allowed to change id';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Not allowed to change role';
  END IF;
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
    RAISE EXCEPTION 'Not allowed to change clinic_id';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Not allowed to change email';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not allowed to change created_at';
  END IF;
  RETURN NEW;
END;
$function$;

-- Remover trigger duplicado (mantém apenas prevent_profile_privilege_escalation)
DROP TRIGGER IF EXISTS profiles_prevent_escalation ON public.profiles;