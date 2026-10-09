-- Database Schema: orchid_flowering_db
CREATE TABLE IF NOT EXISTS prediction_history (
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

CREATE INDEX IF NOT EXISTS idx_bloom_user_id ON prediction_history(user_id);
CREATE INDEX IF NOT EXISTS idx_bloom_plant_id ON prediction_history(plant_id);
CREATE INDEX IF NOT EXISTS idx_bloom_created_at ON prediction_history(created_at DESC);

CREATE TABLE IF NOT EXISTS readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temperature FLOAT,
    humidity FLOAT,
    light FLOAT,
    user_id VARCHAR(255),
    plant_id VARCHAR(255),
    module_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_plant_id ON readings(plant_id);
CREATE INDEX IF NOT EXISTS idx_readings_created_at ON readings(created_at DESC);
