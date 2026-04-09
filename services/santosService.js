import axios from "axios";
import * as cheerio from "cheerio";

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
const TTL_DAY = 24 * 60 * 60 * 1000;

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
        const pageUrl = `https://www.vaticannews.va/es/santos/${mm}/${dd}.html`;
        const { data: html } = await axios.get(pageUrl, { timeout: 8000 });
        const $ = cheerio.load(html);

        const $evidence = $("section.section--evidence.section--isStatic");
        // const nombre = $evidence.find(".section__head h2").text().trim();
        // const descripcion = $evidence.find(".section__content p").first().text().trim();

        const rawNombre = $evidence.find(".section__head h2").text().trim();

        const nombres = rawNombre
            .split("\n")
            .map(n => n.trim())
            .filter(Boolean);

        const descripciones = $evidence
            .find(".section__content p")
            .map((i, el) => $(el).text().trim())
            .get();

        const santos = nombres.map((nombre, index) => ({
            nombre,
            descripcion: descripciones[index] || null
        }));

        let articuloHref = $evidence.find("a.saintReadMore").attr("href") || "";
        if (articuloHref && !articuloHref.startsWith("http")) {
            articuloHref = "https://www.vaticannews.va" + articuloHref;
        }
        const articuloUrl = articuloHref || pageUrl;

        let imagen = null;
        const thumbnailDataOriginal = $evidence.find("img[data-original]").attr("data-original");
        if (thumbnailDataOriginal) {
            imagen = thumbnailDataOriginal.startsWith("http")
                ? thumbnailDataOriginal
                : "https://www.vaticannews.va" + thumbnailDataOriginal;
        }

        const result = {
            month,
            day,
            fecha: `${dd}/${mm}`,
            santos,
            imagen: imagen || null,
            articuloUrl,
            pageUrl,
        };
        setCache(cacheKey, result, TTL_DAY);
        return result;
    } catch (error) {
        console.error(`Saints Service Day Error for ${mm}/${dd}:`, error.message);
        throw new Error("Unable to fetch saint of the day.");
    }
}
