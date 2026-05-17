import pool from '../db/index.js';

// Dynamically check and unlock badges based on check-ins
export const checkAndUnlockBadges = async (userId) => {
    try {
        const checkinsResult = await pool.query(
            "SELECT TO_CHAR(checkin_date, 'YYYY-MM-DD') as formatted_date FROM user_checkins WHERE user_id = $1",
            [userId]
        );
        
        const uniqueDates = Array.from(new Set(checkinsResult.rows.map(row => row.formatted_date)));
        
        const monthDays = uniqueDates.map(dateStr => {
            const parts = dateStr.split('-');
            return `${parts[1]}-${parts[2]}`;
        });

        const badgesToUnlock = [];

        // Check 'arbol' badge: check-in on December 25 (Christmas)
        if (monthDays.includes('12-25')) {
            badgesToUnlock.push('arbol');
        }

        // Check 'calendario' badge: check-in on January 1 (New Year)
        if (monthDays.includes('01-01')) {
            badgesToUnlock.push('calendario');
        }

        // Check 'devoto' badge: 5 or more unique check-ins in total
        if (uniqueDates.length >= 5) {
            badgesToUnlock.push('devoto');
        }

        // Insert unlocked badges into user_badges
        for (const badgeId of badgesToUnlock) {
            await pool.query(`
                INSERT INTO user_badges (user_id, badge_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
            `, [userId, badgeId]);
        }
    } catch (err) {
        console.error('Error in checkAndUnlockBadges:', err);
    }
};

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

        // Dynamically check and unlock check-in related badges
        await checkAndUnlockBadges(userId);

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
