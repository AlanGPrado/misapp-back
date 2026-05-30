import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import crypto from "crypto";
import { query } from "../db/index.js";

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

export const uploadChurchPhoto = async (req, res) => {
    const { placeId } = req.params;
    const { imageBase64 } = req.body;
    const userId = req.user.id; // UUID from token

    if (!placeId) {
        return res.status(400).json({ error: "El ID de la parroquia es requerido." });
    }
    if (!imageBase64) {
        return res.status(400).json({ error: "Los datos de la imagen son requeridos." });
    }

    try {
        // ─── 1. Rate Limiting Check (Max 3 uploads per minute per user) ───
        const rateCheck = await query(
            `SELECT COUNT(*) FROM church_photos 
             WHERE uploaded_by = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
            [userId]
        );
        if (parseInt(rateCheck.rows[0].count, 10) >= 3) {
            return res.status(429).json({ error: "Has excedido el límite de 3 subidas por minuto. Por favor, espera un momento." });
        }

        // ─── 2. Limit Check (Max 5 photos per user per parish) ───
        const limitCheck = await query(
            `SELECT COUNT(*) FROM church_photos 
             WHERE google_place_id = $1 AND uploaded_by = $2`,
            [placeId, userId]
        );
        if (parseInt(limitCheck.rows[0].count, 10) >= 5) {
            return res.status(400).json({ error: "Has alcanzado el límite de 5 fotos por parroquia." });
        }

        // ─── 3. Parse Base64 Image Payload ───
        const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        let mimeType;
        if (matches && matches.length === 3) {
            mimeType = matches[1];
            buffer = Buffer.from(matches[2], "base64");
        } else {
            buffer = Buffer.from(imageBase64, "base64");
            mimeType = "image/jpeg"; // default fallback
        }

        // ─── 4. Size check (Max 10 MB) ───
        if (buffer.length > 10 * 1024 * 1024) {
            return res.status(400).json({ error: "La imagen es demasiado grande. El límite es de 10 MB." });
        }

        // ─── 5. Mime type check ───
        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/heic", "image/webp"];
        if (!allowedTypes.includes(mimeType.toLowerCase())) {
            return res.status(400).json({ error: "Formato de imagen inválido. Solo se admiten formatos JPG, PNG, HEIC o WEBP." });
        }

        // ─── 6. Dimension validation using Sharp ───
        let metadata;
        try {
            metadata = await sharp(buffer).metadata();
        } catch (err) {
            return res.status(400).json({ error: "No se pudo procesar el archivo como una imagen." });
        }

        if (!metadata.width || !metadata.height || metadata.width < 600 || metadata.height < 600) {
            return res.status(400).json({ error: "La resolución de la imagen debe ser de al menos 600x600 píxeles." });
        }

        // ─── 7. Convert and optimize image to WebP ───
        const webpBuffer = await sharp(buffer)
            .webp({ quality: 80 })
            .toBuffer();

        // ─── 8. Generate S3 R2 Key Path ───
        const hash = crypto.createHash("md5").update(webpBuffer).digest("hex");
        const uuid = crypto.randomUUID();
        const key = `places-photos/${placeId}/${userId}/${uuid}-${hash}.webp`;

        // ─── 9. Upload to Cloudflare R2 ───
        if (!process.env.R2_ACCESS_KEY_ID) {
            return res.status(500).json({ error: "Las credenciales del servidor de almacenamiento no están configuradas." });
        }

        await getS3Client().send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: webpBuffer,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000",
        }));

        const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

        // ─── 10. Persist pending record in DB ───
        await query(
            `INSERT INTO church_photos (google_place_id, url, uploaded_by, status)
             VALUES ($1, $2, $3, 'pending')`,
            [placeId, publicUrl, userId]
        );

        return res.status(201).json({
            message: "La imagen ha sido subida con éxito y está pendiente de revisión por el administrador.",
            url: publicUrl,
            status: "pending"
        });
    } catch (error) {
        console.error("❌ Error uploading photo controller:", error);
        return res.status(500).json({ error: "Error interno del servidor al procesar la imagen." });
    }
};
