import { query } from './db/index.js';

const run = async () => {
    console.log("Starting DB Schema Initialization for custom photos & reports...");
    try {
        // 1. Create church_photos with uploaded_by as UUID to match users.id type
        await query(`
            CREATE TABLE IF NOT EXISTS church_photos (
                id SERIAL PRIMARY KEY,
                google_place_id TEXT NOT NULL,
                url TEXT NOT NULL,
                uploaded_by UUID REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(25) DEFAULT 'pending',
                report_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ Table 'church_photos' successfully checked/created.");

        // 2. Create photo_reports with reported_by as UUID
        await query(`
            CREATE TABLE IF NOT EXISTS photo_reports (
                id SERIAL PRIMARY KEY,
                photo_id INTEGER REFERENCES church_photos(id) ON DELETE CASCADE,
                reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
                reason VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ Table 'photo_reports' successfully checked/created.");
        
        console.log("🎉 All tables created successfully!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error setting up tables:", err);
        process.exit(1);
    }
};

run();
