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

        // Batch query all approved user-uploaded photos for these parishes
        const placeIdsToFetch = mappedResults.map(item => item.google_place_id).filter(Boolean);
        if (placeIdsToFetch.length > 0) {
            const customPhotos = await query(
                `SELECT id, google_place_id, url, TRUE as is_custom 
                 FROM church_photos 
                 WHERE google_place_id = ANY($1::text[]) AND status = 'approved'
                 ORDER BY created_at DESC`,
                [placeIdsToFetch]
            );

            // Group custom photos by place ID
            const photosMap = {};
            customPhotos.rows.forEach(row => {
                if (!photosMap[row.google_place_id]) {
                    photosMap[row.google_place_id] = [];
                }
                photosMap[row.google_place_id].push({
                    id: row.id,
                    url: row.url,
                    isCustom: true
                });
            });

            // Merge static and custom photos for each parish
            mappedResults.forEach(item => {
                const placeId = item.google_place_id;
                const staticPhotos = Array.isArray(item.photos) ? item.photos : [];
                const customForParish = photosMap[placeId] || [];
                item.photos = [...staticPhotos, ...customForParish];
                
                // Fallback to first photo (can be static or custom) for cover
                if (item.photos.length > 0) {
                    const firstPhoto = item.photos[0];
                    item.imagen = typeof firstPhoto === 'object' ? firstPhoto.url : firstPhoto;
                }
            });
        }

        res.json(mappedResults);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno" });
    }
};