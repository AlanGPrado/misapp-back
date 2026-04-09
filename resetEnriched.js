import { query } from "./db/index.js";

async function resetEnriched() {
    console.log("Resetting enriched flag for parishes that still use googleapis photos...");
    const res = await query(`
        UPDATE parroquias 
        SET 
            enriched = false, 
            enrichment_attempted = false,
            last_enrichment_attempt = NULL
        WHERE photos::text LIKE '%googleapis.com%'
    `);
    console.log(`Updated ${res.rowCount} rows.`);
    // process.exit(0);
}

resetEnriched().catch(console.error);
