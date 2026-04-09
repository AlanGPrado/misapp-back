import axios from "axios";
import * as cheerio from "cheerio";
import { query } from "../db/index.js";
import { searchChurchOnGoogle } from "./googlePlacesService.js";
import pLimit from "p-limit";

const enrichmentLimit = pLimit(1);

/**
 * Scrapes churches from dondehaymisa.com and saves them to the DB.
 * @param {string} estado
 * @param {string|number} municipio_id
 * @param {number} page
 * @returns {Promise<Array>}
 */
const scrapeParroquias = async (estado, municipio_id, page) => {
    try {
        const url = `https://dondehaymisa.com/busqueda?diocese=&nombre=&estado=${estado}&municipio_id=${municipio_id}&tipo=&dia=&hora=&tipo_servicio=&formType=basic&page=${page}#parishResults`;
        const { data: html } = await axios.get(url);
        const $ = cheerio.load(html);
        const parishesFromScraping = [];

        const $parishRows = $(".row[style*='margin-bottom:3%']");

        for (let i = 0; i < $parishRows.length; i++) {
            const row = $parishRows[i];
            const $row = $(row);
            const $titleLink = $row.find("a:has(h3)");
            const churchName = $titleLink.find("h3").text().trim().replace(/\.$/, "");

            if (!churchName) continue;

            const churchData = {
                nombre: churchName,
                direccion: "",
                diocesis: "",
                telefono: "",
                fiesta_patronal: "",
                misas_hoy: "",
                estado: parseInt(estado),
                municipio_id: parseInt(municipio_id)
            };

            $row.find("p.search-results").each((j, p) => {
                const $p = $(p);
                const $strong = $p.find("strong");
                const label = $strong.text().trim();
                let value = $p.find("em").text().trim();
                if (!value && !label.includes("Teléfono")) {
                    value = $p.text().replace(label, "").trim();
                }

                if (label.includes("Dirección")) {
                    churchData.direccion = value;
                } else if (label.includes("Diosesis") || label.includes("Diócesis")) {
                    churchData.diocesis = value;
                } else if (label.includes("Teléfono")) {
                    churchData.telefono = $p.find("a").text().trim() || value;
                } else if (label.includes("Fiesta Patronal")) {
                    churchData.fiesta_patronal = value;
                } else if (label.includes("Misas Hoy")) {
                    churchData.misas_hoy = value;
                }
            });

            const normalize = (str) => str?.toLowerCase().trim().replace(/\.$/, "");
            churchData.nombre = normalize(churchData.nombre);
            churchData.direccion = normalize(churchData.direccion);

            const savedParroquia = await upsertParroquia(churchData);
            parishesFromScraping.push(savedParroquia);
        }
        return parishesFromScraping;
    } catch (error) {
        console.error("Scraping Error:", error.message);
        return [];
    }
};

