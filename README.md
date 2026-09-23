# Cuidarte+ | Backend (API REST)

Este repositorio contiene la API REST para Cuidarte+, una plataforma de gestión clínica integral. El sistema está construido con Node.js y Express, utilizando una base de datos PostgreSQL alojada en NeonTech. Su arquitectura gestiona la autenticación de usuarios, el control de roles, el almacenamiento seguro de documentos clínicos y la generación dinámica de informes médicos.

## Tecnologías Utilizadas

* **Entorno:** Node.js con TypeScript
* **Framework:** Express.js
* **Base de Datos:** PostgreSQL (NeonTech) / `pg`
* **Autenticación:** JSON Web Tokens (JWT) y `bcrypt`
* **Manejo de Archivos:** `multer` (Disk Storage para adjuntos clínicos)
* **Generación de Documentos:** `pdfkit` (Informes institucionales dinámicos)

## Funcionalidades Principales

* **Sincronización Bidireccional:** Creación automática de fichas médicas al registrar un usuario y generación de credenciales de acceso al ingresar un paciente de forma presencial.
* **Control de Acceso Basado en Roles (RBAC):** Middleware de seguridad para restringir rutas según el nivel de privilegios (Administrador, Médico, Paciente).
* **Gestión de Archivos:** Subida de exámenes clínicos y generación automática de informes en formato PDF institucional en caso de no adjuntar archivos externos.
* **Auditoría y Trazabilidad:** Registro continuo de acciones críticas en el sistema (cambios de estado, alteraciones de rol, eliminación de registros).
* **Eliminación Lógica y Física:** Borrado seguro de registros garantizando la integridad referencial y preservando el historial médico cuando corresponda.

## Configuración de Entorno

Se requiere crear un archivo `.env` en el directorio raíz del proyecto con la siguiente estructura:

```env
PORT=3000
DATABASE_URL=postgres://usuario:password@host_neon.tech/nombre_bd?sslmode=require
JWT_SECRET=clave_secreta_jwt
