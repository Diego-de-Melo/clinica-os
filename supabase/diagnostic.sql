-- Check your current profile and role
SELECT id, email, role, clinic_id
FROM public.profiles
WHERE id = auth.uid();

-- Check if the clinic is active
SELECT c.id, c.name, c.status, c.expiration_date
FROM public.clinics c
JOIN public.profiles p ON p.clinic_id = c.id
WHERE p.id = auth.uid();
