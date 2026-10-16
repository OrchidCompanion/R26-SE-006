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

-- Plural alias view
CREATE OR REPLACE VIEW sensor_modules AS SELECT * FROM sensor_module;

-- Daily DHT11 Temperature & Humidity Readings (Single Source of Truth)
CREATE TABLE IF NOT EXISTS dht11_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id UUID DEFAULT gen_random_uuid(),
    temperature NUMERIC,
    humidity NUMERIC,
    time_slot VARCHAR(50) DEFAULT 'morning',
    location_id UUID,
    module_id VARCHAR(255),
    user_id VARCHAR(255),
    plant_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dht_loc ON dht11_history(location_id);
CREATE INDEX IF NOT EXISTS idx_dht_mod ON dht11_history(module_id);
CREATE INDEX IF NOT EXISTS idx_dht_created ON dht11_history(created_at DESC);

-- Backward compatibility view if needed
CREATE OR REPLACE VIEW dht11_environment_history AS SELECT * FROM dht11_history;

-- Daily BH1750 Light Lux Readings (Single Source of Truth)
CREATE TABLE IF NOT EXISTS bh1750_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id UUID DEFAULT gen_random_uuid(),
    lux NUMERIC,
    time_slot VARCHAR(50) DEFAULT 'morning',
    location_id UUID,
    module_id VARCHAR(255),
    user_id VARCHAR(255),
    plant_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bh_loc ON bh1750_history(location_id);
CREATE INDEX IF NOT EXISTS idx_bh_mod ON bh1750_history(module_id);
CREATE INDEX IF NOT EXISTS idx_bh_created ON bh1750_history(created_at DESC);

-- Backward compatibility view if needed
CREATE OR REPLACE VIEW bh1750_environment_history AS SELECT * FROM bh1750_history;
