import pool from '../db/index.js';

// Helper to calculate Palm Sunday (7 days before Easter) in timezone-independent UTC string YYYY-MM-DD
export const getPalmSundayDateString = (year) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    // Easter Sunday in UTC
    const easter = new Date(Date.UTC(year, month - 1, day));

    // Palm Sunday is 7 days before Easter Sunday
    const palm = new Date(easter.getTime() - 7 * 24 * 60 * 60 * 1000);

    const yStr = palm.getUTCFullYear();
    const mStr = String(palm.getUTCMonth() + 1).padStart(2, '0');
    const dStr = String(palm.getUTCDate()).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
};

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

        // Check 'estrella' badge: 5 or more unique check-ins in total (formerly devoto)
        if (uniqueDates.length >= 5) {
            badgesToUnlock.push('estrella');
        }

        // Check 'devoto' badge: 5 or more favorited churches
        const favoritesResult = await pool.query(
            "SELECT COUNT(*) as fav_count FROM favorites WHERE user_id = $1",
            [userId]
        );
        const favCount = parseInt(favoritesResult.rows[0].fav_count, 10) || 0;
        if (favCount >= 5) {
            badgesToUnlock.push('devoto');
        }

        // Check 'palma' badge: check-in on Palm Sunday for any of the years the user has check-ins
        const uniqueYears = Array.from(new Set(uniqueDates.map(dateStr => dateStr.split('-')[0])));
        let hasPalmSundayCheckin = false;
        for (const yearStr of uniqueYears) {
            const year = parseInt(yearStr, 10);
            if (!isNaN(year)) {
                const palmSundayDate = getPalmSundayDateString(year);
                if (uniqueDates.includes(palmSundayDate)) {
                    hasPalmSundayCheckin = true;
                    break;
                }
            }
        }

        if (hasPalmSundayCheckin) {
            badgesToUnlock.push('palma');
        }

        // Check 'colaborador' badge: user is premium
        const userPremiumResult = await pool.query(
            "SELECT is_premium FROM users WHERE id = $1",
            [userId]
        );
        if (userPremiumResult.rows.length > 0 && userPremiumResult.rows[0].is_premium) {
            badgesToUnlock.push('colaborador');
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

// Unlock one or more specific badges
export const unlockBadge = async (req, res) => {
    try {
        const userId = req.user.id;
        const { badgeId, badgeIds } = req.body;

        const idsToUnlock = [];
        if (badgeId) {
            idsToUnlock.push(badgeId);
        }
        if (Array.isArray(badgeIds)) {
            idsToUnlock.push(...badgeIds);
        }

        if (idsToUnlock.length === 0) {
            return res.status(400).json({ error: 'Badge ID or badgeIds array is required' });
        }

        // Insert all specified badges using ON CONFLICT DO NOTHING
        for (const id of idsToUnlock) {
            await pool.query(`
                INSERT INTO user_badges (user_id, badge_id) 
                VALUES ($1, $2) 
                ON CONFLICT DO NOTHING
            `, [userId, id]);
        }

        res.json({ message: 'Badges unlocked successfully' });
    } catch (err) {
        console.error('Error in unlockBadge:', err);
        res.status(500).json({ error: 'Failed to unlock badges' });
    }
};
