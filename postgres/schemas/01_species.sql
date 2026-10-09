-- Database Schema: orchid_species_db
CREATE TABLE IF NOT EXISTS species_identifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    plant_id TEXT,
    verdict TEXT NOT NULL,
    total_images INTEGER DEFAULT 1,
    detections JSONB,
    image_filenames TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_species_user_id ON species_identifications(user_id);
CREATE INDEX IF NOT EXISTS idx_species_created_at ON species_identifications(created_at DESC);
