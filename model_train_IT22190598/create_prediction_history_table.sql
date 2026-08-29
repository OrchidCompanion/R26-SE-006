-- ==============================================================================
-- SUPABASE PREDICTION HISTORY TABLE SCHEMA
-- Run this SQL query in your Supabase SQL Editor to create the history table.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.prediction_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id VARCHAR(255),
    module_id VARCHAR(255),
    current_stage VARCHAR(255),
    estimated_flowering_date VARCHAR(255),
    flowering_date_range_display VARCHAR(255),
    total_days_to_flowering FLOAT,
    display_total_days INT,
    confidence FLOAT,
    timeline JSONB,
    sensor_summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) & Public Policies
ALTER TABLE public.prediction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select on prediction_history" ON public.prediction_history;
CREATE POLICY "Allow public select on prediction_history"
ON public.prediction_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on prediction_history" ON public.prediction_history;
CREATE POLICY "Allow public insert on prediction_history"
ON public.prediction_history FOR INSERT WITH CHECK (true);
