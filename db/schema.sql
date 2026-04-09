-- CREATE TABLE IF NOT EXISTS parroquias (
--     id SERIAL PRIMARY KEY,
--     nombre VARCHAR(255) NOT NULL,
--     direccion TEXT,
--     lat DECIMAL(10, 8),
--     lng DECIMAL(11, 8),
--     municipio_id INTEGER,
--     estado INTEGER,
--     google_place_id VARCHAR(255),
--     rating DECIMAL(3,2),
--     photos JSONB,

--     -- ✅ Control Google enrichment
--     enriched BOOLEAN DEFAULT FALSE,
--     enrichment_attempted BOOLEAN DEFAULT FALSE,
--     last_enrichment_attempt TIMESTAMP,

--     last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- ❌ Remove old UNIQUE if exists (important)
-- ALTER TABLE parroquias
-- DROP CONSTRAINT IF EXISTS parroquias_nombre_direccion_key;

-- DROP INDEX IF EXISTS parroquias_unique_normalized;

-- CREATE UNIQUE INDEX parroquias_unique_normalized 
-- ON parroquias (
--     COALESCE(LOWER(TRIM(nombre)), ''),
--     COALESCE(LOWER(TRIM(direccion)), '')
-- );

-- -- ✅ Fast queries by location
-- CREATE INDEX IF NOT EXISTS idx_parroquias_estado_municipio 
-- ON parroquias(estado, municipio_id);

-- -- ✅ Fast enrichment lookup
-- CREATE INDEX IF NOT EXISTS idx_parroquias_enrichment 
-- ON parroquias(enriched, enrichment_attempted);

-- DROP INDEX IF EXISTS idx_unique_place_id;

-- CREATE UNIQUE INDEX idx_unique_place_id
-- ON parroquias(google_place_id)
-- WHERE google_place_id IS NOT NULL;

-- -- ✅ Ensure photos is always an array (clean data)
-- ALTER TABLE parroquias
-- ADD CONSTRAINT IF NOT EXISTS photos_is_array 
-- CHECK (photos IS NULL OR jsonb_typeof(photos) = 'array');
CREATE TABLE parroquias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    direccion TEXT,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    municipio_id INTEGER,
    estado INTEGER,

    -- Google / enrichment
    google_place_id TEXT,
    rating NUMERIC,
    imagen TEXT,
    photos JSONB,

    -- Info extra (IMPORTANTE: ya incluido desde inicio)
    diocesis TEXT,
    telefono TEXT,
    fiesta_patronal TEXT,
    misas_hoy TEXT,

    -- Control Google enrichment
    enriched BOOLEAN DEFAULT FALSE,
    enrichment_attempted BOOLEAN DEFAULT FALSE,
    last_enrichment_attempt TIMESTAMP,

    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 🔥 UNIQUE correcto (evita duplicados reales)
ALTER TABLE parroquias
ADD CONSTRAINT parroquias_unique_nombre_direccion
UNIQUE (nombre, direccion);

-- 🔥 Para HomePage (queries por ubicación)
CREATE INDEX idx_parroquias_estado_municipio 
ON parroquias(estado, municipio_id);

-- 🔥 Para enrichment
CREATE INDEX idx_parroquias_enrichment 
ON parroquias(enriched, enrichment_attempted);

-- 🔥 Para favoritos (clave)
CREATE UNIQUE INDEX idx_unique_place_id
ON parroquias(google_place_id)
WHERE google_place_id IS NOT NULL;

-- 🔥 Validación de JSON
ALTER TABLE parroquias
ADD CONSTRAINT photos_is_array 
CHECK (photos IS NULL OR jsonb_typeof(photos) = 'array');