// Ensure the scraped_municipios table exists when this module is first imported
// Then pre-load all already-scraped cities into memory so the lock
// works correctly even after server restarts (no per-request DB check needed).
// query(`
//     CREATE TABLE IF NOT EXISTS scraped_municipios (
//         estado INT NOT NULL,
//         municipio_id INT NOT NULL,
//         scraped_at TIMESTAMP DEFAULT NOW(),
//         PRIMARY KEY (estado, municipio_id)
//     );
// `)
//   .then(() => query('SELECT estado, municipio_id FROM scraped_municipios'))
//   .then(({ rows }) => {
//       rows.forEach(({ estado, municipio_id }) =>
//           scrapingInProgress.add(`${estado}-${municipio_id}`)
//       );
//       if (rows.length > 0)
//           console.log(`[Startup] ${rows.length} municipio(s) already fully scraped — loaded into memory.`);
//   })
//   .catch(err => console.error('[DB] scraped_municipios init error:', err.message));
export const initScrapedMunicipios = async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS scraped_municipios (
                estado INT NOT NULL,
                municipio_id INT NOT NULL,
                scraped_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (estado, municipio_id)
            );
        `);

        const { rows } = await query(
            'SELECT estado, municipio_id FROM scraped_municipios'
        );

        rows.forEach(({ estado, municipio_id }) =>
            scrapingInProgress.add(`${estado}-${municipio_id}`)
        );

        if (rows.length > 0) {
            console.log(`[Startup] ${rows.length} municipio(s) loaded`);
        }

    } catch (err) {
        console.error('[DB INIT ERROR]:', err.message);
    }
};
// In-memory Set: key = `${estado}-${municipio_id}`
// A key is added when a scrape STARTS and NEVER removed.
// Pre-populated from DB at startup so restarts don't re-trigger scrapes.
export const scrapingInProgress = new Set();

/**
 * Returns true if the municipio has been fully scraped and persisted in DB.
 */
export const isMunicipioFullyScraped = async (estado, municipio_id) => {
    try {
        const { rows } = await query(
            `SELECT 1 FROM scraped_municipios WHERE estado=$1 AND municipio_id=$2 LIMIT 1`,
            [estado, municipio_id]
        );
        return rows.length > 0;
    } catch {
        return false;
    }
};

/**
 * Fire-and-forget: scrape ALL pages for a given estado+municipio_id
 * and upsert every church into the DB. Stops when a page returns 0 results.
 * On success, writes a row to scraped_municipios so it never runs again.
 */
export const scrapeAllPagesBackground = (estado, municipio_id) => {
    const key = `${estado}-${municipio_id}`;
    if (scrapingInProgress.has(key)) return; // already running or done this session
    scrapingInProgress.add(key); // keep forever — prevents re-runs on same session

    (async () => {
        console.log(`[BG Scrape] Starting full scrape for estado=${estado}, municipio_id=${municipio_id}`);
        let page = 1;
        let totalSaved = 0;

        while (true) {
            try {
                const results = await scrapeParroquias(estado, municipio_id, page);
                if (!results || results.length === 0) {
                    console.log(`[BG Scrape] Page ${page}: empty — stopping.`);
                    break;
                }
                console.log(`[BG Scrape] Page ${page}: scraped ${results.length} churches.`);
                totalSaved += results.length;
                page++;
            } catch (err) {
                console.error(`[BG Scrape] Error on page ${page}:`, err.message);
                break;
            }
        }

        // Persist completion so it survives server restarts
        try {
            await query(
                `INSERT INTO scraped_municipios (estado, municipio_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [estado, municipio_id]
            );
        } catch (err) {
            console.error('[BG Scrape] Could not mark municipio as scraped:', err.message);
        }

        console.log(`[BG Scrape] Done — ${totalSaved} total churches saved for estado=${estado}, municipio_id=${municipio_id}.`);
    })();
};


/**
 * Insert or update a parroquia record in the DB.
 * Returns the saved row (with its DB `id`).
 */
export const upsertParroquia = async (churchData) => {
    const normalize = (str) =>
        str?.toLowerCase().trim().replace(/\.$/, "");

    churchData.nombre = normalize(churchData.nombre);
    churchData.direccion = normalize(churchData.direccion);

    const {
        nombre, direccion, lat, lng, municipio_id, estado,
        google_place_id, rating, photos,
        diocesis, telefono, fiesta_patronal, misas_hoy
    } = churchData;

    const sql = `
        INSERT INTO parroquias (
            nombre, direccion, lat, lng, municipio_id, estado,
            google_place_id, rating, photos,
            diocesis, telefono, fiesta_patronal, misas_hoy,
            enriched, enrichment_attempted, last_enrichment_attempt,
            last_updated
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
        ON CONFLICT ON CONSTRAINT parroquias_unique_nombre_direccion
        DO UPDATE SET
            lat = COALESCE(EXCLUDED.lat, parroquias.lat),
            lng = COALESCE(EXCLUDED.lng, parroquias.lng),
            google_place_id = COALESCE(EXCLUDED.google_place_id, parroquias.google_place_id),
            rating = COALESCE(EXCLUDED.rating, parroquias.rating),
            photos = COALESCE(EXCLUDED.photos, parroquias.photos),
            diocesis = COALESCE(EXCLUDED.diocesis, parroquias.diocesis),
            telefono = COALESCE(EXCLUDED.telefono, parroquias.telefono),
            fiesta_patronal = COALESCE(EXCLUDED.fiesta_patronal, parroquias.fiesta_patronal),
            misas_hoy = COALESCE(EXCLUDED.misas_hoy, parroquias.misas_hoy),
            enriched = COALESCE(EXCLUDED.enriched, parroquias.enriched),
            enrichment_attempted = COALESCE(EXCLUDED.enrichment_attempted, parroquias.enrichment_attempted),
            last_enrichment_attempt = COALESCE(EXCLUDED.last_enrichment_attempt, parroquias.last_enrichment_attempt),
            last_updated = NOW()
        RETURNING *;
    `;

    const values = [
        nombre,
        direccion,
        lat || null,
        lng || null,
        municipio_id,
        estado,
        google_place_id || null,
        rating || 0,
        photos ? JSON.stringify(photos) : null,
        diocesis || null,
        telefono || null,
        fiesta_patronal || null,
        misas_hoy || null,
        churchData.enriched || false,
        churchData.enrichment_attempted || false,
        churchData.last_enrichment_attempt || null
    ];

    try {
        const res = await query(sql, values);
        return res.rows[0];
    } catch (error) {
        console.error(`Error saving church "${nombre}":`, error.message);
        return churchData;
    }
};

