import { getParroquias, scrapeAllPagesBackground, scrapingInProgress } from "../services/parroquiaService.js";

/**
 * Handle GET /misas Request
 * - Receives query params (estado, municipio_id, page, lat, lng)
 * - Returns churches sorted by distance when city is fully scraped
 * - Triggers a one-time background full-scrape on first visit to a municipio
 */
export const getParroquiasController = async (req, res) => {
    const { estado, municipio_id, page = 1, lat = null, lng = null } = req.query;

    if (!estado || !municipio_id) {
        return res.status(400).json({
            error: "Los campos 'estado' y 'municipio_id' son requeridos."
        });
    }

    try {
        const { data, total } = await getParroquias(estado, municipio_id, page, lat, lng);

        const mappedParishes = data.map(p => ({
            ...p,
            imagen: p.photos && p.photos.length > 0 ? p.photos[0] : null
        }));

        res.json({
            data: mappedParishes,
            total: total
        });

        // scrapingInProgress is pre-populated from DB at startup, so this check is
        // race-condition-free (synchronous Set lookup, no await).
        // A key being present means: already scraped OR currently scraping.
        const key = `${estado}-${municipio_id}`;
        if (!scrapingInProgress.has(key)) {
            scrapeAllPagesBackground(estado, municipio_id);
        }
    } catch (error) {
        console.error("Controller Error:", error.message);
        res.status(500).json({
            error: "Error interno al procesar la solicitud de parroquias."
        });
    }
};
