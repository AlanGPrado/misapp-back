import dotenv from 'dotenv';
dotenv.config();
import axios from "axios";
import { query } from "./db/index.js";
import { getMunicipios } from "./services/municipioService.js"
import { scrapeParroquias } from "./services/parroquiaService.js";

const ESTADOS = Array.from(
    { length: 32 },
    (_, i) => i + 1
);

const CONFIG = {
    DELAY_BETWEEN_PAGES: 1200,
    DELAY_BETWEEN_MUNICIPIOS: 2000,
    MAX_RETRIES: 3,
    AXIOS_TIMEOUT: 30000
};

axios.defaults.timeout =
    CONFIG.AXIOS_TIMEOUT;

axios.defaults.headers.common[
    "User-Agent"
] =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";

const sleep = (ms) =>
    new Promise(resolve => setTimeout(resolve, ms));

async function municipioYaScrapeado(
    estado,
    municipio_id
) {
    const { rows } = await query(
        `
        SELECT 1
        FROM scraped_municipios
        WHERE estado = $1
        AND municipio_id = $2
        LIMIT 1
        `,
        [estado, municipio_id]
    );

    return rows.length > 0;
}

async function marcarMunicipioComoCompleto(
    estado,
    municipio_id
) {
    await query(
        `
        INSERT INTO scraped_municipios
        (estado, municipio_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [estado, municipio_id]
    );
}

async function scrapeMunicipioCompleto(
    estado,
    municipio_id
) {
    let page = 1;
    let total = 0;

    while (true) {
        console.log(
            `[PAGE]
estado=${estado}
municipio=${municipio_id}
page=${page}`
        );

        let retries = 0;
        let results = [];

        while (
            retries < CONFIG.MAX_RETRIES
        ) {
            try {
                results =
                    await scrapeParroquias(
                        estado,
                        municipio_id,
                        page
                    );

                break;
            } catch (err) {
                retries++;

                console.error(
                    `[RETRY ${retries}]
estado=${estado}
municipio=${municipio_id}
page=${page}
error=${err.message}`
                );

                await sleep(3000);
            }
        }

        if (
            !results ||
            results.length === 0
        ) {
            console.log(
                `[EMPTY PAGE]
estado=${estado}
municipio=${municipio_id}
page=${page}`
            );

            break;
        }

        total += results.length;

        console.log(
            `[SAVED]
${results.length} parroquias
TOTAL=${total}`
        );

        page++;

        await sleep(
            CONFIG.DELAY_BETWEEN_PAGES
        );
    }

    await marcarMunicipioComoCompleto(
        estado,
        municipio_id
    );

    return total;
}

async function run() {
    console.log(`
==================================
STARTING FULL MEXICO SCRAPE
==================================
`);

    const startedAt = Date.now();

    for (const estado of ESTADOS) {
        console.log(`
==================================
ESTADO ${estado}
==================================
`);

        let municipios = [];

        try {
            const response = await getMunicipios(estado);

            municipios = response.municipios || [];
        } catch (err) {
            console.error(
                `[MUNICIPIOS ERROR]
estado=${estado}
error=${err.message}`
            );

            continue;
        }

        console.log(
            `[MUNICIPIOS]
TOTAL=${municipios.length}`
        );

        for (const municipio of municipios) {
            const municipio_id = municipio.id;
            const municipio_nombre = municipio.nombre;

            if (!municipio_id)
                continue;

            const yaExiste =
                await municipioYaScrapeado(
                    estado,
                    municipio_id
                );

            if (yaExiste) {
                console.log(
                    `[SKIP]
${municipio_nombre}`
                );

                continue;
            }

            console.log(`
----------------------------------
SCRAPING:
${municipio_nombre}
estado=${estado}
municipio=${municipio_id}
----------------------------------
`);

            try {
                const total =
                    await scrapeMunicipioCompleto(
                        estado,
                        municipio_id
                    );

                console.log(`
[SUCCESS]
${municipio_nombre}
TOTAL=${total}
`);
            } catch (err) {
                console.error(`
[FATAL ERROR]
municipio=${municipio_nombre}
error=${err.message}
`);
            }

            await sleep(
                CONFIG.DELAY_BETWEEN_MUNICIPIOS
            );
        }
    }

    const duration =
        (
            (Date.now() -
                startedAt) /
            1000 /
            60
        ).toFixed(2);

    console.log(`
==================================
SCRAPE FINISHED
Duration: ${duration} minutes
==================================
`);
}

run().catch(err => {
    console.error(`
==================================
GLOBAL ERROR
==================================
`, err);
});