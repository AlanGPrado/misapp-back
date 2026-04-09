import { query } from "./db/index.js";

async function fixUrls() {
    console.log("Reemplazando URLs privadas de R2 por URLs públicas en la base de datos...");

    // The public URL the user has in their .env
    const publicUrl = process.env.R2_PUBLIC_URL || "https://pub-3f6e2289066146ce9018a10b01788560.r2.dev";

    const res = await query(`
        UPDATE parroquias 
        SET photos = REPLACE(
            photos::text, 
            'https://2faf0886091ae23319c0b093c12758ff.r2.cloudflarestorage.com/misapp-bucket/places-photos', 
            '${publicUrl}'
        )::jsonb
        WHERE photos::text LIKE '%2faf0886091ae23319c0b093c12758ff.r2.cloudflarestorage.com%'
    `);

    console.log(`Se actualizaron las URLs de ${res.rowCount} parroquias.`);
    // process.exit(0);
}

fixUrls().catch(console.error);
