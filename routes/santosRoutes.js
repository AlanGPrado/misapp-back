import { Router } from "express";
import { getSantosMonthController, getSantoDayController } from "../controllers/santosController.js";

const router = Router();

router.get("/santos", getSantosMonthController);
router.get("/santos/:month/:day", getSantoDayController);

export default router;
