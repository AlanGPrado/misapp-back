import { Router } from "express";
import { getParroquiasController } from "../controllers/parroquiaController.js";

const router = Router();

/**
 * @route GET /misas
 * @query {string} estado
 * @query {number} municipio_id
 * @query {number} page
 */
router.get("/misas", (req, res) => getParroquiasController(req, res));

export default router;
