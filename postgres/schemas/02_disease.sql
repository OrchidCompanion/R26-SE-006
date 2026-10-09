-- Database Schema: orchid_disease_db
CREATE TABLE IF NOT EXISTS disease_analysis (
    analysis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    plant_id TEXT,
    verdict TEXT NOT NULL,
    disease_name TEXT NOT NULL,
    disease_info TEXT,
    confidence NUMERIC,
    treatment JSONB,
    npk_reading JSONB,
    npk_status JSONB,
    npk_advice JSONB,
    result_image_b64 TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_disease_user_id ON disease_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_disease_plant_id ON disease_analysis(plant_id);
CREATE INDEX IF NOT EXISTS idx_disease_created_at ON disease_analysis(created_at DESC);

CREATE TABLE IF NOT EXISTS npk_history (
    reading_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id TEXT,
    user_id TEXT,
    nitrogen_n NUMERIC,
    phosphorus_p NUMERIC,
    potassium_k NUMERIC,
    time_slot TEXT DEFAULT 'morning',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_npk_plant_id ON npk_history(plant_id);
CREATE INDEX IF NOT EXISTS idx_npk_created_at ON npk_history(created_at DESC);
