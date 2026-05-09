import { query } from '../db/index.js';

// ─── Get User Favorites ──────────────────────────────────────────────────────

export const getFavorites = async (req, res) => {
    const userId = req.user.id;

    try {
        const result = await query(
            'SELECT google_place_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        
        const favoriteIds = result.rows.map(row => row.google_place_id);
        return res.status(200).json(favoriteIds);
    } catch (err) {
        console.error('❌ Get Favorites error:', err.message);
        return res.status(500).json({ error: 'Error al obtener favoritos.' });
    }
};

// ─── Toggle Favorite ─────────────────────────────────────────────────────────

export const toggleFavorite = async (req, res) => {
    const userId = req.user.id;
    const { googlePlaceId } = req.body;

    if (!googlePlaceId) {
        return res.status(400).json({ error: 'googlePlaceId es requerido.' });
    }

    try {
        // Check if it exists
        const existsResult = await query(
            'SELECT 1 FROM favorites WHERE user_id = $1 AND google_place_id = $2',
            [userId, googlePlaceId]
        );

        if (existsResult.rows.length > 0) {
            // Remove it
            await query(
                'DELETE FROM favorites WHERE user_id = $1 AND google_place_id = $2',
                [userId, googlePlaceId]
            );
            return res.status(200).json({ status: 'removed', googlePlaceId });
        } else {
            // Add it
            await query(
                'INSERT INTO favorites (user_id, google_place_id) VALUES ($1, $2)',
                [userId, googlePlaceId]
            );
            return res.status(200).json({ status: 'added', googlePlaceId });
        }
    } catch (err) {
        console.error('❌ Toggle Favorite error:', err.message);
        return res.status(500).json({ error: 'Error al actualizar favorito.' });
    }
};

// ─── Sync Favorites (Batch) ──────────────────────────────────────────────────

export const syncFavorites = async (req, res) => {
    const userId = req.user.id;
    const { googlePlaceIds } = req.body; 

    if (!googlePlaceIds || !Array.isArray(googlePlaceIds)) {
        return res.status(400).json({ error: 'Lista de IDs es requerida.' });
    }

    try {
        for (const gpid of googlePlaceIds) {
            if (typeof gpid !== 'string') continue;
            await query(
                'INSERT INTO favorites (user_id, google_place_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [userId, gpid]
            );
        }

        const result = await query(
            'SELECT google_place_id FROM favorites WHERE user_id = $1',
            [userId]
        );
        const finalIds = result.rows.map(row => row.google_place_id);

        return res.status(200).json(finalIds);
    } catch (err) {
        console.error('❌ Sync Favorites error:', err.message);
        return res.status(500).json({ error: 'Error al sincronizar favoritos.' });
    }
};
