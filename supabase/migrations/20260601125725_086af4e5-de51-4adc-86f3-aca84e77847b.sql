-- 1. Soft delete columns
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS observacoes text NULL;

-- 2. Filter deleted_at on SELECT policies (drop + recreate)
DROP POLICY IF EXISTS patients_select ON public.patients;
CREATE POLICY patients_select ON public.patients
  FOR SELECT TO authenticated
  USING (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS attendances_select ON public.attendances;
CREATE POLICY attendances_select ON public.attendances
  FOR SELECT TO authenticated
  USING (
    current_clinic_id() IS NOT NULL
    AND clinic_id = current_clinic_id()
    AND is_clinic_active()
    AND deleted_at IS NULL
  );

-- 3. audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  clinic_id uuid NULL,
  action text NOT NULL,
  entity text NULL,
  record_id uuid NULL,
  metadata jsonb NULL,
  ip text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      "current_role"() = 'admin'::app_role
      AND clinic_id = current_clinic_id()
    )
  );

CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_super_admin());

CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_created
  ON public.audit_logs (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
  ON public.audit_logs (action, created_at DESC);

-- 4. consents (LGPD)
CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  clinic_id uuid NULL,
  kind text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  ip text NULL,
  user_agent text NULL
);

GRANT SELECT, INSERT, UPDATE ON public.consents TO authenticated;
GRANT ALL ON public.consents TO service_role;

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY consents_select ON public.consents
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_super_admin()
    OR ("current_role"() = 'admin'::app_role AND clinic_id = current_clinic_id())
  );

CREATE POLICY consents_insert ON public.consents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY consents_update_self ON public.consents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS idx_attendances_status
  ON public.attendances (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_attendances_created
  ON public.attendances (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendances_date
  ON public.attendances (clinic_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_patients_created
  ON public.patients (clinic_id, created_at DESC);

-- 6. log_audit RPC (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity text DEFAULT NULL,
  _record_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cid uuid;
  _id uuid;
BEGIN
  SELECT clinic_id INTO _cid FROM public.profiles WHERE id = _uid;
  INSERT INTO public.audit_logs(user_id, clinic_id, action, entity, record_id, metadata, ip, user_agent)
  VALUES (_uid, _cid, _action, _entity, _record_id, _metadata, _ip, _user_agent)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text, text) TO authenticated;

-- 7. dashboard_summary RPC
CREATE OR REPLACE FUNCTION public.dashboard_summary(
  _from date DEFAULT NULL,
  _to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid := current_clinic_id();
  _result jsonb;
BEGIN
  IF _cid IS NULL THEN
    RETURN jsonb_build_object(
      'total_patients', 0, 'total_attendances', 0, 'revenue', 0,
      'by_status', '{}'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
    'total_patients', (
      SELECT count(*) FROM public.patients
      WHERE clinic_id = _cid AND deleted_at IS NULL
    ),
    'total_attendances', (
      SELECT count(*) FROM public.attendances
      WHERE clinic_id = _cid AND deleted_at IS NULL
        AND (_from IS NULL OR date >= _from)
        AND (_to IS NULL OR date <= _to)
    ),
    'revenue', COALESCE((
      SELECT sum(value) FROM public.attendances
      WHERE clinic_id = _cid AND deleted_at IS NULL
        AND (_from IS NULL OR date >= _from)
        AND (_to IS NULL OR date <= _to)
    ), 0),
    'by_status', COALESCE((
      SELECT jsonb_object_agg(status, cnt)
      FROM (
        SELECT status, count(*) AS cnt
        FROM public.attendances
        WHERE clinic_id = _cid AND deleted_at IS NULL
          AND (_from IS NULL OR date >= _from)
          AND (_to IS NULL OR date <= _to)
        GROUP BY status
      ) s
    ), '{}'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_summary(date, date) TO authenticated;