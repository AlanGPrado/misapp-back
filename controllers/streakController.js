import { query } from '../db/index.js';

export const getStreaks = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await query(
            'SELECT checkin_date FROM user_checkins WHERE user_id = $1 ORDER BY checkin_date DESC',
            [userId]
        );
        const dates = result.rows.map(row => {
            const d = new Date(row.checkin_date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        });
        res.json({ checkins: dates });
    } catch (err) {
        console.error("❌ Error fetching streaks:", err.message);
        res.status(500).json({ error: "Error fetching streaks" });
    }
};

export const addCheckin = async (req, res) => {
    try {
        const userId = req.user.id;
        const { date } = req.body;
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: "Invalid date format, use YYYY-MM-DD" });
        }

        await query(
            'INSERT INTO user_checkins (user_id, checkin_date) VALUES ($1, $2) ON CONFLICT (user_id, checkin_date) DO NOTHING',
            [userId, date]
        );
        res.json({ message: "Check-in added successfully" });
    } catch (err) {
        console.error("❌ Error adding checkin:", err.message);
        res.status(500).json({ error: "Error adding checkin" });
    }
};
