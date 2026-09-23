import { Router } from 'express';
import pool from '../db';
import { verificarToken } from '../middleware/auth';

const router = Router();

// 1. OBTENER SOLO MÉDICOS (Para el selector de la ficha)
router.get('/medicos', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre FROM perfiles WHERE rol = 'medico' AND activo = true ORDER BY nombre ASC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener médicos:", error);
    res.status(500).json({ error: 'Error al obtener los médicos' });
  }
});

// 2. OBTENER TODOS LOS USUARIOS (Para la tabla)
router.get('/', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre AS usuario, email AS correo, rol, activo FROM perfiles ORDER BY nombre ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// 3. CAMBIAR ESTADO (Activar / Desactivar switch)
router.put('/:id/estado', verificarToken, async (req: any, res: any) => {
  try {
    const { activo } = req.body;
    await pool.query('UPDATE perfiles SET activo = $1 WHERE id = $2', [activo, req.params.id]);
    
    pool.query("INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)",
      [req.user?.email || 'sistema', 'Cambio de estado', `Usuario ID ${req.params.id} cambiado a ${activo ? 'Activo' : 'Inactivo'}`, 'Media']
    ).catch(e => console.log("Auditoría ignorada", e));

    res.json({ message: 'Estado actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el estado' });
  }
});

// 4. CAMBIAR ROL (Sincronizado con la tabla de pacientes)
router.put('/:id/rol', verificarToken, async (req: any, res: any) => {
  try {
    const { rol } = req.body;
    
    // Obtener el nombre del usuario antes de actualizar
    const userRes = await pool.query('SELECT nombre FROM perfiles WHERE id = $1', [req.params.id]);
    const nombreUsuario = userRes.rows[0]?.nombre;

    // Actualizar el rol
    await pool.query('UPDATE perfiles SET rol = $1 WHERE id = $2', [rol, req.params.id]);
    
    // SINCRONIZACIÓN: Si el nuevo rol NO es paciente, borramos su ficha médica vacía
    if (rol !== 'paciente' && nombreUsuario) {
      await pool.query('DELETE FROM pacientes WHERE nombre_completo = $1', [nombreUsuario])
        .catch(e => console.log("No se borró la ficha porque ya tiene exámenes asociados", e));
    }

    pool.query("INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)",
      [req.user?.email || 'sistema', 'Cambio de Rol', `Se cambió el rol del usuario ID ${req.params.id} a ${rol}`, 'Alta']
    ).catch(e => console.log("Auditoría ignorada", e));

    res.json({ message: 'Rol actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el rol' });
  }
});

// 5. ELIMINAR USUARIO (Sincronizado con la tabla de pacientes)
router.delete('/:id', verificarToken, async (req: any, res: any) => {
  try {
    // Obtener el nombre antes de borrar
    const userRes = await pool.query('SELECT nombre FROM perfiles WHERE id = $1', [req.params.id]);
    const nombreUsuario = userRes.rows[0]?.nombre;

    await pool.query('DELETE FROM perfiles WHERE id = $1', [req.params.id]);
    
    // Si se borra la cuenta del sistema, se borra su ficha médica vacía
    if (nombreUsuario) {
      await pool.query('DELETE FROM pacientes WHERE nombre_completo = $1', [nombreUsuario])
        .catch(e => console.log("Ficha conservada por historial médico", e));
    }

    pool.query("INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)",
      [req.user?.email || 'sistema', 'Eliminación de usuario', `Usuario ID ${req.params.id} eliminado del sistema`, 'Alta']
    ).catch(e => console.log("Auditoría ignorada", e));

    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'No se puede eliminar. El usuario tiene registros asociados.' });
  }
});

export default router;