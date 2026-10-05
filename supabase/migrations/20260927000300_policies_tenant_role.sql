-- A6 + M8 + M11 + M12 + M13 + B4 + B5 + B6: políticas tenant/role + constraints + storage + log_audit

-- ============================================================
-- DADOS: conferir cross-tenant antes do M11 (FK composta)
-- ============================================================
-- Se esta query retornar linhas > 0, PARAR e reportar ao Diego:
-- SELECT a.id, a.patient_id, a.clinic_id AS att_clinic, p.clinic_id AS pat_clinic
-- FROM public.attendances a
-- JOIN public.patients p ON p.id = a.patient_id
-- WHERE a.clinic_id <> p.clinic_id;

-- ============================================================
-- M11: UNIQUE (id, clinic_id) em patients + FK composta em attendances
-- ============================================================
-- patients já tem PK (id). Adicionar índice único composto para a FK.
CREATE UNIQUE INDEX IF NOT EXISTS patients_id_clinic_id_unique
  ON public.patients (id, clinic_id);

-- attendances: FK composta para patients(id, clinic_id)
-- Primeiro remover FK antiga (se existir), depois adicionar a nova
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendances_patient_id_fkey'
  ) THEN
    ALTER TABLE public.attendances DROP CONSTRAINT attendances_patient_id_fkey;
  END IF;
END $$;

ALTER TABLE public.attendances
  ADD CONSTRAINT attendances_patient_id_clinic_id_fkey
  FOREIGN KEY (patient_id, clinic_id)
  REFERENCES public.patients (id, clinic_id)
  ON DELETE RESTRICT;

-- ============================================================
-- A6: DELETE de patients/attendances só para 'admin' (remove 'operador')
-- ============================================================
DROP POLICY IF EXISTS "admin deletes patients" ON public.patients;
CREATE POLICY "admin deletes patients" ON public.patients
  FOR DELETE TO authenticated
  USING (
    clinic_id = public.current_clinic_id()
    AND public.is_clinic_active()
    AND public.current_role() = 'admin'
  );

DROP POLICY IF EXISTS "admin deletes attendances" ON public.attendances;
CREATE POLICY "admin deletes attendances" ON public.attendances
  FOR DELETE TO authenticated
  USING (
    clinic_id = public.current_clinic_id()
    AND public.is_clinic_active()
    AND public.current_role() = 'admin'
  );

-- ============================================================
-- M8: consents - INSERT com clinic_id, UPDATE só revoked_at
-- ============================================================
DROP POLICY IF EXISTS consents_insert ON public.consents;
CREATE POLICY consents_insert ON public.consents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND clinic_id = public.current_clinic_id()
  );

-- UPDATE só na coluna revoked_at
REVOKE UPDATE ON public.consents FROM authenticated;
GRANT UPDATE (revoked_at) ON public.consents TO authenticated;

DROP POLICY IF EXISTS consents_update_self ON public.consents;
CREATE POLICY consents_update_self ON public.consents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND clinic_id = public.current_clinic_id())
  WITH CHECK (user_id = auth.uid() AND clinic_id = public.current_clinic_id());

-- ============================================================
-- M12: patients/attendances SELECT remove 'contador' (só admin, operador, usuario)
-- ============================================================
DROP POLICY IF EXISTS "clinic members read patients" ON public.patients;
CREATE POLICY "clinic members read patients" ON public.patients
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_clinic_id()
    AND public.is_clinic_active()
    AND public.current_role() IN ('admin', 'operador', 'usuario')
  );

DROP POLICY IF EXISTS "clinic members read attendances" ON public.attendances;
CREATE POLICY "clinic members read attendances" ON public.attendances
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.current_clinic_id()
    AND public.is_clinic_active()
    AND public.current_role() IN ('admin', 'operador', 'usuario')
  );

-- ============================================================
-- M13: audit_logs DELETE só super_admin (recriar)
-- ============================================================
DROP POLICY IF EXISTS "audit_logs_delete_superadmin" ON public.audit_logs;
CREATE POLICY "audit_logs_delete_superadmin" ON public.audit_logs
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ============================================================
-- B4: audit_logs/consents/backup_configs/backups SELECT com is_clinic_active() + super_admin
-- ============================================================
-- audit_logs_select
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (clinic_id = public.current_clinic_id() AND public.is_clinic_active())
  );

-- consents_select
DROP POLICY IF EXISTS consents_select ON public.consents;
CREATE POLICY consents_select ON public.consents
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (clinic_id = public.current_clinic_id() AND public.is_clinic_active())
  );

-- backup_configs_select
DROP POLICY IF EXISTS backup_configs_select ON public.backup_configs;
CREATE POLICY backup_configs_select ON public.backup_configs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (clinic_id = public.current_clinic_id() AND public.is_clinic_active())
  );

-- backups_select
DROP POLICY IF EXISTS backups_select ON public.backups;
CREATE POLICY backups_select ON public.backups
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (clinic_id = public.current_clinic_id() AND public.is_clinic_active())
  );

-- ============================================================
-- B5: storage.objects update/delete cobrem também tmp/<clinic>/
-- ============================================================
-- Admin update: permitir tmp/<clinic>/ além de clinic_id
DROP POLICY IF EXISTS "clinic-backups admin update" ON storage.objects;
CREATE POLICY "clinic-backups admin update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'clinic-backups'
    AND (
      (storage.foldername(name))[1] = public.current_clinic_id()::text
      OR (
        (storage.foldername(name))[1] = 'tmp'
        AND (storage.foldername(name))[2] = public.current_clinic_id()::text
      )
    )
  )
  WITH CHECK (
    bucket_id = 'clinic-backups'
    AND (
      (storage.foldername(name))[1] = public.current_clinic_id()::text
      OR (
        (storage.foldername(name))[1] = 'tmp'
        AND (storage.foldername(name))[2] = public.current_clinic_id()::text
      )
    )
  );

-- Admin delete: permitir tmp/<clinic>/
DROP POLICY IF EXISTS "clinic-backups admin delete" ON storage.objects;
CREATE POLICY "clinic-backups admin delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'clinic-backups'
    AND (
      (storage.foldername(name))[1] = public.current_clinic_id()::text
      OR (
        (storage.foldername(name))[1] = 'tmp'
        AND (storage.foldername(name))[2] = public.current_clinic_id()::text
      )
    )
  );

-- ============================================================
-- B6: log_audit valida _action (regex + tamanho)
-- ============================================================
DROP FUNCTION IF EXISTS public.log_audit(text, text, uuid, jsonb, uuid);
CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity text,
  _record_id uuid,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _clinic_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _action !~ '^[a-z]+(\.[a-z_]+)+$' THEN
    RAISE EXCEPTION 'action inválido: deve seguir o padrão "recurso.ação" (ex.: patient.create)';
  END IF;
  IF length(_action) > 80 THEN
    RAISE EXCEPTION 'action muito longo (máx 80 chars)';
  END IF;
  INSERT INTO public.audit_logs (action, entity, record_id, metadata, clinic_id)
  VALUES (_action, _entity, _record_id, _metadata, COALESCE(_clinic_id, public.current_clinic_id()));
END $$;

REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, uuid) TO authenticated;