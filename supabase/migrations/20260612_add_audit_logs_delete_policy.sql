-- Allow super_admin to delete old audit logs for retention policy
CREATE POLICY "audit_logs_delete_superadmin"
  ON public.audit_logs
  FOR DELETE
  USING (is_super_admin());
