import { Router } from 'express';
import pool from '../db';
import { verificarToken } from '../middleware/auth';
import bcrypt from 'bcrypt';

const router = Router();

// Obtener todos los pacientes
router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pacientes ORDER BY nombre_completo ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pacientes' });
  }
});

// Obtener un paciente específico
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pacientes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener paciente' });
  }
});

// Crear paciente nuevo
router.post('/', verificarToken, async (req: any, res: any) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { nombre_completo, rut, edad, prevision, telefono, email } = req.body;
    
    // 1. Crear en tabla pacientes (Ficha médica)
    const result = await client.query(
      'INSERT INTO pacientes (nombre_completo, rut, edad, prevision, telefono) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nombre_completo, rut, edad, prevision, telefono]
    );
    const nuevoPaciente = result.rows[0];

    // 2. SINCRONIZACIÓN: Crear cuenta de usuario automáticamente para "Gestión de usuarios"
    // Si el doc no le puso email al registrarlo, le inventamos uno temporal basado en su RUT
    const correoAsignado = email || `${rut.replace(/[^0-9kK]/g, '')}@cuidarte.cl`;
    const userExists = await client.query('SELECT * FROM perfiles WHERE email = $1', [correoAsignado]);
    
    if (userExists.rows.length === 0) {
      const salt = await bcrypt.genSalt(10);
      // La contraseña por defecto del paciente será su RUT
      const password_hash = await bcrypt.hash(rut, salt);
      await client.query(
        'INSERT INTO perfiles (nombre, email, password_hash, rol, activo) VALUES ($1, $2, $3, $4, $5)',
        [nombre_completo, correoAsignado, password_hash, 'paciente', true]
      );
    }

    // Auditoría
    await client.query("INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)",
      [req.user?.email || 'sistema', 'Creación de paciente', `Paciente ${nombre_completo} registrado en el sistema`, 'Media']
    ).catch(e => console.log(e));

    await client.query('COMMIT');
    res.status(201).json(nuevoPaciente);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al crear paciente' });
  } finally {
    client.release();
  }
});

// Editar paciente
router.put('/:id', verificarToken, async (req: any, res: any) => {
  try {
    const { nombre_completo, rut, edad, prevision, telefono } = req.body;
    const result = await pool.query(
      'UPDATE pacientes SET nombre_completo = $1, rut = $2, edad = $3, prevision = $4, telefono = $5 WHERE id = $6 RETURNING *',
      [nombre_completo, rut, edad, prevision, telefono, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    
    pool.query("INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)",
      [req.user?.email || 'sistema', 'Edición de paciente', `Datos de ${nombre_completo} actualizados`, 'Baja']
    ).catch(e => console.log(e));

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar paciente' });
  }
});

// Eliminar paciente
router.delete('/:id', verificarToken, async (req: any, res: any) => {
  try {
    const result = await pool.query('DELETE FROM pacientes WHERE id = $1 RETURNING nombre_completo', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });

    pool.query("INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)",
      [req.user?.email || 'sistema', 'Eliminación de paciente', `Paciente ${result.rows[0].nombre_completo} eliminado`, 'Alta']
    ).catch(e => console.log(e));

    res.json({ message: 'Paciente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'No se puede eliminar. Tiene exámenes asociados.' });
  }
});

export default router;