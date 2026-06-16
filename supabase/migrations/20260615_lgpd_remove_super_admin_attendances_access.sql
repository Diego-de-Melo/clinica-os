-- LGPD: Remove super_admin read access to attendances
-- Super admin should not access clinic patient/attendance data

DROP POLICY IF EXISTS attendances_select ON public.attendances;

CREATE POLICY attendances_select ON public.attendances
  FOR SELECT TO authenticated
  USING (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND deleted_at IS NULL
  );
