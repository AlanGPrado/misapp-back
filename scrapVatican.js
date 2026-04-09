import axios from "axios";
import * as cheerio from "cheerio";
import pkg from "pg";

const { Pool } = pkg;

// 🔐 Neon connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// delay helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getDayData = async (month, day) => {
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");

    const pageUrl = `https://www.vaticannews.va/es/santos/${mm}/${dd}.html`;

    try {
        const { data: html } = await axios.get(pageUrl);
        const $ = cheerio.load(html);

        const $evidence = $("section.section--evidence.section--isStatic");

        // nombres
        const rawNombre = $evidence.find(".section__head h2").text().trim();

        const nombres = rawNombre
            .split("\n")
            .map(n => n.trim())
            .filter(Boolean);

        // descripciones
        const descripciones = $evidence
            .find(".section__content p")
            .map((i, el) => $(el).text().trim())
            .get();

        const santos = nombres.map((nombre, index) => ({
            nombre,
            descripcion: descripciones[index] || null
        }));

        // imagen
        let imagen = null;
        const img = $evidence.find("img[data-original]").attr("data-original");
        if (img) {
            imagen = img.startsWith("http")
                ? img
                : "https://www.vaticannews.va" + img;
        }

        // articulo
        let articuloHref = $evidence.find("a.saintReadMore").attr("href") || "";
        if (articuloHref && !articuloHref.startsWith("http")) {
            articuloHref = "https://www.vaticannews.va" + articuloHref;
        }

        return {
            month,
            day,
            fecha: `${dd}/${mm}`,
            santos,
            imagen,
            articulo_url: articuloHref || pageUrl,
        };

    } catch (err) {
        console.log(`❌ Error ${mm}/${dd}`);
        return null;
    }
};

const saveToDB = async (data) => {
    await pool.query(
        `
        INSERT INTO saints (month, day, fecha, santos, imagen, articulo_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (month, day)
        DO UPDATE SET
            santos = EXCLUDED.santos,
            imagen = EXCLUDED.imagen,
            articulo_url = EXCLUDED.articulo_url;
        `,
        [
            data.month,
            data.day,
            data.fecha,
            JSON.stringify(data.santos),
            data.imagen,
            data.articulo_url,
        ]
    );
};

const run = async () => {
    for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 31; day++) {
            const data = await getDayData(month, day);

            if (data && data.santos.length > 0) {
                await saveToDB(data);
                console.log(`✅ Saved ${month}/${day}`);
            } else {
                console.log(`⚠️ Skip ${month}/${day}`);
            }

            await sleep(500); // evitar bloqueo
        }
    }

    console.log("🎉 Done!");
    process.exit(0);
};

run();