-- Supabase Database Schema for Member IT22085726 (Growth Stage & Fertilizer Service)
-- Run this SQL script inside your dedicated Supabase project SQL Editor

-- 1. Fertilizer Requirements & Analysis Table
CREATE TABLE IF NOT EXISTS public.fertilizer_requirements (
    requirement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id VARCHAR(255),
    user_id VARCHAR(255),
    fertilizer TEXT,
    qty NUMERIC DEFAULT 1.0,
    unit VARCHAR(50) DEFAULT 'application',
    growth_stage VARCHAR(100),
    leaf_dimensions JSONB,
    npk_analysis JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_fert_user_id ON public.fertilizer_requirements(user_id);
CREATE INDEX IF NOT EXISTS idx_fert_plant_id ON public.fertilizer_requirements(plant_id);
CREATE INDEX IF NOT EXISTS idx_fert_created_at ON public.fertilizer_requirements(created_at DESC);

-- 2. Soil NPK Telemetry Table (Ingested from MQTT broker)
CREATE TABLE IF NOT EXISTS public.npk_history (
    reading_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id VARCHAR(255),
    user_id VARCHAR(255),
    nitrogen_n NUMERIC,
    phosphorus_p NUMERIC,
    potassium_k NUMERIC,
    time_slot VARCHAR(50) DEFAULT 'morning',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fert_npk_plant ON public.npk_history(plant_id);
CREATE INDEX IF NOT EXISTS idx_fert_npk_created ON public.npk_history(created_at DESC);

-- Enable RLS & permissive policies
ALTER TABLE public.fertilizer_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all on fertilizer_requirements" ON public.fertilizer_requirements;
CREATE POLICY "Allow public all on fertilizer_requirements" ON public.fertilizer_requirements FOR ALL USING (true);

ALTER TABLE public.npk_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all on npk_history" ON public.npk_history;
CREATE POLICY "Allow public all on npk_history" ON public.npk_history FOR ALL USING (true);

COMMENT ON TABLE public.fertilizer_requirements IS 'Fertilizer application recommendations for IT22085726';
COMMENT ON TABLE public.npk_history IS 'Soil NPK sensor readings ingested for fertilizer balancing';
