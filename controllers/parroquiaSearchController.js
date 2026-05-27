import { query } from "../db/index.js";

/**
 * Native Search Controller for Parroquias
 * Searches the database by matching all search terms in 'nombre' or 'direccion'
 */
export const searchParroquiasController = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || !q.trim()) {
            return res.json([]);
        }

        // Split query into terms to support searching multiple keywords in any order
        const terms = q.trim().split(/\s+/).filter(Boolean);
        if (terms.length === 0) {
            return res.json([]);
        }

        let sql = `SELECT * FROM parroquias WHERE `;
        const conditions = [];
        const params = [];

        terms.forEach((term, idx) => {
            const paramIdx = idx + 1;
            conditions.push(`(nombre ILIKE $${paramIdx} OR direccion ILIKE $${paramIdx})`);
            params.push(`%${term}%`);
        });

        sql += conditions.join(' AND ');
        sql += ` ORDER BY nombre ASC LIMIT 50`;

        const result = await query(sql, params);
        res.json(result.rows);
    } catch (error) {
        console.error("Search Error:", error);
        res.status(500).json({ message: "Error al buscar parroquias" });
    }
};
