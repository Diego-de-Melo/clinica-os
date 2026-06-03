
-- backup_configs: 1 linha por clínica
CREATE TABLE public.backup_configs (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 90 CHECK (retention_days IN (30, 90, 365)),
  last_run_at timestamptz,
  last_status text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.backup_configs TO authenticated;
GRANT ALL ON public.backup_configs TO service_role;

ALTER TABLE public.backup_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY backup_configs_select ON public.backup_configs
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (clinic_id = current_clinic_id() AND public."current_role"() = 'admin'::app_role));

CREATE POLICY backup_configs_update_admin ON public.backup_configs
  FOR UPDATE TO authenticated
  USING (clinic_id = current_clinic_id() AND public."current_role"() = 'admin'::app_role AND is_clinic_active())
  WITH CHECK (clinic_id = current_clinic_id() AND public."current_role"() = 'admin'::app_role);

-- backups: snapshots
CREATE TABLE public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  size_bytes bigint NOT NULL DEFAULT 0,
  record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  object_path text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  checksum_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','restoring')),
  created_by text NOT NULL DEFAULT 'system',
  error text,
  UNIQUE (clinic_id, version)
);

CREATE INDEX idx_backups_clinic_created ON public.backups (clinic_id, created_at DESC);

GRANT SELECT ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY backups_select ON public.backups
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (clinic_id = current_clinic_id() AND public."current_role"() = 'admin'::app_role));

-- Auto-cria backup_config quando uma clínica é criada
CREATE OR REPLACE FUNCTION public.ensure_backup_config()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.backup_configs (clinic_id) VALUES (NEW.id)
  ON CONFLICT (clinic_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_backup_config
AFTER INSERT ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.ensure_backup_config();

-- Cria configs para clínicas existentes
INSERT INTO public.backup_configs (clinic_id)
SELECT id FROM public.clinics
ON CONFLICT (clinic_id) DO NOTHING;
