import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pool from '../db';
import { verificarToken } from '../middleware/auth';
import multer from 'multer';
import PDFDocument from 'pdfkit';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- LOGO INSTITUCIONAL ---
// Se busca en la raíz del proyecto: assets/duoc-logo.png
// (se intentan un par de rutas por si el server corre desde /dist o /src)
//
// pdfkit SOLO acepta PNG (no interlazado) o JPEG. Si el archivo tiene otra
// extensión falsa, está corrupto, es interlazado o viene en otro formato
// (webp, avif, svg, etc. renombrado a .png), pdfkit revienta con
// "Unknown image format". Por eso acá no basta con que el archivo exista:
// se valida la firma binaria real del archivo antes de confiar en él.
function esPNGValido(buffer: Buffer): boolean {
  // Firma estándar de PNG: 89 50 4E 47 0D 0A 1A 0A
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(firma)) return false;

  // Chequeo adicional: pdfkit no soporta PNG interlazado (Adam7).
  // El byte de interlace está en el chunk IHDR, offset 28 (0-indexed).
  const metodoInterlace = buffer[28];
  if (metodoInterlace === 1) {
    console.warn('[PDF] duoc-logo.png es un PNG interlazado (Adam7): pdfkit no lo soporta. Reexporta la imagen sin interlace.');
    return false;
  }
  return true;
}

function esJPEGValido(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function resolverLogoPath(): string | null {
  const candidatos = [
    path.join(process.cwd(), 'assets', 'duoc-logo.png'),
    path.join(__dirname, '..', '..', 'assets', 'duoc-logo.png'),
    path.join(__dirname, '..', 'assets', 'duoc-logo.png'),
  ];
  for (const candidato of candidatos) {
    if (!fs.existsSync(candidato)) continue;
    try {
      const buffer = fs.readFileSync(candidato);
      if (esPNGValido(buffer) || esJPEGValido(buffer)) {
        return candidato;
      }
      console.warn(`[PDF] El archivo ${candidato} existe pero no es un PNG/JPEG válido para pdfkit. Se usará el logo vectorial de respaldo.`);
    } catch (e) {
      console.warn(`[PDF] No se pudo leer ${candidato}:`, e);
    }
  }
  return null;
}
const LOGO_PATH = resolverLogoPath();

// Colores institucionales (mismos que el informe de muestra)
const COLOR_PRIMARIO = '#0f172a'; // azul oscuro cabecera / títulos
const COLOR_ACENTO = '#0d9488';   // franja teal bajo la cabecera
const COLOR_TEXTO = '#334155';
const COLOR_TEXTO_SUAVE = '#64748b';
const COLOR_BORDE = '#e2e8f0';
const COLOR_FONDO_TABLA = '#f8fafc';
const COLOR_FONDO_ENCABEZADO_TABLA = '#0f172a';

function generarHashValidacion(examenId: string | number): string {
  // Hash de validación simulado (formato similar al informe de muestra: XXXX-XXXX-XXXX)
  const base = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  return `${base.slice(0, 4)}-${base.slice(4, 8)}-${base.slice(8, 12)}`;
}

// Crear examen (soporta archivo adjunto)
router.post('/', verificarToken, upload.single('archivo'), async (req: any, res: any) => {
  try {
    const { paciente_id, tipo_examen, fecha, estado, medico_responsable, resultado, observaciones } = req.body;
    let archivo_nombre = null;
    let archivo_datos = null;

    if (req.file) {
      archivo_nombre = req.file.originalname;
      archivo_datos = req.file.buffer;
    }

    const result = await pool.query(
      'INSERT INTO examenes (paciente_id, tipo_examen, fecha, estado, medico_responsable, resultado, observaciones, archivo_nombre, archivo_datos) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [paciente_id, tipo_examen, fecha, estado, medico_responsable, resultado, observaciones, archivo_nombre, archivo_datos]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error al guardar examen:", error);
    res.status(500).json({ error: 'Error al guardar el examen' });
  }
});

// Obtener exámenes de un paciente
router.get('/paciente/:id', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, paciente_id, tipo_examen, fecha, estado, medico_responsable, resultado, observaciones, archivo_nombre FROM examenes WHERE paciente_id = $1 ORDER BY fecha DESC', [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener exámenes' });
  }
});

