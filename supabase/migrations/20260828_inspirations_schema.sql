BEGIN;

-- =============================================================================
-- MIGRATION: 20260828_inspirations_schema.sql (HARDENED PRODUCTION VERSION)
-- DESCRIPTION: Schema relacional, FKs compostas, constraints estritas e RLS
-- =============================================================================

-- 0. Função e Trigger Únicos para updated_at Automático
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Tabela Principal de Inspirações
CREATE TABLE IF NOT EXISTS public.inspirations (
  id VARCHAR(64) PRIMARY KEY,
  slug VARCHAR(128) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  destination_city VARCHAR(100) NOT NULL,
  destination_region VARCHAR(100),
  country VARCHAR(100) NOT NULL,
  country_code VARCHAR(10) NOT NULL,
  duration_days INT NOT NULL CHECK (duration_days > 0),
  short_description TEXT NOT NULL,
  long_description TEXT NOT NULL,
  traveler_profiles JSONB NOT NULL DEFAULT '[]'::jsonb,
  travel_styles JSONB NOT NULL DEFAULT '[]'::jsonb,
  pace VARCHAR(20) NOT NULL CHECK (pace IN ('light', 'balanced', 'intense')),
  budget_level VARCHAR(20) NOT NULL CHECK (budget_level IN ('budget', 'moderate', 'luxury')),
  estimated_budget_min NUMERIC(10,2) CHECK (estimated_budget_min IS NULL OR estimated_budget_min >= 0),
  estimated_budget_max NUMERIC(10,2) CHECK (estimated_budget_max IS NULL OR estimated_budget_max >= 0),
  currency VARCHAR(10) DEFAULT 'EUR',
  best_for JSONB NOT NULL DEFAULT '[]'::jsonb,
  hero_image_url TEXT,
  thumbnail_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  quality_score INT DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  editorial_score INT DEFAULT 0 CHECK (editorial_score BETWEEN 0 AND 25),
  operational_score INT DEFAULT 0 CHECK (operational_score BETWEEN 0 AND 40),
  flexibility_score INT DEFAULT 0 CHECK (flexibility_score BETWEEN 0 AND 15),
  completeness_score INT DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 10),
  freshness_score INT DEFAULT 0 CHECK (freshness_score BETWEEN 0 AND 10),
  planning_rationale TEXT,
  why_this_works TEXT,
  featured BOOLEAN DEFAULT FALSE,
  copilot_pick BOOLEAN DEFAULT FALSE,
  language VARCHAR(10) DEFAULT 'pt-BR',
  version VARCHAR(20) DEFAULT '1.0',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'Editorial CoPiloto',
  CONSTRAINT chk_budget_range CHECK (
    estimated_budget_min IS NULL OR 
    estimated_budget_max IS NULL OR 
    estimated_budget_max >= estimated_budget_min
  )
);

-- 2. Dias do Itinerário
CREATE TABLE IF NOT EXISTS public.inspiration_days (
  id VARCHAR(64) PRIMARY KEY,
  inspiration_id VARCHAR(64) NOT NULL REFERENCES public.inspirations(id) ON DELETE CASCADE,
  day_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  effort_level VARCHAR(20) DEFAULT 'medium' CHECK (effort_level IN ('low', 'medium', 'high')),
  estimated_walk_km NUMERIC(5,2) CHECK (estimated_walk_km IS NULL OR estimated_walk_km >= 0),
  estimated_transport_time VARCHAR(100),
  estimated_daily_cost VARCHAR(100),
  rain_plan TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inspiration_id, day_number),
  UNIQUE(id, inspiration_id)
);

