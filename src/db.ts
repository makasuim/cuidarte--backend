import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Configuramos la conexión a Neon.tech
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Requerido para conexiones a Neon.tech
  }
});

pool.on('connect', () => {
  console.log('✅ Conectado a la base de datos en Neon.tech');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en la base de datos', err);
  process.exit(-1);
});

export default pool;