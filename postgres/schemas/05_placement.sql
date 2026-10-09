-- Database Schema: orchid_placement_db
CREATE TABLE IF NOT EXISTS locations (
    location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_loc_user_id ON locations(user_id);

CREATE TABLE IF NOT EXISTS sensor_modules (
    module_id VARCHAR(255) PRIMARY KEY,
    device_name VARCHAR(255) DEFAULT 'ESP32 S3 Sensor',
    user_id VARCHAR(255),
    location_id UUID REFERENCES locations(location_id) ON DELETE SET NULL,
    last_seen TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mod_user_id ON sensor_modules(user_id);

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
