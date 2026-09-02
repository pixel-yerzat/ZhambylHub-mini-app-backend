-- ====================================================================
-- Zhambyl Hub Telegram Mini App — Verification & Core Production Schema
-- Unified schema including Zhambyl Hub core tables & AI Verification Engine
-- Safe to run multiple times without any errors (Idempotent)
-- ====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS & PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,                             -- Telegram User ID (e.g. '682910412')
  first_name TEXT,                                -- Имя
  last_name TEXT,                                 -- Фамилия
  username TEXT,                                  -- @username в Telegram
  phone TEXT,                                     -- Номер телефона
  role TEXT NOT NULL DEFAULT 'community',         -- 'developer' | 'founder' | 'investor' | 'community' | 'moderator'
  role_title TEXT DEFAULT 'Резидент Hub',         -- Заголовок роли
  skills_or_interest TEXT,                        -- Специализация / Навыки / Интересы
  avatar_url TEXT,                                -- Аватарка
  is_telegram BOOLEAN DEFAULT true,               -- Запуск из Telegram
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. EVENTS TABLE (WITH COVER IMAGES & DETAILS)
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  title_kz TEXT,
  short_desc TEXT NOT NULL,
  description TEXT,
  image_url TEXT,                                 -- URL загруженной обложки мероприятия (Storage)
  date TEXT NOT NULL,                             -- Дата проведения (e.g. '12-14 Апреля 2026')
  time TEXT DEFAULT '10:00 - 18:00',
  location TEXT DEFAULT 'г. Тараз, коворкинг Zhambyl Hub',
  location_short TEXT DEFAULT 'Zhambyl Hub, Тараз',
  category_name TEXT DEFAULT 'Хакатон',           -- 'Хакатон' | 'Pizza Pitch' | 'Demo Day' | 'Воркшоп' | 'Митап'
  has_projects BOOLEAN DEFAULT true,              -- Ивент с защитой проектов или обычный воркшоп
  max_attendees INTEGER DEFAULT 120,
  current_attendees INTEGER DEFAULT 0,
  participating_project_ids TEXT[] DEFAULT '{}',  -- ID проектов на защите
  agenda JSONB DEFAULT '[]',                      -- Программа мероприятия
  speakers JSONB DEFAULT '[]',                    -- Спикеры / Жюри
  status TEXT NOT NULL DEFAULT 'approved',        -- 'pending' | 'approved' | 'rejected'
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_featured BOOLEAN DEFAULT false,              -- Главное событие (Hot)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. PROJECTS / STARTUPS & PDF PITCH DECKS TABLE
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'AI & IT Solutions',      -- 'AI & Data' | 'AgroTech' | 'GovTech' | 'FinTech' | 'MedTech' | 'EdTech'
  tag TEXT DEFAULT 'Startup',
  stage TEXT DEFAULT 'MVP / Prototype',           -- 'Idea' | 'MVP' | 'Early Traction' | 'Scale'
  short_desc TEXT NOT NULL,
  short_desc_kz TEXT,
  founder_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  founder_name TEXT NOT NULL,
  founder_phone TEXT,
  founder_role TEXT DEFAULT 'Founder & Team Lead',
  team_members TEXT,                              -- Состав команды (имена и роли)
  demo_url TEXT,                                  -- Ссылка на демо / сайт / GitHub
  logo_icon TEXT DEFAULT '🚀',
  pdf_deck_url TEXT,                              -- URL загруженного PDF файла презентации
  pdf_deck_name TEXT DEFAULT 'pitch_deck.pdf',
  pdf_deck_size TEXT DEFAULT '2.4 MB',
  status TEXT NOT NULL DEFAULT 'pending',         -- 'pending' | 'approved' | 'rejected_duplicate' | 'rejected_past_winner' | 'manual_review'
  
  -- Поля AI-верификации Gemini
  is_past_winner BOOLEAN DEFAULT false,           -- Отметка если проект победил на хакатоне
  winning_event_title TEXT,                       -- Название ивента, на котором проект победил
  rejection_reason TEXT,                          -- Причина отклонения (если дубликат или победитель)
  similarity_score NUMERIC(5, 2) DEFAULT 0.00,    -- Процент семантической схожести
  matched_entity_title TEXT,                      -- С чем совпало (название проекта)
  ai_analysis JSONB DEFAULT '{}'::jsonb,          -- Полный аудит анализа Gemini
  reviewed_by TEXT,                               -- Telegram ID модератора при ручной проверке
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  
  rating NUMERIC(3, 1) DEFAULT 5.0,
  reviews_count INTEGER DEFAULT 1,
  metrics JSONB DEFAULT '[
    {"label": "Статус", "value": "На модерации"},
    {"label": "Питч-дек", "value": "PDF загружен"},
    {"label": "Питч", "value": "Готов к защите"}
  ]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. WINNING PROJECTS REGISTRY (База победителей прошлых мероприятий)
