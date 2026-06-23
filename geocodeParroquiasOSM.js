import { query } from './db/index.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const OPENCAGE_API_KEY = '898a56e37fbf453483b073b1357e895a';

function cleanAddress(address) {
    return address
        ?.replace(/\bc\.p\.\s*\d+/gi, '') // Remove postal codes
        ?.replace(/méxico/gi, 'Mexico')
        ?.replace(/\s+,/g, ',')
        ?.trim();
}

function isValidMatch(row, result) {
    const formatted = result.formatted.toLowerCase();
    
    // Extract main diocese city/region
    const diocesisWord = row.diocesis
        ?.replace(/Arquidiócesis de |Diócesis de /i, '')
        ?.trim()
        ?.toLowerCase();
    
    const addressLower = (row.direccion || '').toLowerCase();
    
    const keyWords = [];
    if (diocesisWord && diocesisWord.length > 3) {
        keyWords.push(diocesisWord);
    }
    
    // Common cities/states/regions in Mexico
    const regions = [
        'mexicali', 'monterrey', 'cdmx', 'ciudad de méxico', 'mexico df', 
        'tijuana', 'guadalajara', 'leon', 'queretaro', 'puebla', 
        'toluca', 'cancun', 'merida', 'chihuahua', 'juarez', 
        'hermosillo', 'culiacan', 'mazatlan', 'veracruz', 'oaxaca',
        'baja california', 'nuevo leon', 'jalisco', 'guanajuato'
    ];
    
    for (const reg of regions) {
        if (addressLower.includes(reg)) {
            keyWords.push(reg);
        }
    }
    
    if (keyWords.length > 0) {
        const normalize = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const normalizedFormatted = normalize(formatted);
        
        const matched = keyWords.some(word => {
            const normalizedWord = normalize(word);
            if (normalizedWord === 'mexico' || normalizedWord === 'cdmx') {
                return normalizedFormatted.includes('mexico') || 
                       normalizedFormatted.includes('cdmx') || 
                       normalizedFormatted.includes('ciudad de mexico') || 
                       normalizedFormatted.includes('distrito federal');
            }
            return normalizedFormatted.includes(normalizedWord);
        });
        
        if (!matched) {
            console.log(`Validation failed: Expected one of [${keyWords.join(', ')}] in "${result.formatted}"`);
            return false;
        }
    }
    return true;
}

async function geocode(searchQuery, row, retry = 0) {
    // Restrict search to Mexico using countrycode=mx
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(searchQuery)}&key=${OPENCAGE_API_KEY}&limit=1&no_annotations=1&countrycode=mx`;

    try {
        const response = await fetch(url);

        if (response.status === 429) {
            const wait = 5000 + (retry * 5000);
            console.log(`429 rate limit. Esperando ${wait / 1000}s...`);
            await sleep(wait);
            if (retry < 5) {
                return geocode(searchQuery, row, retry + 1);
            }
            throw new Error('Demasiados 429');
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.results || !data.results.length) {
            return null;
        }

        const result = data.results[0];
        console.log('Matched:', result.formatted);
        console.log('Confidence:', result.confidence);

        // Avoid low confidence matches
        if (result.confidence < 5) {
            console.log('Confidence too low, skipped');
            return null;
        }

        // Validate that the match belongs to the correct region/state/diocese
        if (!isValidMatch(row, result)) {
            return null;
        }

        return {
            lat: result.geometry.lat,
            lng: result.geometry.lng
        };
    } catch (err) {
        console.error(`Error fetching geocode for "${searchQuery}":`, err.message);
        if (retry < 3) {
            console.log(`Retrying in 3s... (attempt ${retry + 1})`);
            await sleep(3000);
            return geocode(searchQuery, row, retry + 1);
        }
        return null;
    }
}

async function run() {
    // Clean up previous incorrect geocodes
    console.log("Limpiando registros previos incorrectos...");
    await query(`
        UPDATE parroquias
        SET lat = NULL, lng = NULL, last_updated = NOW()
        WHERE id IN (480, 482)
    `);

    const limit = process.env.GEOCODE_LIMIT ? parseInt(process.env.GEOCODE_LIMIT, 10) : 10;
    
    const result = await query(`
        SELECT
            id,
            nombre,
            direccion,
            diocesis
        FROM parroquias
        WHERE (direccion IS NOT NULL AND direccion != '')
          AND (
            lat IS NULL
            OR lng IS NULL
          )
        ORDER BY id ASC
        LIMIT $1
    `, [limit]);

    console.log(`Pendientes a procesar: ${result.rows.length}`);

    for (const row of result.rows) {
        try {
            const cleanDireccion = cleanAddress(row.direccion);
            
            // Try different query formulations for better chances
            const queriesToTry = [
                // 1. Full search query
                [row.nombre, cleanDireccion].filter(Boolean).join(', '),
                // 2. Just the address
                cleanDireccion,
                // 3. Name and diocesis
                [row.nombre, row.diocesis].filter(Boolean).join(', ')
            ].filter(Boolean);

            let geo = null;
            
            for (const q of queriesToTry) {
                console.log(`--------------------`);
                console.log(`ID: ${row.id} - Intentando query: "${q}"`);
                geo = await geocode(q, row);
                
                await sleep(1200);

                if (geo) {
                    break;
                }
            }

            if (!geo) {
                console.log(`ID ${row.id}: Sin resultado después de intentar queries de fallback`);
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

            console.log(`Guardado ID ${row.id}: ${geo.lat}, ${geo.lng}`);

        } catch (err) {
            console.error(`Error en ID ${row.id}:`, err.message);
            await sleep(3000);
        }
    }

    console.log('Terminado');
}

run().catch(console.error);
