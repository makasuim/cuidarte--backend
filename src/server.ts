import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db';

// Importación de rutas
import authRoutes from './routes/auth';
import pacientesRoutes from './routes/pacientes';
import examenesRoutes from './routes/examenes';
import informesRoutes from './routes/informes';
import usuariosRoutes from './routes/usuarios';
import auditoriaRoutes from './routes/auditoria';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Montaje de rutas
app.use('/api/auth', authRoutes);
app.use('/api/pacientes', pacientesRoutes);
app.use('/api/examenes', examenesRoutes);
app.use('/api/informes', informesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/auditoria', auditoriaRoutes);

// Ruta de diagnóstico
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'OK', db_time: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ error: 'Error DB' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});