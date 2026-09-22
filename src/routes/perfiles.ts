import { Router } from 'express';
import pool from '../db';
import { verificarToken } from '../middleware/auth';

const router = Router();

// Obtener solo los usuarios que tienen rol de 'medico'
router.get('/medicos', verificarToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, nombre FROM perfiles WHERE rol = 'medico' AND activo = true ORDER BY nombre ASC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener los médicos' });
  }
});

export default router;