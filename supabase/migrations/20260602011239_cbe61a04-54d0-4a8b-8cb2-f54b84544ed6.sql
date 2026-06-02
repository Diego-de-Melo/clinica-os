CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  _is_service_role boolean := COALESCE(_claims->>'role', '') = 'service_role';
  _role public.app_role := 'usuario'::public.app_role;
  _clinic_id uuid := NULL;
BEGIN
  IF _is_service_role THEN
    _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'usuario'::public.app_role);
    _clinic_id := NULLIF(NEW.raw_user_meta_data->>'clinic_id','')::uuid;
  END IF;

  INSERT INTO public.profiles (id, email, role, clinic_id)
  VALUES (NEW.id, NEW.email, _role, _clinic_id)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public."current_role"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_clinic_active() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_clinic_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_summary(date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public."current_role"() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_clinic_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(date, date) TO authenticated;