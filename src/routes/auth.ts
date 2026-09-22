import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db';

const router = Router();

// POST: Registro de usuario (Requisito RF-2.1)
router.post('/registro', async (req, res): Promise<any> => {
  try {
    const { nombre, email, password } = req.body;

    // Verificar si el correo ya existe
    const userExists = await pool.query('SELECT * FROM perfiles WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado' });
    }

    // Hashing de contraseña (Requisito NFR-SEG-2)
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insertar usuario con rol por defecto
    const newUser = await pool.query(
      'INSERT INTO perfiles (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, rol',
      [nombre, email, password_hash, 'paciente']
    );

    res.status(201).json({ 
      mensaje: 'Usuario registrado exitosamente', 
      usuario: newUser.rows[0] 
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error en el servidor al registrar usuario' });
  }
});

// POST: Inicio de sesión (Requisito RF-1.1)
router.post('/login', async (req, res): Promise<any> => {
  try {
    const { email, password } = req.body;

    // Buscar al usuario por correo
    const userResult = await pool.query('SELECT * FROM perfiles WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = userResult.rows[0];

    // Verificar si la cuenta está activa
    if (!user.activo) {
      return res.status(403).json({ error: 'Esta cuenta ha sido desactivada' });
    }

    // Validar contraseña
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar Token JWT (Requisito NFR-SEG-9)
    const token = jwt.sign(
      { id: user.id, rol: user.rol, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );

    res.json({ 
      token, 
      usuario: { id: user.id, nombre: user.nombre, rol: user.rol } 
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor al iniciar sesión' });
  }
});

export default router;