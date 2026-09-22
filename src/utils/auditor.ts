import pool from '../db';

export const registrarAuditoria = async (email: string, accion: string, detalle: string, criticidad: 'Alta' | 'Media' | 'Baja') => {
  try {
    await pool.query(
      'INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)',
      [email, accion, detalle, criticidad]
    );
  } catch (error) {
    console.error('Error registrando auditoría:', error);
  }
};