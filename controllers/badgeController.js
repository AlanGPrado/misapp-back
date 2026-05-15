import pool from '../db/index.js';

// Get badges for the current user
export const getBadges = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Ensure every user has 'seguidor' badge initially
        await pool.query(`
            INSERT INTO user_badges (user_id, badge_id) 
            VALUES ($1, $2) 
            ON CONFLICT DO NOTHING
        `, [userId, 'seguidor']);

        const result = await pool.query(
            'SELECT badge_id FROM user_badges WHERE user_id = $1',
            [userId]
        );
        res.json({ badges: result.rows.map(row => row.badge_id) });
    } catch (err) {
        console.error('Error in getBadges:', err);
        res.status(500).json({ error: 'Failed to fetch badges' });
    }
};

// Unlock a specific badge
export const unlockBadge = async (req, res) => {
    try {
        const userId = req.user.id;
        const { badgeId } = req.body;

        if (!badgeId) {
            return res.status(400).json({ error: 'Badge ID is required' });
        }

        await pool.query(`
            INSERT INTO user_badges (user_id, badge_id) 
            VALUES ($1, $2) 
            ON CONFLICT DO NOTHING
        `, [userId, badgeId]);

        res.json({ message: 'Badge unlocked successfully' });
    } catch (err) {
        console.error('Error in unlockBadge:', err);
        res.status(500).json({ error: 'Failed to unlock badge' });
    }
};