CREATE TABLE IF NOT EXISTS public.winning_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  event_name TEXT NOT NULL,                       -- e.g. "Zhambyl Hub Hackathon 2024"
  year_or_date TEXT NOT NULL,                     -- e.g. "2024", "Spring 2025"
  team_name TEXT,
  winning_track TEXT,                             -- e.g. "1st Place Best AI Project"
  key_features TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. EVENT REGISTRATIONS & PROJECT DEFENSE APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.event_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  event_title TEXT NOT NULL,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendee_name TEXT NOT NULL,
  attendee_phone TEXT NOT NULL,
  telegram_username TEXT,
  registration_type TEXT NOT NULL DEFAULT 'listener', -- 'listener' | 'pitch_project'
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- Связь с проектом
  project_name TEXT,
  project_desc TEXT,
  team_members TEXT,
  pdf_deck_url TEXT,
  project_stage TEXT,
  project_category TEXT,
  demo_or_github_url TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',       -- 'confirmed' | 'attended' | 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. PROJECT REVIEWS & RATINGS TABLE
CREATE TABLE IF NOT EXISTS public.project_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  problem_score INTEGER CHECK (problem_score BETWEEN 1 AND 5),
  solution_score INTEGER CHECK (solution_score BETWEEN 1 AND 5),
  market_score INTEGER CHECK (market_score BETWEEN 1 AND 5),
  pitch_score INTEGER CHECK (pitch_score BETWEEN 1 AND 5),
  avg_score NUMERIC(3, 1) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- 7. VERIFICATION AUDIT LOGS (Логи обращений к Gemini AI)
CREATE TABLE IF NOT EXISTS public.verification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  verdict TEXT NOT NULL,
  similarity_score NUMERIC(5, 2),
  confidence_score NUMERIC(5, 2),
  raw_response JSONB,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winning_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles access" ON public.profiles;
DROP POLICY IF EXISTS "Public events access" ON public.events;
DROP POLICY IF EXISTS "Public projects access" ON public.projects;
DROP POLICY IF EXISTS "Public winning_projects access" ON public.winning_projects;
DROP POLICY IF EXISTS "Public registrations access" ON public.event_registrations;
DROP POLICY IF EXISTS "Public reviews access" ON public.project_reviews;
DROP POLICY IF EXISTS "Public verification_logs access" ON public.verification_logs;

CREATE POLICY "Public profiles access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public events access" ON public.events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public projects access" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public winning_projects access" ON public.winning_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public registrations access" ON public.event_registrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public reviews access" ON public.project_reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public verification_logs access" ON public.verification_logs FOR ALL USING (true) WITH CHECK (true);

-- ====================================================================
-- STORAGE BUCKETS CONFIGURATION (PDF PITCH DECKS & EVENT COVER IMAGES)
-- ====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES ('pitch_decks', 'pitch_decks', true, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE 
SET public = true, 
    file_size_limit = 10485760, 
    allowed_mime_types = ARRAY['application/pdf'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES ('event_covers', 'event_covers', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE 
SET public = true, 
    file_size_limit = 5242880, 
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS "Public storage uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public storage read" ON storage.objects;
DROP POLICY IF EXISTS "Public storage modify" ON storage.objects;

CREATE POLICY "Public storage uploads" 
  ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id IN ('pitch_decks', 'event_covers'));

CREATE POLICY "Public storage read" 
  ON storage.objects FOR SELECT 
  USING (bucket_id IN ('pitch_decks', 'event_covers'));

CREATE POLICY "Public storage modify" 
  ON storage.objects FOR ALL 
  USING (bucket_id IN ('pitch_decks', 'event_covers'));

-- ====================================================================
-- AUTOMATIC TIMESTAMPS TRIGGER
-- ====================================================================

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_modtime ON public.profiles;
CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_projects_modtime ON public.projects;
CREATE TRIGGER update_projects_modtime
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_winning_projects_modtime ON public.winning_projects;
CREATE TRIGGER update_winning_projects_modtime
    BEFORE UPDATE ON public.winning_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
