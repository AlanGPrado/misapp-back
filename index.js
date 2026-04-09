import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import parroquiaRoutes from "./routes/parroquiaRoutes.js";
import municipioRoutes from "./routes/municipioRoutes.js";
import santosRoutes from "./routes/santosRoutes.js";
import reportesRoutes from "./routes/reportesRoutes.js";
import { initScrapedMunicipios } from "./services/parroquiaService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Main Routes
app.use("/", parroquiaRoutes);
app.use("/", municipioRoutes);
app.use("/", santosRoutes);
app.use("/", reportesRoutes);

app.get('/', (req, res) => {
    res.send('API de Misas [Online]');
});

const start = async () => {
    try {
        console.log("🔥 Starting server...");

        await initScrapedMunicipios(); // 👈 IMPORTANTE

        app.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
            console.log(`🌍 Base de Datos: ${process.env.DATABASE_URL ? 'Configurada' : 'No Configurada'}`);
        });

    } catch (err) {
        console.error("❌ Error starting server:", err.message);
        process.exit(1);
    }
};

start();