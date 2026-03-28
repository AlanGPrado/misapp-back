import { createOrUpvoteReport } from "../services/reportesService.js";

/**
 * Handle POST /reportes
 * Creates a new report or upvotes an existing one.
 */
export const postReporteController = async (req, res) => {
    const { parroquia_id, tipo, descripcion, nuevo_horario } = req.body;

    if (!parroquia_id || !tipo) {
        return res.status(400).json({ error: "parroquia_id y tipo son requeridos" });
    }

    try {
        const report = await createOrUpvoteReport(parroquia_id, tipo, descripcion, nuevo_horario);
        res.json({ success: true, report });
    } catch (error) {
        console.error("Error in postReporteController:", error);
        res.status(500).json({ error: "Error interno al guardar el reporte" });
    }
};
