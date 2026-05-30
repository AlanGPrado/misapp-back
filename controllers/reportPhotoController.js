import { query } from "../db/index.js";

export const reportChurchPhoto = async (req, res) => {
    const { photoId } = req.params;
    const { reason } = req.body; // wrong_church, copyright, offensive, spam
    const userId = req.user?.id || null; // UUID from token

    if (!photoId) {
        return res.status(400).json({ error: "El ID de la foto es requerido." });
    }
    if (!reason) {
        return res.status(400).json({ error: "El motivo del reporte es requerido." });
    }

    try {
        // 1. Insert flag in photo_reports
        await query(
            `INSERT INTO photo_reports (photo_id, reported_by, reason)
             VALUES ($1, $2, $3)`,
            [photoId, userId, reason]
        );

        // 2. Increment report_count on church_photos
        const updateRes = await query(
            `UPDATE church_photos 
             SET report_count = report_count + 1 
             WHERE id = $1 
             RETURNING report_count, status`,
            [photoId]
        );

        if (updateRes.rows.length === 0) {
            return res.status(404).json({ error: "La foto no existe o ya fue eliminada." });
        }

        const { report_count, status } = updateRes.rows[0];

        // 3. Auto-Demotion Shield: automatically demote if report count >= 5
        if (report_count >= 5 && status === "approved") {
            await query(
                `UPDATE church_photos 
                 SET status = 'pending_review' 
                 WHERE id = $1`,
                [photoId]
            );
            console.log(`⚠️ Auto-demoted photo ${photoId} due to reaching 5 reports.`);
        }

        return res.status(200).json({
            message: "La foto ha sido reportada exitosamente. Agradecemos tu ayuda para mantener segura nuestra comunidad."
        });
    } catch (error) {
        console.error("❌ Error reporting photo controller:", error);
        return res.status(500).json({ error: "Error interno del servidor al registrar el reporte." });
    }
};
