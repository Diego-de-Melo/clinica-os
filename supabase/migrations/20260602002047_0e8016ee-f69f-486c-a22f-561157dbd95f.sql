
-- 1. Block privilege escalation via profiles UPDATE
-- Add explicit UPDATE policy for self that prevents changing role/clinic_id
CREATE POLICY "user updates own profile non sensitive"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  AND clinic_id IS NOT DISTINCT FROM (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
);

-- Defense in depth: trigger to forbid role/clinic_id changes unless super_admin
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
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. Tighten audit_logs INSERT: clinic_id must match user's clinic (or be null for super_admin)
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    clinic_id IS NOT DISTINCT FROM public.current_clinic_id()
    OR public.is_super_admin()
  )
);

-- 3. Revoke EXECUTE on SECURITY DEFINER helpers from anon/PUBLIC
REVOKE EXECUTE ON FUNCTION public.is_clinic_active() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_clinic_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public."current_role"() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dashboard_summary(date, date) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_clinic_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public."current_role"() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(date, date) TO authenticated;
