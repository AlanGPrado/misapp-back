import { query } from "../db/index.js";

/**
 * Fetch parroquias within geographical bounds
 * Query params: minLat, maxLat, minLng, maxLng, limit
 */
export const getParroquiasByBoundsController = async (req, res) => {
    try {
        const { minLat, maxLat, minLng, maxLng, limit = 100 } = req.query;

        if (!minLat || !maxLat || !minLng || !maxLng) {
            return res.status(400).json({ error: "Missing required bounds parameters" });
        }

        const minL = parseFloat(minLat);
        const maxL = parseFloat(maxLat);
        const minG = parseFloat(minLng);
        const maxG = parseFloat(maxLng);
        const lim = parseInt(limit, 10);

        if (isNaN(minL) || isNaN(maxL) || isNaN(minG) || isNaN(maxG)) {
            return res.status(400).json({ error: "Invalid bounds parameters" });
        }

        const sql = `
            SELECT id, nombre, direccion, lat, lng, google_place_id, rating, imagen, photos, diocesis, telefono, fiesta_patronal, horario
            FROM parroquias
            WHERE lat >= $1 AND lat <= $2 AND lng >= $3 AND lng <= $4
            LIMIT $5
        `;
        const result = await query(sql, [minL, maxL, minG, maxG, lim]);
        res.json(result.rows);
    } catch (error) {
        console.error("Bounds Query Error:", error);
        res.status(500).json({ error: "Error al consultar parroquias por coordenadas" });
    }
};
