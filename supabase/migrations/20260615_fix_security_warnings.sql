-- 1. Create the soft delete function
CREATE OR REPLACE FUNCTION public.soft_delete_attendance(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.attendances
  SET deleted_at = now()
  WHERE id = p_id;
END;
$$;

-- 2. Restrict to authenticated only
REVOKE ALL ON FUNCTION public.soft_delete_attendance(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.soft_delete_attendance(uuid) TO authenticated;

-- 3. Fix privilege escalation in handle_new_user
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

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
