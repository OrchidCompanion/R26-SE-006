#!/bin/bash
set -e

echo "[Postgres Init] Creating isolated microservice databases..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE orchid_species_db;
    CREATE DATABASE orchid_disease_db;
    CREATE DATABASE orchid_flowering_db;
    CREATE DATABASE orchid_fertilizer_db;
    CREATE DATABASE orchid_placement_db;
    CREATE DATABASE orchid_auth_db;
EOSQL

echo "[Postgres Init] Applying schemas to each database..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "orchid_species_db" -f /docker-entrypoint-initdb.d/schemas/01_species.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "orchid_disease_db" -f /docker-entrypoint-initdb.d/schemas/02_disease.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "orchid_flowering_db" -f /docker-entrypoint-initdb.d/schemas/03_flowering.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "orchid_fertilizer_db" -f /docker-entrypoint-initdb.d/schemas/04_fertilizer.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "orchid_placement_db" -f /docker-entrypoint-initdb.d/schemas/05_placement.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "orchid_auth_db" -f /docker-entrypoint-initdb.d/schemas/06_auth.sql

echo "[Postgres Init] All 6 databases and schemas initialized successfully!"
