-- Fix: Restrict write policies to authenticated role only
-- This addresses Lovable security warnings about policies applying to public/unauthenticated role

-- Patients: drop and recreate INSERT/UPDATE/DELETE with TO authenticated
DROP POLICY IF EXISTS patients_insert_writer ON public.patients;
DROP POLICY IF EXISTS patients_update_writer ON public.patients;
DROP POLICY IF EXISTS patients_delete_writer ON public.patients;

CREATE POLICY patients_insert_writer ON public.patients FOR INSERT
TO authenticated
WITH CHECK (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'operador'::app_role])
);

CREATE POLICY patients_update_writer ON public.patients FOR UPDATE
TO authenticated
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
TO authenticated
USING (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'operador'::app_role])
);

-- Attendances: drop and recreate INSERT/UPDATE/DELETE with TO authenticated
DROP POLICY IF EXISTS attendances_insert_staff ON public.attendances;
DROP POLICY IF EXISTS attendances_update_staff ON public.attendances;
DROP POLICY IF EXISTS attendances_delete_writer ON public.attendances;

CREATE POLICY attendances_insert_staff ON public.attendances FOR INSERT
TO authenticated
WITH CHECK (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'contador'::app_role, 'operador'::app_role])
);

CREATE POLICY attendances_update_staff ON public.attendances FOR UPDATE
TO authenticated
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
TO authenticated
USING (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
  AND is_clinic_active()
  AND public."current_role"() = ANY (ARRAY['admin'::app_role, 'operador'::app_role])
);

-- Fix: Add SELECT policies with TO authenticated as well for consistency
DROP POLICY IF EXISTS patients_select ON public.patients;
CREATE POLICY patients_select ON public.patients FOR SELECT
TO authenticated
USING (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
);

DROP POLICY IF EXISTS attendances_select ON public.attendances;
CREATE POLICY attendances_select ON public.attendances FOR SELECT
TO authenticated
USING (
  current_clinic_id() IS NOT NULL
  AND clinic_id = current_clinic_id()
);
