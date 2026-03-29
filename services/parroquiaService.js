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
        ON CONFLICT (nombre, direccion)
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
export const getParroquias = async (estado, municipio_id, page = 1) => {
    console.log(`[getParroquias] Start: estado=${estado}, municipio=${municipio_id}, page=${page}`);
    const limit = 5;
    const offset = (page - 1) * limit;

    console.log(`[getParroquias] Querying cache...`);
    const cachedData = await query(
        `SELECT * FROM parroquias
         WHERE estado = $1 AND municipio_id = $2
         ORDER BY id
         LIMIT $3 OFFSET $4`,
        [estado, municipio_id, limit, offset]
    );

    let parishes = cachedData.rows.map(p => ({
        ...p,
        photos: typeof p.photos === 'string' ? JSON.parse(p.photos) : p.photos
    }));

    console.log(`[getParroquias] Found ${parishes.length} parishes in cache`);

    // Not in DB? Scrape and save
    if (parishes.length === 0) {
        console.log(`[getParroquias] No parishes in cache, starting scrape for estado=${estado}, municipio=${municipio_id}, page=${page}`);
        parishes = await scrapeParroquias(estado, municipio_id, page);
        console.log(`[getParroquias] Scraped ${parishes.length} parishes`);
    }
    
    console.log(`[getParroquias] Checking enrichment needs...`);
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
    console.log(`[getParroquias] Parishes needing enrichment: ${needsEnrichment.length}`);

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

    return parishes;
};