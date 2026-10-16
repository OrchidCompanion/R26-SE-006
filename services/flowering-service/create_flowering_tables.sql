-- Supabase Database Schema for Member IT22190598 (Flowering Lifecycle Service)
-- Run this SQL script inside your dedicated Supabase project SQL Editor

-- 1. Prediction History Table
CREATE TABLE IF NOT EXISTS public.prediction_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id VARCHAR(255),
    user_id VARCHAR(255),
    module_id VARCHAR(255),
    current_stage VARCHAR(255),
    estimated_flowering_date VARCHAR(255),
    flowering_date_range_display VARCHAR(255),
    total_days_to_flowering FLOAT,
    display_total_days INT,
    confidence FLOAT,
    timeline JSONB,
    sensor_summary JSONB,
    environment_evaluation JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bloom_user_id ON public.prediction_history(user_id);
CREATE INDEX IF NOT EXISTS idx_bloom_plant_id ON public.prediction_history(plant_id);
CREATE INDEX IF NOT EXISTS idx_bloom_created_at ON public.prediction_history(created_at DESC);

-- 2. IoT Environmental Telemetry Table (Ingested from MQTT broker)
CREATE TABLE IF NOT EXISTS public.readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temperature FLOAT,
    humidity FLOAT,
    light FLOAT,
    user_id VARCHAR(255),
    plant_id VARCHAR(255),
    module_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_plant_id ON public.readings(plant_id);
CREATE INDEX IF NOT EXISTS idx_readings_created_at ON public.readings(created_at DESC);

-- Enable RLS & permissive policies
ALTER TABLE public.prediction_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all on prediction_history" ON public.prediction_history;
CREATE POLICY "Allow public all on prediction_history" ON public.prediction_history FOR ALL USING (true);

ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all on readings" ON public.readings;
CREATE POLICY "Allow public all on readings" ON public.readings FOR ALL USING (true);

COMMENT ON TABLE public.prediction_history IS 'Historical log of orchid bloom forecasts for IT22190598';
COMMENT ON TABLE public.readings IS 'Hourly and real-time environmental IoT sensor readings from ESP32';
