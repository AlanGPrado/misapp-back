import { getMunicipios } from "../services/municipioService.js";

export const getMunicipiosController = async (req, res) => {
    const { estado } = req.query;

    if (!estado) {
        return res.status(400).json({ error: "estado es requerido." });
    }

    try {
        const data = await getMunicipios(estado);
        res.json(data);
    } catch (error) {
        console.error("Municipios Controller Error:", error);
        res.status(500).json({ error: "error obteniendo municipios." });
    }
}
