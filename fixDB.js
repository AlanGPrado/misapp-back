import { query } from "./db/index.js";

async function fixDB() {
    console.log("Adding UNIQUE constraint to (nombre, direccion) so ON CONFLICT works...");
    try {
        await query(`
            ALTER TABLE parroquias 
            ADD CONSTRAINT parroquias_nombre_direccion_key UNIQUE (nombre, direccion);
        `);
        console.log("Constraint added successfully.");
    } catch (err) {
        console.log("Constraint might already exist, error:", err.message);
    }
    // process.exit(0);
}

fixDB().catch(console.error);
