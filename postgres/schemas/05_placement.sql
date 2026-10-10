-- Database Schema: orchid_placement_db
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS locations (
    location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_loc_user_id ON locations(user_id);

CREATE TABLE IF NOT EXISTS sensor_module (
    module_id VARCHAR(255) PRIMARY KEY,
    device_name VARCHAR(255) DEFAULT 'ESP32 S3 Sensor',
    user_id VARCHAR(255),
    location_id UUID REFERENCES locations(location_id) ON DELETE SET NULL,
    last_seen TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_user_id ON sensor_module(user_id);

-- Also support plural alias if needed
CREATE OR REPLACE VIEW sensor_modules AS SELECT * FROM sensor_module;

CREATE TABLE IF NOT EXISTS dht11_environment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temperature NUMERIC,
    humidity NUMERIC,
    time_slot VARCHAR(50) DEFAULT 'morning',
    location_id UUID,
    module_id VARCHAR(255),
    user_id VARCHAR(255),
    plant_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dht_loc ON dht11_environment_history(location_id);
CREATE INDEX IF NOT EXISTS idx_dht_mod ON dht11_environment_history(module_id);
CREATE INDEX IF NOT EXISTS idx_dht_created ON dht11_environment_history(created_at DESC);

CREATE TABLE IF NOT EXISTS dht11_suitability_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avg_temperature NUMERIC,
    avg_humidity NUMERIC,
    suitability_status VARCHAR(100),
    target_species VARCHAR(100) DEFAULT 'Dendrobium',
    notes TEXT,
    module_id VARCHAR(255),
    user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bh1750_environment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lux NUMERIC,
    time_slot VARCHAR(50) DEFAULT 'morning',
    location_id UUID,
    module_id VARCHAR(255),
    user_id VARCHAR(255),
    plant_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bh_loc ON bh1750_environment_history(location_id);
CREATE INDEX IF NOT EXISTS idx_bh_mod ON bh1750_environment_history(module_id);
CREATE INDEX IF NOT EXISTS idx_bh_created ON bh1750_environment_history(created_at DESC);

CREATE TABLE IF NOT EXISTS bh1750_suitability_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avg_lux NUMERIC,
    suitability_status VARCHAR(100),
    target_species VARCHAR(100) DEFAULT 'Dendrobium',
    notes TEXT,
    module_id VARCHAR(255),
    user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ambient_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id VARCHAR(255),
    temperature NUMERIC,
    humidity NUMERIC,
    lux NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amb_module_id ON ambient_telemetry(module_id);
CREATE INDEX IF NOT EXISTS idx_amb_created_at ON ambient_telemetry(created_at DESC);

CREATE TABLE IF NOT EXISTS location_analysis_records (
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

CREATE INDEX IF NOT EXISTS idx_loc_test_user ON location_analysis_records(user_id);