-- 3. Atividades do Itinerário
CREATE TABLE IF NOT EXISTS public.inspiration_activities (
  id VARCHAR(64) PRIMARY KEY,
  inspiration_id VARCHAR(64) NOT NULL,
  day_id VARCHAR(64) NOT NULL,
  activity_order INT NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'attraction', 'museum', 'food', 'walk', 'shopping', 
    'nightlife', 'nature', 'transport', 'hotel', 'experience', 'free_time', 'other'
  )),
  description TEXT,
  start_time VARCHAR(10),
  end_time VARCHAR(10),
  estimated_duration VARCHAR(50),
  neighborhood VARCHAR(100),
  address TEXT,
  lat NUMERIC(10,6) CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90)),
  lng NUMERIC(10,6) CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180)),
  place_id VARCHAR(100),
  estimated_cost VARCHAR(100),
  currency VARCHAR(10) DEFAULT 'EUR',
  booking_required BOOLEAN DEFAULT FALSE,
  booking_recommended BOOLEAN DEFAULT FALSE,
  booking_priority VARCHAR(20) DEFAULT 'medium' CHECK (booking_priority IN ('low', 'medium', 'high', 'critical')),
  ticket_required BOOLEAN DEFAULT FALSE,
  priority VARCHAR(20) DEFAULT 'recommended' CHECK (priority IN ('must_do', 'recommended', 'optional')),
  flexibility VARCHAR(20) DEFAULT 'flexible' CHECK (flexibility IN ('fixed', 'semi_flexible', 'flexible')),
  indoor_outdoor VARCHAR(20) DEFAULT 'mixed' CHECK (indoor_outdoor IN ('indoor', 'outdoor', 'mixed')),
  recommended_time VARCHAR(50),
  operational_notes TEXT,
  why_here TEXT,
  alternative_activity_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_activities_day_inspiration FOREIGN KEY (day_id, inspiration_id) 
    REFERENCES public.inspiration_days(id, inspiration_id) ON DELETE CASCADE,
  UNIQUE(day_id, activity_order)
);

-- 4. Fontes de Informação e Pesquisa
CREATE TABLE IF NOT EXISTS public.inspiration_sources (
  id VARCHAR(64) PRIMARY KEY,
  inspiration_id VARCHAR(64) NOT NULL REFERENCES public.inspirations(id) ON DELETE CASCADE,
  source_name VARCHAR(255) NOT NULL,
  source_url TEXT,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('official', 'editorial', 'geographic', 'community', 'internal')),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  freshness_status VARCHAR(20) DEFAULT 'fresh' CHECK (freshness_status IN ('fresh', 'review_due', 'stale')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id, inspiration_id)
);

-- 5. Insights Sintetizados das Fontes
CREATE TABLE IF NOT EXISTS public.inspiration_source_insights (
  id VARCHAR(64) PRIMARY KEY,
  inspiration_id VARCHAR(64) NOT NULL,
  source_id VARCHAR(64),
  topic VARCHAR(100) NOT NULL,
  insight TEXT NOT NULL,
  confidence NUMERIC(3,2) DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_insights_source_inspiration FOREIGN KEY (source_id, inspiration_id)
    REFERENCES public.inspiration_sources(id, inspiration_id) ON DELETE SET NULL
);

