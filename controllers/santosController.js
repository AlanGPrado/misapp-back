import { getSantosMonth, getSantoDay } from "../services/santosService.js";

export const getSantosMonthController = async (req, res) => {
    const month = parseInt(req.query.month || new Date().getMonth() + 1, 10);

    if (isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "month debe ser un número entre 1 y 12" });
    }

    try {
        const result = await getSantosMonth(month);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Error obteniendo santoral del mes" });
    }
}

export const getSantoDayController = async (req, res) => {
    const month = parseInt(req.params.month, 10);
    const day = parseInt(req.params.day, 10);

    if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        return res.status(400).json({ error: "Parámetros de mes o día inválidos" });
    }

    try {
        const result = await getSantoDay(month, day);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Error obteniendo información del santo" });
    }
}
