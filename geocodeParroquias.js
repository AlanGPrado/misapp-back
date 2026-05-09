import { query } from './db/index.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const OPENCAGE_API_KEY = '898a56e37fbf453483b073b1357e895a';
async function geocode(searchQuery, retry = 0) {

    const url =
        `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(searchQuery)}&key=${OPENCAGE_API_KEY}&limit=1&no_annotations=1`;

    const response = await fetch(url);

    // RATE LIMIT
    if (response.status === 429) {

        const wait = 5000 + (retry * 5000);

        console.log(`429 rate limit. Esperando ${wait / 1000}s...`);

        await sleep(wait);

        if (retry < 5) {
            return geocode(searchQuery, retry + 1);
        }

        throw new Error('Demasiados 429');
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.results.length) {
        return null;
    }

    const result = data.results[0];

    console.log('Matched:', result.formatted);
    console.log('Confidence:', result.confidence);

    // evitar matches basura
    if (result.confidence < 6) {
        console.log('Low confidence, skipped');
        return null;
    }

    return {
        lat: result.geometry.lat,
        lng: result.geometry.lng
    };
}

function cleanAddress(address) {

    return address
        ?.replace(/\bc\.p\.\s*\d+/gi, '')
        ?.replace(/méxico/gi, 'Mexico')
        ?.replace(/\s+,/g, ',')
        ?.trim();
}

async function run() {

    const result = await query(`
        SELECT
            id,
            nombre,
            direccion,
            diocesis
        FROM parroquias
        WHERE direccion IS NOT NULL
          AND (
            lat IS NULL
            OR lng IS NULL
          )
        ORDER BY id ASC
        LIMIT 2500
    `);

    console.log(`Pendientes: ${result.rows.length}`);

    for (const row of result.rows) {

        try {

            const cleanDireccion = cleanAddress(row.direccion);

            // MEJOR QUERY
            const searchQuery = [
                row.nombre,
                cleanDireccion,
                row.diocesis
            ]
                .filter(Boolean)
                .join(', ');

            console.log('--------------------');
            console.log(row.id);
            console.log(searchQuery);

            const geo = await geocode(searchQuery);

            if (!geo) {
                console.log('Sin resultado');
                continue;
            }

            await query(
                `
                UPDATE parroquias
                SET lat = $1,
                    lng = $2,
                    last_updated = NOW()
                WHERE id = $3
                `,
                [geo.lat, geo.lng, row.id]
            );

            console.log(`Saved: ${geo.lat}, ${geo.lng}`);

            // OpenCage free tier friendly
            await sleep(1200);

        } catch (err) {

            console.error(`Error en ID ${row.id}`);
            console.error(err.message);

            await sleep(3000);
        }
    }

    console.log('Terminado');
}

run();