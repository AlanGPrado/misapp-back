import pool from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDB() {
  console.log('🔄 Iniciando configuración de la base de datos...');
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ Tablas y esquema creados correctamente.');
  } catch (err) {
    console.error('❌ Error configurando la base de datos:', err.message);
  } finally {
    await pool.end();
  }
}

setupDB();
