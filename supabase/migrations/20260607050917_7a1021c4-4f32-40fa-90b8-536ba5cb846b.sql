
-- 1) Super admin SELECT access on patients/attendances
DROP POLICY IF EXISTS patients_select ON public.patients;
CREATE POLICY patients_select ON public.patients
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      current_clinic_id() IS NOT NULL
      AND clinic_id = current_clinic_id()
      AND is_clinic_active()
      AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS attendances_select ON public.attendances;
CREATE POLICY attendances_select ON public.attendances
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      current_clinic_id() IS NOT NULL
      AND clinic_id = current_clinic_id()
      AND is_clinic_active()
      AND deleted_at IS NULL
    )
  );

-- 2) Profiles: enforce immutability of sensitive fields via trigger
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
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
