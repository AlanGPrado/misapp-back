// migrate-donations.js
// Run once: node migrate-donations.js
// Adds is_premium to users and creates the donations table.

import { query } from './db/index.js';
import dotenv from 'dotenv';
dotenv.config();

const migrate = async () => {
    console.log('🚀 Running donations migration...');

    // 1. Add is_premium column to users (idempotent)
    await query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT FALSE
    `);
    console.log('✅ users.is_premium column ready');

    // 2. Create donations table (idempotent)
    await query(`
        CREATE TABLE IF NOT EXISTS donations (
            id             SERIAL PRIMARY KEY,
            user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            platform       VARCHAR(10) NOT NULL CHECK (platform IN ('android', 'ios')),
            product_id     VARCHAR(100) NOT NULL,
            purchase_token TEXT,
            receipt_data   TEXT,
            verified_at    TIMESTAMP WITH TIME ZONE,
            created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (user_id, purchase_token)
        )
    `);
    console.log('✅ donations table ready');

    console.log('🎉 Migration complete!');
    process.exit(0);
};

migrate().catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
});
