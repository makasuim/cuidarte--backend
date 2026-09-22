import { Router } from 'express';
import pool from '../db';
import { verificarToken, verificarRol } from '../middleware/auth';
const router = Router();
router.get('/', verificarToken, verificarRol(['administrador']), async (req, res) => {
  try {
    const result = await pool.query("SELECT id, to_char(fecha, 'DD-MM-YYYY HH24:MI') as fecha, usuario_email as usuario, accion, detalle, criticidad FROM auditoria ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (e) { res.status(500).json({error: 'Error'}); }
});
export default router;