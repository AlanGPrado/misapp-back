import axios from 'axios';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import dotenv from 'dotenv';
import pLimit from 'p-limit';

dotenv.config();

// Helpers for dates
const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const getDaysInMonth = (month, year) => new Date(year, month, 0).getDate();

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

const processDate = async (month, day) => {
    const MM = String(month).padStart(2, '0');
    const DD = String(day).padStart(2, '0');

    try {
        const response = await axios.get(`http://localhost:8080/santos/${month}/${day}`);
        const data = response.data;
        
        if (!data || !data.santos || !data.imagen) return;

        // Iterate through saints and their corresponding images
        for (let i = 0; i < data.santos.length; i++) {
            const saint = data.santos[i];
            const image = data.imagen[i] || (i === 0 ? data.imagen[0] : null); // Fallback to first image if not mapped 1:1
            
            if (!image || !image.url) continue;

            const slug = slugify(saint.nombre);
            const key = `santoral/${MM}-${DD}/${slug}/cover.webp`;

            console.log(`Processing [${MM}-${DD}] ${saint.nombre}... downloading image: ${image.url}`);

            try {
                // Download original image (with timeout and headers occasionally needed for wikipedia/etc)
                const imgRes = await axios.get(image.url, { 
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                const buffer = Buffer.from(imgRes.data, 'binary');

                console.log(`[${MM}-${DD}] ${saint.nombre} - optimizing to WebP...`);
                // Optimize using sharp
                const webpBuffer = await sharp(buffer)
                    .webp({ quality: 80, effort: 4 })
                    .toBuffer();

                console.log(`[${MM}-${DD}] ${saint.nombre} - uploading to R2 at ${key}...`);
                // Upload to R2
                await s3Client.send(new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: key,
                    Body: webpBuffer,
                    ContentType: 'image/webp',
                    CacheControl: 'public, max-age=31536000',
                }));

                console.log(`[${MM}-${DD}] ${saint.nombre} - SUCCESS.`);
            } catch (imgError) {
                console.error(`[${MM}-${DD}] ${saint.nombre} - FAILED to process or upload image: ${imgError.message}`);
            }
        }
    } catch (apiError) {
        if (apiError.response && apiError.response.status === 404) return;
        console.error(`Error fetching saints for ${MM}/${DD}: ${apiError.message}`);
    }
};

const run = async () => {
    if (!process.env.R2_ACCESS_KEY_ID) {
        console.error("Missing R2 credentials in .env. Exiting.");
        return;
    }

    console.log("Starting Santoral Image Backup & Optimization to R2...");
    const year = 2024; // Leap year to cover all 366 possible days
    
    // We'll use p-limit to control concurrency so we don't spam the API or get rate-limited
    const limit = pLimit(5); // 5 concurrent days at a time
    const promises = [];

    for (let currentMonth = 1; currentMonth <= 12; currentMonth++) {
        const daysInMonth = getDaysInMonth(currentMonth, year);
        for (let currentDay = 1; currentDay <= daysInMonth; currentDay++) {
            promises.push(limit(() => processDate(currentMonth, currentDay)));
        }
    }

    await Promise.all(promises);
    console.log("Finished processing all days!");
};

run().catch(console.error);
