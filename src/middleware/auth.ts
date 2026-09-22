import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export interface AuthRequest extends Request {
  user?: any;
}

export const verificarToken = (req: AuthRequest, res: Response, next: NextFunction): any => {
  const token = req.header('Authorization')?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. No hay token provisto.' });
  }

  try {
    const decodificado = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decodificado;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Token inválido.' });
  }
};

export const verificarRol = (rolesPermitidos: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): any => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado. Permisos insuficientes.' });
    }
    next();
  };
};