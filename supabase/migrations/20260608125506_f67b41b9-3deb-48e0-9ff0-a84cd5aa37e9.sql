
DROP POLICY IF EXISTS patients_insert_admin ON public.patients;
DROP POLICY IF EXISTS patients_update_admin ON public.patients;
DROP POLICY IF EXISTS patients_delete_admin ON public.patients;

CREATE POLICY patients_insert_writer ON public.patients FOR INSERT
WITH CHECK (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'operador'::app_role])
);

CREATE POLICY patients_update_writer ON public.patients FOR UPDATE
USING (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'operador'::app_role])
)
WITH CHECK (
  clinic_id = current_clinic_id()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'operador'::app_role])
);

CREATE POLICY patients_delete_writer ON public.patients FOR DELETE
USING (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'operador'::app_role])
);

DROP POLICY IF EXISTS attendances_insert_staff ON public.attendances;
DROP POLICY IF EXISTS attendances_update_staff ON public.attendances;
DROP POLICY IF EXISTS attendances_delete_admin ON public.attendances;

CREATE POLICY attendances_insert_staff ON public.attendances FOR INSERT
WITH CHECK (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'contador'::app_role, 'operador'::app_role])
);

CREATE POLICY attendances_update_staff ON public.attendances FOR UPDATE
USING (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'contador'::app_role, 'operador'::app_role])
)
WITH CHECK (
  clinic_id = current_clinic_id()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'contador'::app_role, 'operador'::app_role])
);

CREATE POLICY attendances_delete_writer ON public.attendances FOR DELETE
USING (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'operador'::app_role])
);
