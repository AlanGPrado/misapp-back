import "dotenv/config";
import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
    res.send('OK');
});

app.get("/municipios", async (req, res) => {
    const { estado } = req.query;

    if (!estado) {
        return res.status(400).json({
            error: "estado es requerido"
        });
    }

    try {
        const url = `https://dondehaymisa.com/listaMunicipiosSearch/${estado}`;
        const { data } = await axios.get(url);
        res.json(data);
    } catch (error) {
        res.status(500).json({
            error: "error obteniendo municipios"
        });
    }
});

app.get("/misas", async (req, res) => {
    const { estado, municipio_id, page = 1 } = req.query;

    if (!estado || !municipio_id) {
        return res.status(400).json({
            error: "estado y municipio_id son requeridos"
        });
    }

    try {
        const url = `https://dondehaymisa.com/busqueda?diocese=&nombre=&estado=${estado}&municipio_id=${municipio_id}&tipo=&dia=&hora=&tipo_servicio=&formType=basic&page=${page}#parishResults`;

        const { data: html } = await axios.get(url);
        const $ = cheerio.load(html);
        const parroquias = [];

        $(".row[style*='margin-bottom:3%']").each((i, row) => {
            const $row = $(row);
            const $titleLink = $row.find("a:has(h3)");
            const churchName = $titleLink.find("h3").text().trim().replace(/\.$/, "");

            if (!churchName) return;

            let link = $titleLink.attr("href") || "";
            if (link && !link.startsWith("http")) {
                link = "https://dondehaymisa.com" + link;
            }

            const churchData = {
                nombre: churchName,
                diocesis: "",
                direccion: "",
                telefono: "",
                fiesta_patronal: "",
                misas_hoy: "",
                link: link
            };

            $row.find("p.search-results").each((j, p) => {
                const $p = $(p);
                const $strong = $p.find("strong");
                const label = $strong.text().trim();

                // The value is usually in <em> or just after <strong>
                let value = $p.find("em").text().trim();
                if (!value && !label.includes("Teléfono")) {
                    value = $p.text().replace(label, "").trim();
                }

                if (label.includes("Diosesis") || label.includes("Diócesis")) {
                    churchData.diocesis = value;
                } else if (label.includes("Dirección")) {
                    churchData.direccion = value;
                } else if (label.includes("Teléfono")) {
                    churchData.telefono = $p.find("a").text().trim() || value;
                } else if (label.includes("Fiesta Patronal")) {
                    churchData.fiesta_patronal = value;
                } else if (label.includes("Misas Hoy")) {
                    churchData.misas_hoy = value;
                }
            });

            parroquias.push(churchData);
        });

        const parishes = parroquias.map((church) => {
            return {
                ...church,
            };
        });
        res.json(parishes);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "error obteniendo parroquias"
        });
    }
});

// ─── Saints Cache (in-memory TTL) ────────────────────────────────────────────
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

const TTL_MONTH = 6 * 60 * 60 * 1000; // 6 h  – month index rarely changes
const TTL_DAY = 24 * 60 * 60 * 1000; // 24 h – daily page never changes mid-day

// ─── GET /santos?month=3 ──────────────────────────────────────────────────────
// Returns sorted list of days available in the given month
app.get("/santos", async (req, res) => {
    const month = parseInt(req.query.month || new Date().getMonth() + 1, 10);

    if (isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "month debe ser un número entre 1 y 12" });
    }

    const mm = String(month).padStart(2, "0");
    const cacheKey = `saints-month-${mm}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    try {
        const url = `https://www.vaticannews.va/es/santos.month.${month}.js`;
        const { data } = await axios.get(url, { timeout: 8000 });

        const prefix = `_${mm}/`;
        const days = Object.entries(data)
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, val]) => {
                const day = key.slice(prefix.length); // e.g. "19"
                return {
                    day: parseInt(day, 10),
                    date: val.date,
                    url: `https://www.vaticannews.va/es/santos/${mm}/${day}.html`,
                };
            })
            .sort((a, b) => a.day - b.day);

        const result = { month, totalDays: days.length, days };
        setCache(cacheKey, result, TTL_MONTH);
        res.json(result);
    } catch (error) {
        console.error("Error obteniendo índice de santos:", error.message);
        res.status(500).json({ error: "Error obteniendo santoral del mes" });
    }
});

// ─── GET /santos/:month/:day ──────────────────────────────────────────────────
// Scrapes Vatican News and returns the saint of the day with name, description, image
app.get("/santos/:month/:day", async (req, res) => {
    const month = parseInt(req.params.month, 10);
    const day = parseInt(req.params.day, 10);

    if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        return res.status(400).json({ error: "Parámetros de mes o día inválidos" });
    }

    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const cacheKey = `santos-${mm}-${dd}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    try {
        const pageUrl = `https://www.vaticannews.va/es/santos/${mm}/${dd}.html`;
        const { data: html } = await axios.get(pageUrl, { timeout: 8000 });
        const $ = cheerio.load(html);

        // section--evidence.section--isStatic is the main saint-of-the-day block
        // (section--evidence without isStatic is the generic intro)
        const $evidence = $("section.section--evidence.section--isStatic");
        const nombre = $evidence.find(".section__head h2").text().trim();

        // Description: p in the section__content of section--isStatic (the evidence section)
        const descripcion = $evidence.find(".section__content p").first().text().trim();

        // Full article link: a.saintReadMore (relative path → absolute)
        let articuloHref = $evidence.find("a.saintReadMore").attr("href") || "";
        if (articuloHref && !articuloHref.startsWith("http")) {
            articuloHref = "https://www.vaticannews.va" + articuloHref;
        }
        const articuloUrl = articuloHref || pageUrl;

        // Image: lazy-load; real path is in data-original attribute — use $evidence to scope correctly
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
            nombre: nombre || null,
            descripcion: descripcion || null,
            imagen: imagen || null,
            articuloUrl,
            pageUrl,
        };

        setCache(cacheKey, result, TTL_DAY);
        res.json(result);
    } catch (error) {
        console.error(`Error obteniendo santo ${mm}/${dd}:`, error.message);
        res.status(500).json({ error: "Error obteniendo información del santo" });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});