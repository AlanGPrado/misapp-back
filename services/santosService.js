import { query } from "../db/index.js";

// Saints Cache (in-memory TTL)
const cache = new Map();

function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function setCache(key, value, ttlMs) {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

const TTL_MONTH = 6 * 60 * 60 * 1000;
// const TTL_DAY = 24 * 60 * 60 * 1000;
const TTL_DAY = 0;

export const getSantosMonth = async (month) => {
    const mm = String(month).padStart(2, "0");
    const cacheKey = `saints-month-${mm}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://www.vaticannews.va/es/santos.month.${month}.js`;
        const { data } = await axios.get(url, { timeout: 8000 });

        const prefix = `_${mm}/`;
        const days = Object.entries(data)
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, val]) => {
                const day = key.slice(prefix.length);
                return {
                    day: parseInt(day, 10),
                    date: val.date,
                    url: `https://www.vaticannews.va/es/santos/${mm}/${day}.html`,
                };
            })
            .sort((a, b) => a.day - b.day);

        const result = { month, totalDays: days.length, days };
        setCache(cacheKey, result, TTL_MONTH);
        return result;
    } catch (error) {
        console.error("Saints Service Month Index Error:", error.message);
        throw new Error("Unable to fetch saint index for month.");
    }
}

export const getSantoDay = async (month, day) => {
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");

    const cacheKey = `santos-${mm}-${dd}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    try {
        console.log("🔥 FROM DB");

        const { rows } = await query(
            `SELECT * FROM saints WHERE month = $1 AND day = $2 LIMIT 1`,
            [month, day]
        );

        if (rows.length === 0) {
            throw new Error("No santo en DB");
        }

        const row = rows[0];

        const result = {
            month: row.month,
            day: row.day,
            fecha: row.fecha,
            santos: typeof row.santos === "string"
                ? JSON.parse(row.santos)
                : row.santos,
            imagen: row.imagen,
            articuloUrl: row.articulo_url,
        };

        setCache(cacheKey, result, TTL_DAY);
        return result;

    } catch (error) {
        console.error("DB Saints Error:", error.message);
        throw new Error("Unable to fetch saint of the day.");
    }
};