-- 6. Coleções de Inspirações
CREATE TABLE IF NOT EXISTS public.inspiration_collections (
  id VARCHAR(64) PRIMARY KEY,
  slug VARCHAR(128) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  copilot_pick BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inspiration_collection_items (
  collection_id VARCHAR(64) NOT NULL REFERENCES public.inspiration_collections(id) ON DELETE CASCADE,
  inspiration_id VARCHAR(64) NOT NULL REFERENCES public.inspirations(id) ON DELETE CASCADE,
  display_order INT DEFAULT 1,
  PRIMARY KEY (collection_id, inspiration_id)
);

-- =============================================================================
-- TRIGGERS DE UPDATED_AT AUTOMÁTICO
-- =============================================================================

DROP TRIGGER IF EXISTS trg_set_updated_at_inspirations ON public.inspirations;
CREATE TRIGGER trg_set_updated_at_inspirations
  BEFORE UPDATE ON public.inspirations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_inspiration_days ON public.inspiration_days;
CREATE TRIGGER trg_set_updated_at_inspiration_days
  BEFORE UPDATE ON public.inspiration_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_inspiration_activities ON public.inspiration_activities;
CREATE TRIGGER trg_set_updated_at_inspiration_activities
  BEFORE UPDATE ON public.inspiration_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_inspiration_sources ON public.inspiration_sources;
CREATE TRIGGER trg_set_updated_at_inspiration_sources
  BEFORE UPDATE ON public.inspiration_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_inspiration_source_insights ON public.inspiration_source_insights;
CREATE TRIGGER trg_set_updated_at_inspiration_source_insights
  BEFORE UPDATE ON public.inspiration_source_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_inspiration_collections ON public.inspiration_collections;
CREATE TRIGGER trg_set_updated_at_inspiration_collections
  BEFORE UPDATE ON public.inspiration_collections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- ÍNDICES DE DESEMPENHO
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_inspiration_days_insp_id ON public.inspiration_days(inspiration_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_activities_insp_id ON public.inspiration_activities(inspiration_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_activities_day_id ON public.inspiration_activities(day_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_sources_insp_id ON public.inspiration_sources(inspiration_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_source_insights_insp_id ON public.inspiration_source_insights(inspiration_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_source_insights_src_id ON public.inspiration_source_insights(source_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_collection_items_insp_id ON public.inspiration_collection_items(inspiration_id);
CREATE INDEX IF NOT EXISTS idx_inspirations_status ON public.inspirations(status);
CREATE INDEX IF NOT EXISTS idx_inspirations_city_country ON public.inspirations(destination_city, country_code);

-- =============================================================================
-- POLÍTICAS DE SEGURANÇA E RLS (ROW LEVEL SECURITY) - IDEMPOTENTES
-- =============================================================================

ALTER TABLE public.inspirations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspiration_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspiration_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspiration_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspiration_source_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspiration_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspiration_collection_items ENABLE ROW LEVEL SECURITY;

-- 1. Inspirations (Leitura Pública apenas se status = 'published')
DROP POLICY IF EXISTS "Leitura publica de inspiracoes publicadas" ON public.inspirations;
CREATE POLICY "Leitura publica de inspiracoes publicadas" ON public.inspirations
  FOR SELECT USING (status = 'published');

-- 2. Days (Leitura Pública apenas se a inspiração pai for 'published')
DROP POLICY IF EXISTS "Leitura publica de dias publicados" ON public.inspiration_days;
CREATE POLICY "Leitura publica de dias publicados" ON public.inspiration_days
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.inspirations WHERE id = inspiration_days.inspiration_id AND status = 'published')
  );

-- 3. Activities (Leitura Pública apenas se a inspiração pai for 'published')
DROP POLICY IF EXISTS "Leitura publica de atividades publicadas" ON public.inspiration_activities;
CREATE POLICY "Leitura publica de atividades publicadas" ON public.inspiration_activities
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.inspirations WHERE id = inspiration_activities.inspiration_id AND status = 'published')
  );

-- 4. Collections (Leitura Pública apenas se is_public = TRUE)
DROP POLICY IF EXISTS "Leitura publica de colecoes ativas" ON public.inspiration_collections;
CREATE POLICY "Leitura publica de colecoes ativas" ON public.inspiration_collections
  FOR SELECT USING (is_public = TRUE);

-- 5. Collection Items (Leitura Pública apenas se coleção for is_public e a inspiração for 'published')
DROP POLICY IF EXISTS "Leitura publica de itens de colecao" ON public.inspiration_collection_items;
CREATE POLICY "Leitura publica de itens de colecao" ON public.inspiration_collection_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.inspiration_collections WHERE id = inspiration_collection_items.collection_id AND is_public = TRUE)
    AND
    EXISTS (SELECT 1 FROM public.inspirations WHERE id = inspiration_collection_items.inspiration_id AND status = 'published')
  );

COMMIT;
