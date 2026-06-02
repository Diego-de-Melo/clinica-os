REVOKE EXECUTE ON FUNCTION public.current_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_clinic_active() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_clinic_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_summary(date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_clinic_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(date, date) TO authenticated;