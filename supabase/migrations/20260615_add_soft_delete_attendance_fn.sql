-- SECURITY DEFINER function to soft-delete an attendance
-- Bypasses RLS because the function owner (postgres) has full access
-- Authorization is still enforced at the application level (assertAttendanceWriter)
CREATE OR REPLACE FUNCTION public.soft_delete_attendance(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.attendances
  SET deleted_at = now()
  WHERE id = p_id;
END;
$$;
