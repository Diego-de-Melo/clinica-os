
-- 1) Storage policies for clinic-backups bucket
-- Object path: "<clinic_id>/<file>" or "tmp/<clinic_id>/<file>"
-- Allow super admins full access; clinic admins access only their clinic folder.

DROP POLICY IF EXISTS "clinic-backups super_admin all" ON storage.objects;
DROP POLICY IF EXISTS "clinic-backups admin select" ON storage.objects;
DROP POLICY IF EXISTS "clinic-backups admin insert" ON storage.objects;
DROP POLICY IF EXISTS "clinic-backups admin update" ON storage.objects;
DROP POLICY IF EXISTS "clinic-backups admin delete" ON storage.objects;

CREATE POLICY "clinic-backups super_admin all"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'clinic-backups' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'clinic-backups' AND public.is_super_admin());

CREATE POLICY "clinic-backups admin select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'clinic-backups'
    AND public.current_role() = 'admin'::public.app_role
    AND public.current_clinic_id() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = public.current_clinic_id()::text
      OR (
        (storage.foldername(name))[1] = 'tmp'
        AND (storage.foldername(name))[2] = public.current_clinic_id()::text
      )
    )
  );

CREATE POLICY "clinic-backups admin insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'clinic-backups'
    AND public.current_role() = 'admin'::public.app_role
    AND public.current_clinic_id() IS NOT NULL
    AND (
      (storage.foldername(name))[1] = public.current_clinic_id()::text
      OR (
        (storage.foldername(name))[1] = 'tmp'
        AND (storage.foldername(name))[2] = public.current_clinic_id()::text
      )
    )
  );

CREATE POLICY "clinic-backups admin update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'clinic-backups'
    AND public.current_role() = 'admin'::public.app_role
    AND public.current_clinic_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.current_clinic_id()::text
  )
  WITH CHECK (
    bucket_id = 'clinic-backups'
    AND public.current_role() = 'admin'::public.app_role
    AND (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

CREATE POLICY "clinic-backups admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'clinic-backups'
    AND public.current_role() = 'admin'::public.app_role
    AND public.current_clinic_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

-- 2) backup_configs: add INSERT/DELETE restricted to super_admin
DROP POLICY IF EXISTS backup_configs_insert_super ON public.backup_configs;
DROP POLICY IF EXISTS backup_configs_delete_super ON public.backup_configs;

CREATE POLICY backup_configs_insert_super
  ON public.backup_configs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY backup_configs_delete_super
  ON public.backup_configs FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- 3) backups: add INSERT/DELETE restricted to super_admin
-- (Normal writes happen via service_role from server code, bypassing RLS.)
DROP POLICY IF EXISTS backups_insert_super ON public.backups;
DROP POLICY IF EXISTS backups_delete_super ON public.backups;

CREATE POLICY backups_insert_super
  ON public.backups FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY backups_delete_super
  ON public.backups FOR DELETE
  TO authenticated
  USING (public.is_super_admin());
