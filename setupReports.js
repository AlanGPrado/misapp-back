import { query } from "./db/index.js";

async function setupReportsTable() {
    console.log("Creando tabla de reportes...");
    
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS reports (
              id SERIAL PRIMARY KEY,
              parroquia_id INT NOT NULL,
              tipo TEXT NOT NULL,
              descripcion TEXT,
              nuevo_horario TEXT,
              status TEXT DEFAULT 'pending',
              votos INT DEFAULT 1,
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        console.log("Tabla 'reports' creada (o ya existía).");

        console.log("Agregando constraint UNIQUE (parroquia_id, tipo, nuevo_horario, descripcion)...");
        // We include descripcion in the unique index so if two users provide the exact same description for 'otro', they upvote.
        // For 'horario_incorrecto', nuevo_horario is the key identifier.
        // If nuevo_horario or descripcion is NULL, we COALESCE to empty string in the unique index to prevent multiple NULL entries from duplicating.
        
        await query(`
            CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_idx 
            ON reports (
                parroquia_id, 
                tipo, 
                COALESCE(nuevo_horario, ''), 
                COALESCE(descripcion, '')
            );
        `);
        
        console.log("Índice UNIQUE agregado exitosamente.");
        
    } catch (err) {
        console.error("Error al configurar la tabla de reportes:", err.message);
    }
    process.exit(0);
}

setupReportsTable();
