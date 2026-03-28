import axios from "axios";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

let _s3Client = null;

const getS3Client = () => {
    if (!_s3Client) {
        _s3Client = new S3Client({
            region: "auto",
            endpoint: "https://2faf0886091ae23319c0b093c12758ff.r2.cloudflarestorage.com",
            forcePathStyle: true,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
            },
        });
    }
    return _s3Client;
};

const BUCKET_NAME = "misapp-bucket";
const PUBLIC_URL = process.env.R2_PUBLIC_URL || "https://2faf0886091ae23319c0b093c12758ff.r2.cloudflarestorage.com/misapp-bucket"; // Replace with actual custom domain if applied

/**
 * Downloads an image from Google Places API and uploads it to Cloudflare R2
 * @param {string} googlePhotoUrl - The raw Google Places photo URL
 * @returns {Promise<string|null>} - The Cloudflare R2 public URL
 */
export const uploadGooglePhotoToR2 = async (googlePhotoUrl) => {
    try {
        if (!process.env.R2_ACCESS_KEY_ID) {
            console.warn("Skipping R2 upload: missing R2 credentials in .env");
            return googlePhotoUrl; // Fallback to Google URL
        }

        // 1. Download image from Google
        const response = await axios.get(googlePhotoUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, "binary");
        
        const contentType = response.headers['content-type'] || 'image/jpeg';
        
        // 2. Generate unique filename
        const hash = crypto.createHash('md5').update(googlePhotoUrl + Date.now()).digest('hex');
        const ext = contentType.split('/')[1] || 'jpg';
        const key = `places-photos/${hash}.${ext}`;

        // 3. Upload to Cloudflare R2
        await getS3Client().send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000",
        }));

        // 4. Return new URL
        return `${process.env.R2_PUBLIC_URL}/${key}`;
    } catch (error) {
        console.error("Error uploading to R2:", error.message);
        return googlePhotoUrl; // Fallback to original
    }
};

/**
 * Searches a church in Google Places API (Text Search) and extracts photo URLs
 */
export const searchChurchOnGoogle = async (nombre, direccion) => {
    try {
        const apiKey = process.env.PLACES_API_KEY;
        if (!apiKey) return null;

        const query = `${nombre} ${direccion}`.trim();
        const url = `https://places.googleapis.com/v1/places:searchText`;
        
        const reqBody = {
            textQuery: query,
            languageCode: "es"
        };

        const headers = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.location,places.rating,places.photos'
        };

        const { data } = await axios.post(url, reqBody, { headers });
        const place = data.places?.[0];

        if (!place) return null;

        let photosUrls = [];
        if (place.photos && place.photos.length > 0) {
            // Take up to 3 photos
            const photosToProcess = place.photos.slice(0, 3);
            for (const photo of photosToProcess) {
                const googleUrl = `https://places.googleapis.com/v1/${photo.name}/media?key=${apiKey}&maxHeightPx=800&maxWidthPx=800`;
                // Upload to R2!
                const r2Url = await uploadGooglePhotoToR2(googleUrl);
                photosUrls.push(r2Url);
            }
        }

        return {
            place_id: place.id,
            lat: place.location?.latitude,
            lng: place.location?.longitude,
            rating: place.rating,
            photos: photosUrls
        };
    } catch (error) {
        console.error("Google Places Search Error:", error.message);
        return null;
    }
};
