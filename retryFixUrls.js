import { query } from "./db/index.js";

async function retryFixUrls() {
    console.log("Arreglando URLs para incluir /places-photos/ ...");
    
    const publicUrlBase = process.env.R2_PUBLIC_URL || "https://pub-3f6e2289066146ce9018a10b01788560.r2.dev";
    
    // Si la URL es: https://pub-...dev/hash.jpeg
    // Debería ser:  https://pub-...dev/places-photos/hash.jpeg
    
    const res = await query(`
        UPDATE parroquias 
        SET photos = REPLACE(
            photos::text, 
            '${publicUrlBase}/', 
            '${publicUrlBase}/places-photos/'
        )::jsonb
        WHERE photos::text LIKE '%${publicUrlBase}/%'
        AND photos::text NOT LIKE '%${publicUrlBase}/places-photos/%'
    `);
    
    console.log(`Se arregló el parametro places-photos en ${res.rowCount} parroquias.`);
    process.exit(0);
}

retryFixUrls().catch(console.error);
