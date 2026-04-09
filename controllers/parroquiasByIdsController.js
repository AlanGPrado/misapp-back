import { query } from "../db/index.js";

export const getParroquiasByIdsController = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: "ids requeridos" });
        }

        // 🔥 separar ids numéricos vs place_ids
        const numericIds = ids.filter(id => !isNaN(id)).map(Number);
        const placeIds = ids.filter(id => isNaN(id));

        let results = [];

        // ✅ buscar por id (int)
        if (numericIds.length > 0) {
            const resultById = await query(
                `SELECT * FROM parroquias WHERE id = ANY($1::int[])`,
                [numericIds]
            );
            results.push(...resultById.rows);
        }

        // ✅ buscar por google_place_id (text)
        if (placeIds.length > 0) {
            const resultByPlace = await query(
                `SELECT * FROM parroquias WHERE google_place_id = ANY($1::text[])`,
                [placeIds]
            );
            results.push(...resultByPlace.rows);
        }

        const mappedResults = results.map(item => ({
            ...item,
            imagen: item.photos?.[0] || null
        }));

        res.json(mappedResults);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno" });
    }
};