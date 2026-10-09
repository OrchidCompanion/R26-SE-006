-- Supabase Database Schema for Member IT22140616 (Species Identification Service)
-- Run this script inside your dedicated Supabase project SQL Editor

CREATE TABLE IF NOT EXISTS public.species_identifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    plant_id TEXT,
    verdict TEXT NOT NULL,
    total_images INTEGER DEFAULT 1,
    detections JSONB,
    image_filenames TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) or add index for query performance
CREATE INDEX IF NOT EXISTS idx_species_user_id ON public.species_identifications(user_id);
CREATE INDEX IF NOT EXISTS idx_species_created_at ON public.species_identifications(created_at DESC);

COMMENT ON TABLE public.species_identifications IS 'Historical log of orchid species identifications for IT22140616';