/**
 * Get parroquias for a given estado + municipio_id, paginated.
 * Scrapes from dondehaymisa if not found in DB.
 * Background enrichment pulls photos from Google & uploads to R2.
 * @param {string} estado
 * @param {string|number} municipio_id
 * @param {number} page
 * @returns {Promise<Array>}
 */
export const getParroquias = async (estado, municipio_id, page = 1, lat = null, lng = null) => {
    const limit = 5;
    const offset = (page - 1) * limit;

    // If the city is fully scraped AND we have the user's location,
    // serve ALL churches from DB sorted by proximity (nearest first)
    const fullyScraped = await isMunicipioFullyScraped(estado, municipio_id);
    if (fullyScraped && lat !== null && lng !== null) {
        const { rows } = await query(
            `SELECT * FROM parroquias
             WHERE estado = $1 AND municipio_id = $2
             ORDER BY
               CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
                 THEN SQRT(POWER(lat::float - $3, 2) + POWER(lng::float - $4, 2))
                 ELSE 9999
               END ASC,
               id ASC
             LIMIT $5 OFFSET $6`,
            [estado, municipio_id, parseFloat(lat), parseFloat(lng), limit, offset]
        );

        const totalRes = await query(
            `SELECT COUNT(*) FROM parroquias WHERE estado = $1 AND municipio_id = $2`,
            [estado, municipio_id]
        );
        const total = parseInt(totalRes.rows[0].count);

        return { data: rows, total };
    }

    // Fallback: default paged query (city not yet fully scraped)
    const cachedData = await query(
        `SELECT * FROM parroquias
         WHERE estado = $1 AND municipio_id = $2
         ORDER BY id
         LIMIT $3 OFFSET $4`,
        [estado, municipio_id, limit, offset]
    );

    const totalCachedRes = await query(
        `SELECT COUNT(*) FROM parroquias WHERE estado = $1 AND municipio_id = $2`,
        [estado, municipio_id]
    );
    const totalCached = parseInt(totalCachedRes.rows[0].count);

    let parishes = cachedData.rows;

    // Not in DB at all? Scrape page on demand
    if (parishes.length === 0) {
        parishes = await scrapeParroquias(estado, municipio_id, page);
        // If we just scraped, total might still be just this page or we can't easily know total from just scraping 1 page without a full scrape.
        // But scrapingInProgress logic eventually fills it.
    }

    // Background enrichment for missing details (Photos from R2, Place ID, Coords)
    await query('BEGIN');

    const { rows: needsEnrichment } = await query(`
      SELECT * FROM parroquias
      WHERE estado = $1 AND municipio_id = $2
      AND enriched = false
      AND enrichment_attempted = false
      AND (
        last_enrichment_attempt IS NULL 
        OR last_enrichment_attempt < NOW() - INTERVAL '1 day'
      )
      LIMIT 5
      FOR UPDATE SKIP LOCKED
    `, [estado, municipio_id]);

    await query('COMMIT');

    if (needsEnrichment.length > 0) {
        const enrichmentPromises = needsEnrichment.map(church =>
            enrichmentLimit(async () => {
                try {
                    // 1. mark BEFORE Google call
                    await query(`
                      UPDATE parroquias
                      SET 
                        enrichment_attempted = true,
                        last_enrichment_attempt = NOW()
                      WHERE id = $1
                    `, [church.id]);

                    // 2. call Google + R2 upload internally
                    const googleInfo = await searchChurchOnGoogle(
                        church.nombre,
                        church.direccion
                    );

                    if (googleInfo) {
                        // 3. update data
                        church.lat = googleInfo.lat || church.lat;
                        church.lng = googleInfo.lng || church.lng;
                        church.google_place_id = googleInfo.place_id;
                        church.rating = googleInfo.rating;
                        church.photos = googleInfo.photos;
                        church.enriched = true;

                        // 4. SAVE
                        await upsertParroquia(church);
                    }
                } catch (err) {
                    console.error(`Error enriching church ${church.nombre}:`, err.message);
                }
            })
        );

        Promise.all(enrichmentPromises).catch(err =>
            console.error("Enrichment batch error:", err)
        );
    }

    return { data: parishes, total: totalCached || parishes.length };
};