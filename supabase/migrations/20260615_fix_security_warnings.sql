-- 1. Fix privilege escalation: handle_new_user only reads role from metadata
--    when created by service_role (admin panel). Self-registrations always get 'user'.
--    team.functions.ts calls ensureClinicProfile to upsert the correct role after creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  _is_service_role boolean := COALESCE(_claims->>'role', '') = 'service_role';
  _role public.app_role := 'user'::public.app_role;
  _clinic_id uuid := NULL;
BEGIN
  IF _is_service_role THEN
    _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'user'::public.app_role);
    _clinic_id := NULLIF(NEW.raw_user_meta_data->>'clinic_id','')::uuid;
  END IF;

  INSERT INTO public.profiles (id, email, role, clinic_id)
  VALUES (NEW.id, NEW.email, _role, _clinic_id)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;

  RETURN NEW;
END;
$function$;

-- 2. Restrict soft_delete_attendance to authenticated users only
REVOKE ALL ON FUNCTION public.soft_delete_attendance(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.soft_delete_attendance(uuid) TO authenticated;

-- 3. Revoke direct execution of handle_new_user from non-admin roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
