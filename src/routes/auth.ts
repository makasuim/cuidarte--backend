import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db';

const router = Router();

// POST: Registro de usuario 
router.post('/registro', async (req, res): Promise<any> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { nombre, email, password } = req.body;

    const userExists = await client.query('SELECT * FROM perfiles WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 1. Crear el usuario en el sistema
    const newUser = await client.query(
      'INSERT INTO perfiles (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, rol',
      [nombre, email, password_hash, 'paciente']
    );

let cuerpoRut = '';
    for (let i = 0; i < 8; i++) {
      cuerpoRut += Math.floor(Math.random() * 9) + 1; // Números aleatorios del 1 al 9
    }
    const opcionesDV = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'K'];
    const dvRandom = opcionesDV[Math.floor(Math.random() * opcionesDV.length)];
    
    const rutProvisional = `${cuerpoRut}-${dvRandom}`;

    // 3. SINCRONIZACIÓN: Crear ficha médica vacía en la tabla 'pacientes' automáticamente
    await client.query(
      'INSERT INTO pacientes (nombre_completo, rut, edad, prevision, telefono) VALUES ($1, $2, $3, $4, $5)',
      [nombre, rutProvisional, 0, 'Ninguna', 'No registrado']
    );

    // Auditoría
    await client.query("INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)",
      [email, 'Registro de usuario', `Nuevo paciente registrado desde formulario web`, 'Baja']
    ).catch(e => console.log(e));

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Usuario registrado exitosamente', usuario: newUser.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error en el servidor al registrar usuario' });
  } finally {
    client.release();
  }
});

// POST: Inicio de sesión
router.post('/login', async (req, res): Promise<any> => {
  try {
    const { email, password } = req.body;

    const userResult = await pool.query('SELECT * FROM perfiles WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = userResult.rows[0];

    if (!user.activo) {
      return res.status(403).json({ error: 'Esta cuenta ha sido desactivada' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, rol: user.rol, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );

    res.json({ token, usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol } });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor al iniciar sesión' });
  }
});

export default router;