-- Fix: Restore deleted_at IS NULL and is_clinic_active() to SELECT policies
-- These were accidentally removed in the 20260614_fix_rls_security_warnings migration
-- Without deleted_at IS NULL, soft-deleted records (via .update({ deleted_at })) remain visible

-- Patients SELECT: restore deleted_at filter
DROP POLICY IF EXISTS patients_select ON public.patients;
CREATE POLICY patients_select ON public.patients FOR SELECT
TO authenticated
USING (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND deleted_at IS NULL
);

-- Attendances SELECT: restore deleted_at filter + super_admin override
DROP POLICY IF EXISTS attendances_select ON public.attendances;
CREATE POLICY attendances_select ON public.attendances FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND deleted_at IS NULL
  )
);
