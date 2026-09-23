# Sistema de Gestión Clínica Cuidarte+ | API REST Backend

Este repositorio contiene el núcleo lógico e infraestructura de datos (Backend) para el sistema de gestión clínica Cuidarte+. Desarrollado bajo la pila tecnológica PERN (PostgreSQL, Express, React, Node.js), este servicio expone una API RESTful escalable, encargada de la persistencia de datos, la lógica de negocio, la interoperabilidad documental y el cumplimiento estricto de los estándares de seguridad requeridos por el centro de salud.

## 1. Arquitectura y Modelado Lógico

El sistema emplea un patrón de arquitectura orientada a servicios, separando claramente las capas de enrutamiento, controladores (lógica) y acceso a datos. 

Para resolver la interoperabilidad entre los usuarios del sistema y las fichas clínicas, se diseñó una **sincronización bidireccional transaccional**:
* Cuando un paciente se registra vía web, el motor de base de datos genera su credencial de acceso (`perfiles`) e inmediatamente instiga una inserción en la tabla `pacientes` con un RUT provisional matemáticamente válido, asegurando que su ficha clínica esté disponible en recepción.
* Cuando el personal médico registra a un paciente presencialmente, el sistema invierte el flujo, generando automáticamente las credenciales de acceso del paciente (utilizando su RUT cifrado como contraseña base).

## 2. Trazabilidad de Requisitos del Caso (RF y NFR)

El desarrollo de esta API responde directamente a los requerimientos funcionales y no funcionales del documento base:

### Requisitos de Seguridad Integrados (NFR-SEG)
* **NFR-SEG-2 (Cifrado de Credenciales):** Se implementó la librería `bcrypt` con un factor de trabajo (salt rounds) de 10. Ninguna contraseña transita o se almacena en texto plano. La validación se realiza mediante comparación de hashes.
* **NFR-SEG-9 (Gestión de Sesiones Stateless):** Se descartó el uso de sesiones en memoria. En su lugar, el sistema emite JSON Web Tokens (JWT) firmados con el algoritmo HMAC SHA-256. Esto previene ataques de suplantación y permite escalar la API sin dependencias de estado.
* **NFR-SEG (Auditoría Continua):** Se diseñó una tabla independiente `auditoria`. Cada mutación crítica en la base de datos (Ej: `DELETE` de un examen, `UPDATE` de un rol administrativo) gatilla una inserción en esta tabla, registrando el actor (correo del usuario extraído del JWT), la acción, el nivel de criticidad y la estampa de tiempo.

### Requisitos Funcionales (RF)
* **RF-1.1 & RF-2.1 (Autenticación y Registro):** Endpoints aislados en `/api/auth` con validación de existencia previa en base de datos para evitar duplicidad de correos o colisiones de llaves únicas (Unique Constraints).
* **RF-2.3 (Edición de Fichas):** Rutas `PUT /api/pacientes/:id` protegidas por middleware de verificación de roles.
* **RF-4.4 (Gestión Documental):** Integración de `multer` configurado con `DiskStorage` para la persistencia física de archivos PDF/DOCX. Además, se implementó `pdfkit` para la instanciación dinámica y al vuelo (Buffer) de informes institucionales en caso de que el médico no adjunte un archivo externo.

## 3. Estructura del Directorio

```text
src/
 ├── db/               # Configuración del pool de conexiones a PostgreSQL (NeonTech)
 ├── middleware/       # Interceptores de red (auth.ts para validación de JWT y extracción de payload)
 ├── routes/           # Definición de endpoints y controladores (auth, usuarios, pacientes, examenes)
 └── index.ts          # Punto de entrada de la aplicación, configuración de CORS y middlewares globales
4. Despliegue y Configuración
El sistema requiere la definición de un entorno virtual mediante un archivo .env ubicado en la raíz del proyecto:

Fragmento de código
PORT=3000
DATABASE_URL=postgres://[usuario]:[password]@[cluster].neon.tech/[bd]?sslmode=require
JWT_SECRET=[cadena_criptografica_segura]
Comandos de inicialización:

Bash
# 1. Instalación de dependencias (Express, pg, jsonwebtoken, bcrypt, pdfkit, multer)
npm install

# 2. Inicialización del servidor de desarrollo (con hot-reload vía ts-node-dev o nodemon)
npm run dev
