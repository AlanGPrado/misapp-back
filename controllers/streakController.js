import { query } from '../db/index.js';
import { checkAndUnlockBadges } from './badgeController.js';

export const getStreaks = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await query(
            "SELECT TO_CHAR(checkin_date, 'YYYY-MM-DD') as formatted_date, church_id, created_at FROM user_checkins WHERE user_id = $1 ORDER BY checkin_date DESC",
            [userId]
        );
        const dates = result.rows.map(row => row.formatted_date);
        const details = result.rows.map(row => ({
            date: row.formatted_date,
            churchId: row.church_id,
            createdAt: row.created_at
        }));
        res.json({ 
            checkins: dates,
            detailedCheckins: details
        });
    } catch (err) {
        console.error("❌ Error fetching streaks:", err.message);
        res.status(500).json({ error: "Error fetching streaks" });
    }
};

export const addCheckin = async (req, res) => {
    try {
        const userId = req.user.id;
        const { date, churchId } = req.body;
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: "Invalid date format, use YYYY-MM-DD" });
        }

        await query(
            'INSERT INTO user_checkins (user_id, checkin_date, church_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, checkin_date, church_id) DO NOTHING',
            [userId, date, churchId || null]
        );

        // Run dynamic badge check
        await checkAndUnlockBadges(userId);

        res.json({ message: "Check-in added successfully" });
    } catch (err) {
        console.error("❌ Error adding checkin:", err.message);
        res.status(500).json({ error: "Error adding checkin" });
    }
};
