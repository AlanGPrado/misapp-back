import { query } from "../db/index.js";
import { getParroquias } from "../services/parroquiaService.js";

// EXISTENTE
export const getParroquiasController = async (req, res) => {
    try {
        const { estado, municipio_id, page } = req.query;

        const data = await getParroquias(estado, municipio_id, page);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno" });
    }
};

// 🔹 NUEVO: por ID interno
export const getParroquiaByIdController = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT * FROM parroquias WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Parroquia no encontrada" });
        }

        const parish = result.rows[0];
        if (parish.google_place_id) {
            const customPhotos = await query(
                `SELECT id, url, TRUE as is_custom 
                 FROM church_photos 
                 WHERE google_place_id = $1 AND status = 'approved'
                 ORDER BY created_at DESC`,
                [parish.google_place_id]
            );
            const staticPhotos = Array.isArray(parish.photos) ? parish.photos : [];
            const customMapped = customPhotos.rows.map(row => ({
                id: row.id,
                url: row.url,
                isCustom: true
            }));
            parish.photos = [...staticPhotos, ...customMapped];

            if (parish.photos.length > 0) {
                const firstPhoto = parish.photos[0];
                parish.imagen = typeof firstPhoto === 'object' ? firstPhoto.url : firstPhoto;
            }
        }

        res.json(parish);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno" });
    }
};

// 🔹 NUEVO: por Google Place ID
export const getParroquiaByPlaceIdController = async (req, res) => {
    try {
        const { place_id } = req.params;

        const result = await query(
            `SELECT * FROM parroquias WHERE google_place_id = $1`,
            [place_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Parroquia no encontrada" });
        }

        const parish = result.rows[0];
        const customPhotos = await query(
            `SELECT id, url, TRUE as is_custom 
             FROM church_photos 
             WHERE google_place_id = $1 AND status = 'approved'
             ORDER BY created_at DESC`,
            [place_id]
        );
        const staticPhotos = Array.isArray(parish.photos) ? parish.photos : [];
        const customMapped = customPhotos.rows.map(row => ({
            id: row.id,
            url: row.url,
            isCustom: true
        }));
        parish.photos = [...staticPhotos, ...customMapped];

        if (parish.photos.length > 0) {
            const firstPhoto = parish.photos[0];
            parish.imagen = typeof firstPhoto === 'object' ? firstPhoto.url : firstPhoto;
        }

        res.json(parish);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno" });
    }
};