
-- ============== ENUM de roles ==============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');

-- ============== TABELA: clinics ==============
CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'inativo' CHECK (status IN ('ativo','inativo')),
  expiration_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============== TABELA: profiles ==============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============== TABELA: patients ==============
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  cpf text,
  responsible_name text,
  responsible_cpf text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_patients_clinic ON public.patients(clinic_id);

-- ============== TABELA: attendances ==============
CREATE TABLE public.attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  date date NOT NULL,
  value numeric(12,2) NOT NULL CHECK (value > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('Pix','Dinheiro')),
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente','Emitido')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attendances_clinic ON public.attendances(clinic_id);
CREATE INDEX idx_attendances_patient ON public.attendances(patient_id);

-- ============== Trigger: auto-create profile on signup ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, clinic_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'user'),
    NULLIF(NEW.raw_user_meta_data->>'clinic_id','')::uuid
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== Helper functions (SECURITY DEFINER) ==============
CREATE OR REPLACE FUNCTION public.current_clinic_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT clinic_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin') $$;

CREATE OR REPLACE FUNCTION public.is_clinic_active()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinics c
    JOIN public.profiles p ON p.clinic_id = c.id
    WHERE p.id = auth.uid()
      AND c.status = 'ativo'
      AND (c.expiration_date IS NULL OR c.expiration_date > now())
  )
$$;

-- ============== Enable RLS ==============
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

-- ============== Policies: clinics ==============
-- Super admin: full access
CREATE POLICY "super_admin manages clinics" ON public.clinics
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Any user: can read own clinic (needed for bloqueio check)
CREATE POLICY "user reads own clinic" ON public.clinics
  FOR SELECT TO authenticated
  USING (id = public.current_clinic_id());

-- ============== Policies: profiles ==============
-- User reads own profile
CREATE POLICY "user reads own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Super admin reads/manages all profiles
CREATE POLICY "super_admin manages profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Admin of clinic reads profiles of own clinic
CREATE POLICY "admin reads clinic profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.current_role() = 'admin'
    AND clinic_id = public.current_clinic_id()
  );

-- ============== Policies: patients ==============
CREATE POLICY "clinic members read patients" ON public.patients
  FOR SELECT TO authenticated
  USING (clinic_id = public.current_clinic_id() AND public.is_clinic_active());

CREATE POLICY "clinic members insert patients" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.current_clinic_id() AND public.is_clinic_active());

CREATE POLICY "clinic members update patients" ON public.patients
  FOR UPDATE TO authenticated
  USING (clinic_id = public.current_clinic_id() AND public.is_clinic_active())
  WITH CHECK (clinic_id = public.current_clinic_id() AND public.is_clinic_active());

CREATE POLICY "admin deletes patients" ON public.patients
  FOR DELETE TO authenticated
  USING (
    clinic_id = public.current_clinic_id()
    AND public.is_clinic_active()
    AND public.current_role() = 'admin'
  );

-- ============== Policies: attendances ==============
CREATE POLICY "clinic members read attendances" ON public.attendances
  FOR SELECT TO authenticated
  USING (clinic_id = public.current_clinic_id() AND public.is_clinic_active());

CREATE POLICY "clinic members insert attendances" ON public.attendances
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.current_clinic_id() AND public.is_clinic_active());

CREATE POLICY "clinic members update attendances" ON public.attendances
  FOR UPDATE TO authenticated
  USING (clinic_id = public.current_clinic_id() AND public.is_clinic_active())
  WITH CHECK (clinic_id = public.current_clinic_id() AND public.is_clinic_active());

CREATE POLICY "admin deletes attendances" ON public.attendances
  FOR DELETE TO authenticated
  USING (
    clinic_id = public.current_clinic_id()
    AND public.is_clinic_active()
    AND public.current_role() = 'admin'
  );
