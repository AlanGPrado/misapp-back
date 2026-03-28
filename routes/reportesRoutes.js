import express from "express";
import { postReporteController } from "../controllers/reportesController.js";

const router = express.Router();

router.post("/reportes", postReporteController);

export default router;