// DESCARGAR O GENERAR EL PDF INSTITUCIONAL
router.get('/:id/descargar', verificarToken, async (req: any, res: any) => {
  try {
    const result = await pool.query(
      'SELECT e.*, p.nombre_completo, p.rut, p.edad, p.prevision, p.telefono FROM examenes e JOIN pacientes p ON e.paciente_id = p.id WHERE e.id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Examen no encontrado' });

    const examen = result.rows[0];

    // Si hay un PDF real adjunto, se devuelve directo
    if (examen.archivo_datos) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${examen.archivo_nombre}"`);
      return res.send(examen.archivo_datos);
    }

    // Generar PDF institucional con PDFKit, estilo "informe de imagenología".
    //
    // IMPORTANTE: en vez de hacer doc.pipe(res) y escribir directo a la
    // respuesta HTTP, armamos el PDF completo en memoria (buffer) y recién
    // al final —si todo salió bien— seteamos headers y respondemos.
    // Así, si algo falla a mitad de la generación (ej. una imagen corrupta),
    // nunca queda la respuesta HTTP a medio escribir (evita el error
    // "write after end" / "ERR_STREAM_WRITE_AFTER_END").
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const pdfListo = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const folio = `IMG-2026-${String(examen.id).padStart(6, '0')}`;
    const fechaEmision = new Date().toLocaleDateString('es-CL');
    const horaEmision = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const fechaEstudio = new Date(examen.fecha).toLocaleDateString('es-CL', { timeZone: 'UTC' });
    const hashValidacion = generarHashValidacion(examen.id);

    const PAGE_WIDTH = doc.page.width;
    const MARGIN = 40;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

    // --- FUNCIÓN PARA DIBUJAR LA CABECERA INSTITUCIONAL (se repite en cada página) ---
    function dibujarCabecera() {
      // Logo real de Duoc UC si existe y es válido; si no (o si por algún
      // motivo pdfkit igual no puede decodificarlo), se usa el logo
      // vectorial de respaldo en vez de tirar abajo toda la generación.
      let logoDibujado = false;
      if (LOGO_PATH) {
        try {
          doc.image(LOGO_PATH, MARGIN, 30, { width: 75 });
          logoDibujado = true;
        } catch (e) {
          console.warn('[PDF] Falló doc.image() con el logo real, se usa el logo de respaldo:', e);
        }
      }
      if (!logoDibujado) {
        doc.rect(MARGIN, 30, 75, 45).fillAndStroke(COLOR_PRIMARIO, COLOR_PRIMARIO);
        doc.fillColor('#fbbf24').fontSize(14).font('Helvetica-Bold').text('Duoc', MARGIN + 8, 37);
        doc.fillColor('#ffffff').fontSize(14).text('UC', MARGIN + 38, 37);
      }

      doc.fillColor(COLOR_PRIMARIO).fontSize(13).font('Helvetica-Bold')
        .text('Centro de Salud Cuidarte+', MARGIN + 90, 32, { continued: false });

      doc.fontSize(8.5).fillColor(COLOR_TEXTO).font('Helvetica');
      doc.text('Unidad de Laboratorio e Imagenología clínica · Av. Vicuña Mackenna 1234, Santiago', MARGIN + 90, 48);
      doc.text('Convenio docente asistencial Duoc UC · Sede Plaza Oeste · +56 2 2345 6789', MARGIN + 90, 60);

      doc.fontSize(8.5).fillColor(COLOR_TEXTO_SUAVE).font('Helvetica-Bold')
        .text(`Folio ${folio}`, MARGIN, 32, { width: CONTENT_WIDTH, align: 'right' });

      // Franja de color bajo la cabecera (igual que el informe de muestra)
      doc.rect(MARGIN, 80, CONTENT_WIDTH, 3).fill(COLOR_ACENTO);
      doc.y = 95;
    }

    // --- FUNCIÓN PARA DIBUJAR EL PIE DE PÁGINA ---
    function dibujarPie(numeroPagina: number, totalPaginas: number) {
      doc.fontSize(7.5).fillColor(COLOR_TEXTO_SUAVE).font('Helvetica');
      doc.text(
        'Documento clínico generado por la plataforma Cuidarte+. Válido con firma del profesional responsable.',
        MARGIN, 770, { width: CONTENT_WIDTH, align: 'center' }
      );
      doc.text(
        `Proyecto académico Duoc UC · Escuela de Informática y Telecomunicaciones — Página ${numeroPagina} de ${totalPaginas} · Folio ${folio}`,
        MARGIN, 781, { width: CONTENT_WIDTH, align: 'center' }
      );
    }

    dibujarCabecera();

    // --- TÍTULO Y SUBTÍTULO ---
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor(COLOR_PRIMARIO).font('Helvetica-Bold')
      .text(`Informe clínico — ${examen.tipo_examen}`, MARGIN, doc.y, { width: CONTENT_WIDTH });

    doc.fontSize(9).fillColor(COLOR_TEXTO_SUAVE).font('Helvetica')
      .text(`Documento emitido el ${fechaEmision} · ${horaEmision} h · Estudio realizado: ${fechaEstudio}`, MARGIN, doc.y + 2);

    doc.moveDown(1);

    // --- BLOQUE DE DATOS DEL PACIENTE Y DEL EXAMEN (dos columnas, como el informe de muestra) ---
    const startY = doc.y;
    const boxHeight = 80;
    doc.rect(MARGIN, startY, CONTENT_WIDTH, boxHeight).fillAndStroke(COLOR_FONDO_TABLA, COLOR_BORDE);

    const colIzqLabelX = MARGIN + 12;
    const colIzqValorX = MARGIN + 95;
    const colDerLabelX = MARGIN + 275;
    const colDerValorX = MARGIN + 400; // antes 350: "Médico solicitante" no cabía en una línea y se montaba con la fila de abajo

    function filaDato(label: string, valor: string, x1: number, x2: number, y: number) {
      doc.fillColor(COLOR_PRIMARIO).fontSize(9).font('Helvetica-Bold').text(label, x1, y, { width: x2 - x1 - 4 });
      doc.fillColor(COLOR_TEXTO).font('Helvetica').text(valor || 'No registrado', x2, y, { width: MARGIN + CONTENT_WIDTH - x2 - 10 });
    }

    filaDato('Paciente', examen.nombre_completo, colIzqLabelX, colIzqValorX, startY + 10);
    filaDato('Examen', examen.tipo_examen, colDerLabelX, colDerValorX, startY + 10);

    filaDato('RUT', examen.rut, colIzqLabelX, colIzqValorX, startY + 27);
    filaDato('Médico solicitante', examen.medico_responsable, colDerLabelX, colDerValorX, startY + 27);

    filaDato('Edad', examen.edad ? `${examen.edad} años` : 'No registrada', colIzqLabelX, colIzqValorX, startY + 44);
    filaDato('Estado', examen.estado, colDerLabelX, colDerValorX, startY + 44);

    filaDato('Previsión', examen.prevision, colIzqLabelX, colIzqValorX, startY + 61);
    filaDato('Teléfono', examen.telefono, colDerLabelX, colDerValorX, startY + 61);

    doc.y = startY + boxHeight + 20;

    function tituloSeccion(texto: string, anchoLinea: number) {
      doc.fontSize(11).fillColor(COLOR_PRIMARIO).font('Helvetica-Bold').text(texto, MARGIN, doc.y);
      const yLinea = doc.y + 2;
      doc.moveTo(MARGIN, yLinea).lineTo(MARGIN + anchoLinea, yLinea).strokeColor(COLOR_ACENTO).lineWidth(1.5).stroke();
      doc.moveDown(0.8);
    }

    // --- RESULTADOS CLÍNICOS ---
    tituloSeccion('Resultados e Impresión Diagnóstica', 250);
    doc.fontSize(10).fillColor(COLOR_TEXTO).font('Helvetica')
      .text(examen.resultado || 'Sin resultados clínicos registrados en el sistema.', MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'justify', lineGap: 4 });
    doc.moveDown(1.2);

    // --- OBSERVACIONES ---
    tituloSeccion('Observaciones adicionales', 220);
    doc.fontSize(10).fillColor(COLOR_TEXTO).font('Helvetica')
      .text(examen.observaciones || 'Ninguna observación registrada.', MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'justify', lineGap: 4 });
    doc.moveDown(2);

    // --- FIRMA Y VALIDACIÓN ELECTRÓNICA (mismo formato que el informe de muestra) ---
    let firmaY = doc.y;
    if (firmaY > 680) {
      doc.addPage();
      dibujarCabecera();
      firmaY = doc.y + 20;
    } else {
      firmaY = Math.max(firmaY, 680);
    }

    const colFirmaX = MARGIN;
    const colValidacionX = MARGIN + 280;

    doc.moveTo(colFirmaX, firmaY).lineTo(colFirmaX + 220, firmaY).strokeColor('#94a3b8').lineWidth(1).stroke();
    doc.fontSize(9.5).fillColor(COLOR_PRIMARIO).font('Helvetica-Bold')
      .text(examen.medico_responsable || 'Equipo Médico Cuidarte+', colFirmaX, firmaY + 6, { width: 220 });
    doc.fontSize(8).fillColor(COLOR_TEXTO_SUAVE).font('Helvetica')
      .text('Médico Tratante / Validador', colFirmaX, firmaY + 20, { width: 220 });

    doc.fontSize(9.5).fillColor(COLOR_PRIMARIO).font('Helvetica-Bold')
      .text('Validación electrónica', colValidacionX, firmaY - 12, { width: 220 });
    doc.fontSize(8).fillColor(COLOR_TEXTO_SUAVE).font('Helvetica')
      .text(`Firmado electrónicamente el ${fechaEmision} · Hash ${hashValidacion}`, colValidacionX, firmaY + 6, { width: 220 });

    // --- PIE DE PÁGINA EN TODAS LAS PÁGINAS ---
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      dibujarPie(i - range.start + 1, range.count);
    }

    doc.end();

    // Recién acá, con el PDF ya completo en memoria, respondemos.
    const pdfBuffer = await pdfListo;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="informe_${examen.tipo_examen.replace(/\s+/g, '_')}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error al generar PDF:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar el documento PDF' });
    }
  }
});

// Eliminar examen
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM examenes WHERE id = $1', [req.params.id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;