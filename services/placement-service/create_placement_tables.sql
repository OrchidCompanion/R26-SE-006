-- Supabase Database Schema for Plant Placement Analysis Service
-- Run this SQL script inside your dedicated Supabase project SQL Editor

-- 1. Locations Table
CREATE TABLE IF NOT EXISTS public.locations (
    location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_loc_user_id ON public.locations(user_id);

-- 2. Hardware Sensor Modules (ESP32-S3)
CREATE TABLE IF NOT EXISTS public.sensor_modules (
    module_id VARCHAR(255) PRIMARY KEY,
    device_name VARCHAR(255) DEFAULT 'ESP32 S3 Sensor',
    user_id VARCHAR(255),
    location_id UUID REFERENCES public.locations(location_id) ON DELETE SET NULL,
    last_seen TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_user_id ON public.sensor_modules(user_id);

-- 3. Ambient Telemetry History (Ingested from MQTT)
CREATE TABLE IF NOT EXISTS public.ambient_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id VARCHAR(255),
    temperature NUMERIC,
    humidity NUMERIC,
    lux NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amb_module_id ON public.ambient_telemetry(module_id);
CREATE INDEX IF NOT EXISTS idx_amb_created_at ON public.ambient_telemetry(created_at DESC);

-- 4. Location Analysis Test Records
CREATE TABLE IF NOT EXISTS public.location_analysis_records (
    record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255),
    module_id VARCHAR(255),
    species VARCHAR(100) DEFAULT 'Dendrobium',
    readings JSONB,
    averages JSONB,
    verdict VARCHAR(100),
    recommendation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loc_test_user ON public.location_analysis_records(user_id);

-- Enable RLS & permissive policies
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all on locations" ON public.locations;
CREATE POLICY "Allow public all on locations" ON public.locations FOR ALL USING (true);

ALTER TABLE public.sensor_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all on sensor_modules" ON public.sensor_modules;
CREATE POLICY "Allow public all on sensor_modules" ON public.sensor_modules FOR ALL USING (true);

ALTER TABLE public.ambient_telemetry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all on ambient_telemetry" ON public.ambient_telemetry;
CREATE POLICY "Allow public all on ambient_telemetry" ON public.ambient_telemetry FOR ALL USING (true);

ALTER TABLE public.location_analysis_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all on location_analysis_records" ON public.location_analysis_records;
CREATE POLICY "Allow public all on location_analysis_records" ON public.location_analysis_records FOR ALL USING (true);
