import { getParroquias } from "../services/parroquiaService.js";

/**
 * Handle GET /misas Request
 * - Receives query params (estado, municipio_id, page)
 * - Returns the list of parroquias (from DB or scraping)
 * @param {express.Request} req 
 * @param {express.Response} res 
 */
export const getParroquiasController = async (req, res) => {
    const { estado, municipio_id, page = 1 } = req.query;

    if (!estado || !municipio_id) {
        return res.status(400).json({
            error: "Los campos 'estado' y 'municipio_id' son requeridos."
        });
    }

    try {
        const parishes = await getParroquias(estado, municipio_id, page);

        // Map database fields to frontend expected fields
        const mappedParishes = parishes.map(p => {
            const photos = Array.isArray(p.photos) ? p.photos : [];
            return {
                ...p,
                imagen: photos.length > 0 ? photos[0] : null
            };
        });

        res.json(mappedParishes);
    } catch (error) {
        console.error("[getParroquiasController] Error:", error);
        res.status(500).json({
            error: "Error interno al procesar la solicitud de parroquias.",
            details: error.message
        });
    }
};
