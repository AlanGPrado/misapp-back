import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import parroquiaRoutes from "./routes/parroquiaRoutes.js";
import municipioRoutes from "./routes/municipioRoutes.js";
import santosRoutes from "./routes/santosRoutes.js";
import reportesRoutes from "./routes/reportesRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import favoritesRoutes from "./routes/favoritesRoutes.js";
import streakRoutes from "./routes/streakRoutes.js";
import badgeRoutes from "./routes/badgeRoutes.js";
import donationRoutes from "./routes/donationRoutes.js";
import { initScrapedMunicipios } from "./services/parroquiaService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Main Routes
app.use("/", authRoutes);
app.use("/", parroquiaRoutes);
app.use("/", municipioRoutes);
app.use("/", santosRoutes);
app.use("/", reportesRoutes);
app.use("/favorites", favoritesRoutes);
app.use("/", streakRoutes);
app.use("/badges", badgeRoutes);
app.use("/donations", donationRoutes);

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