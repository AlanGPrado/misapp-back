import { query } from "../db/index.js";

/**
 * Creates or upvotes a report, and auto-approves if votes reach 3.
 * @param {number} parroquia_id 
 * @param {string} tipo (horario_incorrecto, cerrado, direccion_incorrecta, telefono_incorrecto, otro)
 * @param {string} descripcion 
 * @param {string} nuevo_horario 
 */
export const createOrUpvoteReport = async (parroquia_id, tipo, descripcion, nuevo_horario) => {
    // 1. Upsert report logic
    // Using the unique index on (parroquia_id, tipo, COALESCE(nuevo_horario, ''), COALESCE(descripcion, ''))
    const sqlInsert = `
        INSERT INTO reports (parroquia_id, tipo, descripcion, nuevo_horario, votos, status)
        VALUES ($1, $2, $3, $4, 1, 'pending')
        ON CONFLICT (parroquia_id, tipo, COALESCE(nuevo_horario, ''), COALESCE(descripcion, ''))
        DO UPDATE SET 
            votos = reports.votos + 1,
            updated_at = NOW()
        RETURNING *;
    `;
    
    // We pass nulls explicitly if undefined
    const vars = [
        parroquia_id, 
        tipo, 
        descripcion || null, 
        nuevo_horario || null
    ];

    const { rows } = await query(sqlInsert, vars);
    const report = rows[0];

    // 2. Check Auto-Approve (3+ votes)
    if (report.votos >= 3 && report.status === 'pending') {
        await approveReport(report);
    }

    return report;
};

/**
 * Executes the report changes on the parroquias table.
 * @param {Object} report 
 */
const approveReport = async (report) => {
    try {
        if (report.tipo === 'horario_incorrecto' && report.nuevo_horario) {
            await query(`UPDATE parroquias SET misas_hoy = $1 WHERE id = $2`, [report.nuevo_horario, report.parroquia_id]);
        } 
        else if (report.tipo === 'cerrado') {
            await query(`UPDATE parroquias SET misas_hoy = 'Esta iglesia ha sido reportada como cerrada.' WHERE id = $1`, [report.parroquia_id]);
        }
        else if (report.tipo === 'direccion_incorrecta' && report.descripcion) {
            await query(`UPDATE parroquias SET direccion = $1 WHERE id = $2`, [report.descripcion, report.parroquia_id]);
        }
        else if (report.tipo === 'telefono_incorrecto' && report.descripcion) {
            await query(`UPDATE parroquias SET telefono = $1 WHERE id = $2`, [report.descripcion, report.parroquia_id]);
        }
        // 'otro' might require manual intervention, so we just mark it as auto-approved but do no automatic DB updates.

        // Mark report as approved
        await query(`UPDATE reports SET status = 'approved', updated_at = NOW() WHERE id = $1`, [report.id]);
        console.log(`Report ID ${report.id} auto-approved for Parroquia ${report.parroquia_id}`);
    } catch (err) {
        console.error(`Error approving report ${report.id}:`, err);
    }
};
