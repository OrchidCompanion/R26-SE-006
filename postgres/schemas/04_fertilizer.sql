-- Database Schema: orchid_fertilizer_db
CREATE TABLE IF NOT EXISTS fertilizer_requirements (
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

CREATE INDEX IF NOT EXISTS idx_fert_user_id ON fertilizer_requirements(user_id);
CREATE INDEX IF NOT EXISTS idx_fert_plant_id ON fertilizer_requirements(plant_id);
CREATE INDEX IF NOT EXISTS idx_fert_created_at ON fertilizer_requirements(created_at DESC);

CREATE TABLE IF NOT EXISTS npk_history (
    reading_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_id VARCHAR(255),
    user_id VARCHAR(255),
    nitrogen_n NUMERIC,
    phosphorus_p NUMERIC,
    potassium_k NUMERIC,
    time_slot VARCHAR(50) DEFAULT 'morning',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fert_npk_plant ON npk_history(plant_id);
CREATE INDEX IF NOT EXISTS idx_fert_npk_created ON npk_history(created_at DESC);
