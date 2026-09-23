import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { verificarToken } from '../middleware/auth';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const router = Router();

// --- 1. CONFIGURACIÓN DE STORAGE INTERNO ---
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'doc-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

const COLOR_PRIMARIO = '#0f172a'; 
const COLOR_ACENTO = '#0d9488';   
const COLOR_TEXTO = '#334155';
const COLOR_TEXTO_SUAVE = '#64748b';
const COLOR_BORDE = '#e2e8f0';
const COLOR_FONDO_TABLA = '#f8fafc';

function generarHashValidacion(): string {
  const base = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  return `${base.slice(0, 4)}-${base.slice(4, 8)}-${base.slice(8, 12)}`;
}

// --- NUEVO: OBTENER ESTADÍSTICAS PARA EL DASHBOARD ---
router.get('/stats/dashboard', verificarToken, async (req, res) => {
  try {
    const pacientesRes = await pool.query('SELECT COUNT(*) FROM pacientes');
    const examenesRes = await pool.query("SELECT COUNT(*) FROM examenes WHERE estado != 'Eliminado'");
    const pendientesRes = await pool.query("SELECT COUNT(*) FROM examenes WHERE estado = 'Pendiente' AND estado != 'Eliminado'");

    res.json({
      pacientes: parseInt(pacientesRes.rows[0].count),
      examenesTotal: parseInt(examenesRes.rows[0].count),
      examenesPendientes: parseInt(pendientesRes.rows[0].count)
    });
  } catch (error) {
    console.error("Error al obtener estadísticas:", error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// 2. CREAR EXAMEN 
router.post('/', verificarToken, upload.single('archivo'), async (req: any, res: any) => {
  try {
    const { paciente_id, tipo_examen, fecha, estado, medico_responsable, resultado, observaciones } = req.body;
    let archivo_nombre = null;

    if (req.file) {
      archivo_nombre = req.file.filename;
    }

    const result = await pool.query(
      'INSERT INTO examenes (paciente_id, tipo_examen, fecha, estado, medico_responsable, resultado, observaciones, archivo_nombre, archivo_datos) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL) RETURNING *',
      [paciente_id, tipo_examen, fecha, estado, medico_responsable, resultado, observaciones, archivo_nombre]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error al guardar examen:", error);
    res.status(500).json({ error: 'Error al guardar el examen' });
  }
});

// 3. OBTENER EXÁMENES (Ignorando borrados lógicamente)
router.get('/paciente/:id', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, paciente_id, tipo_examen, fecha, estado, medico_responsable, resultado, observaciones, archivo_nombre FROM examenes WHERE paciente_id = $1 AND estado != 'Eliminado' ORDER BY fecha DESC", 
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener exámenes' });
  }
});

// 4. DESCARGAR DOCUMENTO O GENERAR PDF INSTITUCIONAL
router.get('/:id/descargar', verificarToken, async (req: any, res: any) => {
  try {
    const result = await pool.query(
      'SELECT e.*, p.nombre_completo, p.rut, p.edad, p.prevision, p.telefono FROM examenes e JOIN pacientes p ON e.paciente_id = p.id WHERE e.id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Examen no encontrado' });

    const examen = result.rows[0];

    if (examen.archivo_nombre) {
      const filePath = path.join(uploadDir, examen.archivo_nombre);
      if (fs.existsSync(filePath)) {
        return res.download(filePath, examen.archivo_nombre);
      }
      if (examen.archivo_datos) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${examen.archivo_nombre}"`);
        return res.send(examen.archivo_datos);
      }
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="informe_${examen.tipo_examen.replace(/\s+/g, '_')}.pdf"`);
    doc.pipe(res);

    const folio = `IMG-2026-${String(examen.id).padStart(6, '0')}`;
    const fechaEmision = new Date().toLocaleDateString('es-CL');
    const horaEmision = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const fechaEstudio = new Date(examen.fecha).toLocaleDateString('es-CL', { timeZone: 'UTC' });
    const hashValidacion = generarHashValidacion();

    const PAGE_WIDTH = doc.page.width;
    const MARGIN = 40;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

    function dibujarCabecera() {
      doc.rect(MARGIN, 30, 75, 45).fillAndStroke(COLOR_PRIMARIO, COLOR_PRIMARIO);
      doc.fillColor('#fbbf24').fontSize(13).font('Helvetica-Bold').text('Duoc', MARGIN + 8, 38);
      doc.fillColor('#ffffff').fontSize(13).text('UC', MARGIN + 40, 38);

      doc.fillColor(COLOR_PRIMARIO).fontSize(13).font('Helvetica-Bold')
        .text('Centro de Salud Cuidarte+', MARGIN + 90, 32, { continued: false });

      doc.fontSize(8.5).fillColor(COLOR_TEXTO).font('Helvetica');
      doc.text('Unidad de Laboratorio e Imagenología clínica · Av. Vicuña Mackenna 1234, Santiago', MARGIN + 90, 48);
      doc.text('Convenio docente asistencial Duoc UC · Sede Plaza Oeste · +56 2 2345 6789', MARGIN + 90, 60);

      doc.fontSize(8.5).fillColor(COLOR_TEXTO_SUAVE).font('Helvetica-Bold')
        .text(`Folio ${folio}`, MARGIN, 32, { width: CONTENT_WIDTH, align: 'right' });

      doc.rect(MARGIN, 80, CONTENT_WIDTH, 3).fill(COLOR_ACENTO);
      doc.y = 95;
    }

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

    doc.moveDown(0.5);
    doc.fontSize(14).fillColor(COLOR_PRIMARIO).font('Helvetica-Bold')
      .text(`Informe clínico — ${examen.tipo_examen}`, MARGIN, doc.y, { width: CONTENT_WIDTH });

    doc.fontSize(9).fillColor(COLOR_TEXTO_SUAVE).font('Helvetica')
      .text(`Documento emitido el ${fechaEmision} · ${horaEmision} h · Estudio realizado: ${fechaEstudio}`, MARGIN, doc.y + 2);

    doc.moveDown(1);

    const startY = doc.y;
    const boxHeight = 80;
    doc.rect(MARGIN, startY, CONTENT_WIDTH, boxHeight).fillAndStroke(COLOR_FONDO_TABLA, COLOR_BORDE);

    const colIzqLabelX = MARGIN + 12;
    const colIzqValorX = MARGIN + 95;
    const colDerLabelX = MARGIN + 275;
    const colDerValorX = MARGIN + 350;

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

    tituloSeccion('Resultados e Impresión Diagnóstica', 250);
    doc.fontSize(10).fillColor(COLOR_TEXTO).font('Helvetica')
      .text(examen.resultado || 'Sin resultados clínicos registrados en el sistema.', MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'justify', lineGap: 4 });
    doc.moveDown(1.2);

    tituloSeccion('Observaciones adicionales', 220);
    doc.fontSize(10).fillColor(COLOR_TEXTO).font('Helvetica')
      .text(examen.observaciones || 'Ninguna observación registrada.', MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'justify', lineGap: 4 });
    doc.moveDown(2);

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

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      dibujarPie(i - range.start + 1, range.count);
    }

    doc.end();
  } catch (error) {
    console.error("Error al generar PDF:", error);
    res.status(500).json({ error: 'Error al generar el documento PDF' });
  }
});

// 5. ELIMINAR EXAMEN (Borrado lógico)
router.delete('/:id', verificarToken, async (req: any, res: any) => {
  try {
    await pool.query("UPDATE examenes SET estado = 'Eliminado' WHERE id = $1", [req.params.id]);
    
    pool.query("INSERT INTO auditoria (usuario_email, accion, detalle, criticidad) VALUES ($1, $2, $3, $4)",
      [req.user?.email || 'sistema', 'Eliminación lógica de examen', `Examen ID ${req.params.id} marcado como eliminado`, 'Media']
    ).catch(e => console.log("Auditoría ignorada", e));

    res.json({ message: 'Examen eliminado lógicamente del sistema' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;