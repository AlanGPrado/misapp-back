import { Router } from "express";
import { getParroquiasController } from "../controllers/parroquiaController.js";
import { getParroquiaByIdController } from "../controllers/parroquiaByIdController.js";
import { getParroquiasByIdsController } from "../controllers/parroquiasByIdsController.js";
import { searchParroquiasController } from "../controllers/parroquiaSearchController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { uploadChurchPhoto } from "../controllers/uploadController.js";
import { reportChurchPhoto } from "../controllers/reportPhotoController.js";

const router = Router();

/**
 * @route GET /misas
 * @query {string} estado
 * @query {number} municipio_id
 * @query {number} page
 */
router.get("/misas", (req, res) => getParroquiasController(req, res));

router.get("/parroquias/search", searchParroquiasController);
router.get("/parroquias/:id", getParroquiaByIdController);
// router.get("/parroquias/place/:place_id", getParroquiaByPlaceIdController);
router.post("/parroquias/by-ids", getParroquiasByIdsController);

// Custom photo gallery upload & moderation report routes
router.post("/parroquias/:placeId/upload-photo", requireAuth, uploadChurchPhoto);
router.post("/parroquias/photos/:photoId/report", requireAuth, reportChurchPhoto);

export default router;
