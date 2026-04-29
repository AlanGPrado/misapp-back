
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Slugify helper (MUST match uploadSantoralToR2.js)
const slugify = (text) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, ''); // Trim - from end of text
};

const PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-3f6e2289066146ce9018a10b01788560.r2.dev';

async function updateSaints() {
    console.log("🚀 Starting DB update with R2 URLs...");
    
    try {
        const { rows } = await pool.query('SELECT * FROM saints');
        console.log(`Found ${rows.length} records to process.`);

        for (const row of rows) {
            const MM = String(row.month).padStart(2, '0');
            const DD = String(row.day).padStart(2, '0');
            
            let santos = row.santos;
            if (typeof santos === 'string') {
                santos = JSON.parse(santos);
            }

            if (!Array.isArray(santos)) {
                console.log(`⚠️ Skipping ${MM}-${DD}: 'santos' is not an array`);
                continue;
            }

            let updated = false;
            let firstImageUrl = null;

            const updatedSantos = santos.map((saint) => {
                const slug = slugify(saint.nombre);
                const r2Url = `${PUBLIC_URL}/santoral/${MM}-${DD}/${slug}/cover.webp`;
                return { ...saint, imageUrl: r2Url };
            });

            const updatedImagen = updatedSantos.map(s => ({ url: s.imageUrl }));

            // Update unconditionally for this run to ensure consistency
            await pool.query(
                'UPDATE saints SET santos = $1, imagen = $2 WHERE id = $3',
                [JSON.stringify(updatedSantos), JSON.stringify(updatedImagen), row.id]
            );
            console.log(`✅ Updated ${MM}-${DD} (${row.id})`);
        }

        console.log("🎉 Finished updating DB!");
    } catch (err) {
        console.error("❌ Error updating saints:", err);
    } finally {
        await pool.end();
    }
}

updateSaints();
