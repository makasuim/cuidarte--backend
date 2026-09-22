import { Router } from 'express';
import pool from '../db';
import { verificarToken } from '../middleware/auth';

const router = Router();

router.post('/', verificarToken, async (req: any, res: any) => {
  try {
    const { rut, nombre_completo, edad, telefono, correo, prevision } = req.body;
    
    // Evita errores si la edad o teléfono vienen vacíos
    const edadNum = edad ? parseInt(edad) : null;
    
    const result = await pool.query(
      'INSERT INTO pacientes (rut, nombre_completo, edad, telefono, correo, prevision) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [rut, nombre_completo, edadNum, telefono, correo, prevision]
    );
    
    // Registrar auditoría de forma segura (sin que rompa el guardado si falla)
    try {
      await pool.query(
        "INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)",
        [req.user?.email || 'sistema', 'Registro de paciente', `Paciente ${nombre_completo} registrado`, 'Media']
      );
    } catch(e) { console.log("Error en auditoría (ignorado)"); }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error BD Pacientes:", error);
    res.status(500).json({ error: 'Error al guardar el paciente. Verifica que el RUT no esté repetido.' });
  }
});

router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pacientes ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pacientes' });
  }
});

router.get('/:id', verificarToken, async (req: any, res: any) => {
  try {
    const result = await pool.query('SELECT * FROM pacientes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;