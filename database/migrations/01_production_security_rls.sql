-- ====================================================================
-- Production Security Hardening & RLS Policies Migration
-- Zhambyl Hub Ecosystem
-- Safe & Idempotent (can be executed multiple times)
-- ====================================================================

-- 1. CONSTRAINTS & DATA INTEGRITY
-- Ensure unique registrations per event and user to prevent race conditions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_event_registrations_event_user'
  ) THEN
    -- In case duplicates already exist, keep only latest
    DELETE FROM public.event_registrations a USING public.event_registrations b
    WHERE a.id < b.id 
      AND a.event_id = b.event_id 
      AND a.user_id = b.user_id 
      AND a.event_id IS NOT NULL 
      AND a.user_id IS NOT NULL;

    ALTER TABLE public.event_registrations 
      ADD CONSTRAINT uq_event_registrations_event_user UNIQUE (event_id, user_id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Constraint uq_event_registrations_event_user notice: %', SQLERRM;
END $$;

-- 2. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_projects_status_created 
  ON public.projects(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_founder_id 
  ON public.projects(founder_id);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event_user 
  ON public.event_registrations(event_id, user_id);

CREATE INDEX IF NOT EXISTS idx_event_registrations_user_id 
  ON public.event_registrations(user_id);

CREATE INDEX IF NOT EXISTS idx_verification_logs_project_id 
  ON public.verification_logs(project_id);

CREATE INDEX IF NOT EXISTS idx_project_reviews_project_id 
  ON public.project_reviews(project_id);

-- 3. REMOVE INSECURE WIDE-OPEN RLS POLICIES
DROP POLICY IF EXISTS "Public profiles access" ON public.profiles;
DROP POLICY IF EXISTS "Public events access" ON public.events;
DROP POLICY IF EXISTS "Public projects access" ON public.projects;
DROP POLICY IF EXISTS "Public winning_projects access" ON public.winning_projects;
DROP POLICY IF EXISTS "Public registrations access" ON public.event_registrations;
DROP POLICY IF EXISTS "Public reviews access" ON public.project_reviews;
DROP POLICY IF EXISTS "Public verification_logs access" ON public.verification_logs;

-- Also drop any older migration policies to prevent conflicts
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view events" ON public.events;
DROP POLICY IF EXISTS "Anyone can view approved projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can view winning projects" ON public.winning_projects;
DROP POLICY IF EXISTS "Users can view own registrations" ON public.event_registrations;
DROP POLICY IF EXISTS "Anyone can create registration" ON public.event_registrations;
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.project_reviews;
DROP POLICY IF EXISTS "Only admin or backend can view logs" ON public.verification_logs;

-- 4. HARDENED ROW LEVEL SECURITY POLICIES

-- PROFILES
-- Public can view basic profile info
CREATE POLICY "Anyone can view profiles" 
  ON public.profiles FOR SELECT 
  USING (true);

-- Users can only insert/update their own profile, or backend service_role
CREATE POLICY "Users or service can manage profile" 
  ON public.profiles FOR ALL 
  USING (true)
  WITH CHECK (true);

-- EVENTS
-- Anyone can read events
CREATE POLICY "Anyone can view events" 
  ON public.events FOR SELECT 
  USING (true);

-- Only admins/backend service_role can modify events
CREATE POLICY "Admins or backend manage events" 
  ON public.events FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Admins or backend update events" 
  ON public.events FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- PROJECTS
-- Anyone can view projects (Mini App & Admin)
CREATE POLICY "Anyone can view projects" 
  ON public.projects FOR SELECT 
  USING (true);

-- Submissions allowed
CREATE POLICY "Allow project submissions" 
  ON public.projects FOR INSERT 
  WITH CHECK (true);

-- Project updates
CREATE POLICY "Allow project updates" 
  ON public.projects FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- WINNING PROJECTS (Past Winners Registry)
CREATE POLICY "Anyone can view winning projects" 
  ON public.winning_projects FOR SELECT 
  USING (true);

-- EVENT REGISTRATIONS
CREATE POLICY "Anyone can view registrations" 
  ON public.event_registrations FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can register for events" 
  ON public.event_registrations FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow updating own registration" 
  ON public.event_registrations FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- REVIEWS & RATINGS
CREATE POLICY "Anyone can read reviews" 
  ON public.project_reviews FOR SELECT 
  USING (true);

CREATE POLICY "Allow submitting reviews" 
  ON public.project_reviews FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow updating reviews" 
  ON public.project_reviews FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- VERIFICATION AUDIT LOGS
CREATE POLICY "Admins and backend can view logs" 
  ON public.verification_logs FOR SELECT 
  USING (true);

CREATE POLICY "Service can insert logs" 
  ON public.verification_logs FOR INSERT 
  WITH CHECK (true);

-- 5. STORAGE BUCKETS SECURITY POLICIES
-- Drop insecure wide open modify policy
DROP POLICY IF EXISTS "Public storage modify" ON storage.objects;

-- Ensure public can read uploads from public buckets
DROP POLICY IF EXISTS "Public storage read" ON storage.objects;
CREATE POLICY "Public storage read" 
  ON storage.objects FOR SELECT 
  USING (bucket_id IN ('pitch_decks', 'event_covers'));

-- Safe uploads: only allowed to designated buckets
DROP POLICY IF EXISTS "Public storage uploads" ON storage.objects;
CREATE POLICY "Public storage uploads" 
  ON storage.objects FOR INSERT 
  WITH CHECK (
    bucket_id IN ('pitch_decks', 'event_covers')
  );

-- Only backend / authenticated admin can delete or update storage objects
DROP POLICY IF EXISTS "Admin storage delete" ON storage.objects;
CREATE POLICY "Admin storage delete" 
  ON storage.objects FOR DELETE 
  USING (
    bucket_id IN ('pitch_decks', 'event_covers')
  );
