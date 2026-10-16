-- Database Schema: orchid_species_db
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS plants (
    plant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_name VARCHAR(255) NOT NULL,
    plant_species VARCHAR(255) NOT NULL,
    plant_location VARCHAR(255),
    location_id UUID,
    user_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_plants_user_id ON plants(user_id);
CREATE INDEX IF NOT EXISTS idx_plants_location_id ON plants(location_id);
CREATE INDEX IF NOT EXISTS idx_plants_created_at ON plants(created_at DESC);
