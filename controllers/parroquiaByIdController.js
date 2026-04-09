import { query } from "../db/index.js";
import { getParroquias } from "../services/parroquiaService.js";

// EXISTENTE
export const getParroquiasController = async (req, res) => {
    try {
        const { estado, municipio_id, page } = req.query;

        const data = await getParroquias(estado, municipio_id, page);
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno" });
    }
};

// 🔹 NUEVO: por ID interno
export const getParroquiaByIdController = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT * FROM parroquias WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Parroquia no encontrada" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno" });
    }
};

// 🔹 NUEVO: por Google Place ID
export const getParroquiaByPlaceIdController = async (req, res) => {
    try {
        const { place_id } = req.params;

        const result = await query(
            `SELECT * FROM parroquias WHERE google_place_id = $1`,
            [place_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Parroquia no encontrada" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error interno" });
    }
};