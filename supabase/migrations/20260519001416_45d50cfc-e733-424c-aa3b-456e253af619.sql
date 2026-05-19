
-- Migrar dados antigos role=user → usuario
UPDATE public.profiles SET role = 'usuario' WHERE role = 'user';

-- Atualizar default em handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, role, clinic_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'usuario'),
    NULLIF(NEW.raw_user_meta_data->>'clinic_id','')::uuid
  );
  RETURN NEW;
END;
$function$;

-- Status workflow expandido
ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_status_check;
ALTER TABLE public.attendances ADD CONSTRAINT attendances_status_check
  CHECK (status IN ('Pendente','CPF Inválido','Corrigido','Emitido'));

-- payment_method opcional
ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_payment_method_check;
ALTER TABLE public.attendances ALTER COLUMN payment_method DROP NOT NULL;

-- RLS Patients: super_admin nunca; admin CRUD; contador SELECT; usuario SELECT
DROP POLICY IF EXISTS "admin deletes patients" ON public.patients;
DROP POLICY IF EXISTS "clinic members insert patients" ON public.patients;
DROP POLICY IF EXISTS "clinic members read patients" ON public.patients;
DROP POLICY IF EXISTS "clinic members update patients" ON public.patients;

CREATE POLICY "patients_select" ON public.patients
  FOR SELECT TO authenticated
  USING (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
  );

CREATE POLICY "patients_insert_admin" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND "current_role"() = 'admin'::app_role
  );

CREATE POLICY "patients_update_admin" ON public.patients
  FOR UPDATE TO authenticated
  USING (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND "current_role"() = 'admin'::app_role
  )
  WITH CHECK (
    clinic_id = current_clinic_id()
    AND "current_role"() = 'admin'::app_role
  );

CREATE POLICY "patients_delete_admin" ON public.patients
  FOR DELETE TO authenticated
  USING (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND "current_role"() = 'admin'::app_role
  );

-- RLS Attendances: super_admin nunca; admin+contador escrevem; usuario lê; delete só admin
DROP POLICY IF EXISTS "admin deletes attendances" ON public.attendances;
DROP POLICY IF EXISTS "clinic members insert attendances" ON public.attendances;
DROP POLICY IF EXISTS "clinic members read attendances" ON public.attendances;
DROP POLICY IF EXISTS "clinic members update attendances" ON public.attendances;

CREATE POLICY "attendances_select" ON public.attendances
  FOR SELECT TO authenticated
  USING (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
  );

CREATE POLICY "attendances_insert_staff" ON public.attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND "current_role"() IN ('admin'::app_role, 'contador'::app_role)
  );

CREATE POLICY "attendances_update_staff" ON public.attendances
  FOR UPDATE TO authenticated
  USING (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND "current_role"() IN ('admin'::app_role, 'contador'::app_role)
  )
  WITH CHECK (
    clinic_id = current_clinic_id()
    AND "current_role"() IN ('admin'::app_role, 'contador'::app_role)
  );

CREATE POLICY "attendances_delete_admin" ON public.attendances
  FOR DELETE TO authenticated
  USING (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND "current_role"() = 'admin'::app_role
  );
