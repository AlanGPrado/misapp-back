import { Router } from "express";
import { getParroquiasController } from "../controllers/parroquiaController.js";
import { getParroquiaByIdController } from "../controllers/parroquiaByIdController.js";
import { getParroquiasByIdsController } from "../controllers/parroquiasByIdsController.js";

const router = Router();

/**
 * @route GET /misas
 * @query {string} estado
 * @query {number} municipio_id
 * @query {number} page
 */
router.get("/misas", (req, res) => getParroquiasController(req, res));

router.get("/parroquias/:id", getParroquiaByIdController);
// router.get("/parroquias/place/:place_id", getParroquiaByPlaceIdController);
router.post("/parroquias/by-ids", getParroquiasByIdsController);
export default router;
