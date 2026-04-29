
import axios from 'axios';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;

// S3 Client Setup
const s3Client = new S3Client({
    region: 'auto',
    endpoint: 'https://2faf0886091ae23319c0b093c12758ff.r2.cloudflarestorage.com',
    forcePathStyle: true,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});
const BUCKET_NAME = 'misapp-bucket';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-3f6e2289066146ce9018a10b01788560.r2.dev';

// DB Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Slugify helper
const slugify = (text) => {
    return text.toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, ''); // Trim - from end of text
};

const IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Jean-Jacques_Henner_Fabiola.jpg/250px-Jean-Jacques_Henner_Fabiola.jpg';
const MONTH = 12;
const DAY = 27;
const MM = '12';
const DD = '27';
const SAINT_INDEX = 1; // 2nd saint

async function run() {
    console.log(`🚀 Processing custom image update for November 7th, 2nd saint...`);

    try {
        // 1. Fetch DB record
        const { rows } = await pool.query('SELECT * FROM saints WHERE month = $1 AND day = $2', [MONTH, DAY]);
        if (rows.length === 0) throw new Error("November 7th not found in DB");
        
        const row = rows[0];
        let santos = row.santos;
        if (typeof santos === 'string') santos = JSON.parse(santos);
        
        if (santos.length <= SAINT_INDEX) throw new Error(`November 7th has less than ${SAINT_INDEX + 1} saints`);

        const saint = santos[SAINT_INDEX];
        const slug = slugify(saint.nombre);
        const key = `santoral/${MM}-${DD}/${slug}/cover.webp`;
        const r2PublicUrl = `${PUBLIC_URL}/${key}`;

        console.log(`Saint: ${saint.nombre}`);
        console.log(`Slug: ${slug}`);
        console.log(`Target Key: ${key}`);

        // 2. Download and Optimize
        console.log(`Downloading original image: ${IMAGE_URL}`);
        const imgRes = await axios.get(IMAGE_URL, { 
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
                'Referer': 'https://www.google.com/'
            }
        });

        const buffer = Buffer.from(imgRes.data, 'binary');
        console.log(`Optimizing to WebP...`);
        const webpBuffer = await sharp(buffer)
            .webp({ quality: 80, effort: 4 })
            .toBuffer();

        // 3. Upload to R2
        console.log(`Uploading to R2...`);
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: webpBuffer,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000',
        }));
        console.log(`SUCCESS: Uploaded to ${r2PublicUrl}`);

        // 4. Update DB
        console.log(`Updating DB...`);
        santos[SAINT_INDEX].imageUrl = r2PublicUrl;
        
        let imagen = row.imagen;
        if (typeof imagen === 'string') imagen = JSON.parse(imagen);
        if (Array.isArray(imagen) && imagen.length > SAINT_INDEX) {
            imagen[SAINT_INDEX] = { url: r2PublicUrl };
        } else if (Array.isArray(imagen)) {
            imagen.push({ url: r2PublicUrl });
        }

        await pool.query(
            'UPDATE saints SET santos = $1, imagen = $2 WHERE id = $3',
            [JSON.stringify(santos), JSON.stringify(imagen), row.id]
        );

        console.log(`🎉 Finished! November 7th 2nd saint updated.`);

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await pool.end();
    }
}

run();
