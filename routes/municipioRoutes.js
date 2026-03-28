import { Router } from "express";
import { getMunicipiosController } from "../controllers/municipioController.js";

const router = Router();

router.get("/municipios", getMunicipiosController);

export default router;
