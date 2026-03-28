CREATE TABLE IF NOT EXISTS parroquias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    direccion TEXT,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    municipio_id INTEGER,
    estado INTEGER,
    google_place_id VARCHAR(255),
    rating DECIMAL(3,2),
    photos JSONB,

    -- ✅ Control Google enrichment
    enriched BOOLEAN DEFAULT FALSE,
    enrichment_attempted BOOLEAN DEFAULT FALSE,
    last_enrichment_attempt TIMESTAMP,

    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ❌ Remove old UNIQUE if exists (important)
ALTER TABLE parroquias
DROP CONSTRAINT IF EXISTS parroquias_nombre_direccion_key;

-- ✅ Unique normalized (prevents duplicates properly)
CREATE UNIQUE INDEX IF NOT EXISTS parroquias_unique_normalized 
ON parroquias (
    LOWER(TRIM(nombre)),
    LOWER(TRIM(direccion))
);

-- ✅ Fast queries by location
CREATE INDEX IF NOT EXISTS idx_parroquias_estado_municipio 
ON parroquias(estado, municipio_id);

-- ✅ Fast enrichment lookup
CREATE INDEX IF NOT EXISTS idx_parroquias_enrichment 
ON parroquias(enriched, enrichment_attempted);

-- ✅ Optional but useful for future
CREATE INDEX IF NOT EXISTS idx_parroquias_place_id
ON parroquias(google_place_id);

-- ✅ Ensure photos is always an array (clean data)
ALTER TABLE parroquias
ADD CONSTRAINT IF NOT EXISTS photos_is_array 
CHECK (photos IS NULL OR jsonb_typeof(photos) = 'array');