import { Router } from 'express';
import pool from '../db';
import { verificarToken, verificarRol } from '../middleware/auth';
const router = Router();
router.get('/', verificarToken, verificarRol(['administrador']), async (req, res) => {
  try {
    const result = await pool.query("SELECT id, nombre as usuario, email as correo, rol, activo FROM perfiles ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (e) { res.status(500).json({error: 'Error'}); }
});
export default router;