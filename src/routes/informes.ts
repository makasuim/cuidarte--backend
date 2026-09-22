import { Router, Response } from 'express';
import pool from '../db';
import { verificarToken, AuthRequest } from '../middleware/auth';
import PDFDocument from 'pdfkit';
import { registrarAuditoria } from '../utils/auditor';

const router = Router();

// GET: Descargar informe PDF autogenerado de un examen
router.get('/:examen_id/descargar', verificarToken, async (req: AuthRequest, res: Response): Promise<any> => {
  const { examen_id } = req.params;

  try {
    // 1. Obtener datos del examen cruzados con los del paciente
    const query = `
      SELECT e.*, p.nombre_completo, p.rut, p.edad, p.prevision
      FROM examenes e
      JOIN pacientes p ON e.paciente_id = p.id
      WHERE e.id = $1
    `;
    const result = await pool.query(query, [examen_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Examen no encontrado' });
    }

    const datos = result.rows[0];

    // 2. Configurar la respuesta como un archivo PDF descargable
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="informe_${datos.tipo_examen.replace(/\s+/g, '_')}.pdf"`);

    // 3. Crear el documento PDF
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res); // Enviar el flujo directamente al cliente (navegador)

    // --- DISEÑO DEL MEMBRETE ---
    doc.fontSize(22).font('Helvetica-Bold').text('Cuidarte+', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Centro de Salud y Exámenes Médicos', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(16).font('Helvetica-Bold').text('Informe de Examen Médico', { underline: true });
    doc.moveDown(1.5);

    // --- DATOS DEL PACIENTE ---
    doc.fontSize(12).font('Helvetica-Bold').text('Datos del Paciente:');
    doc.font('Helvetica').text(`Nombre: ${datos.nombre_completo}`);
    doc.text(`RUT: ${datos.rut}  |  Edad: ${datos.edad} años`);
    doc.text(`Previsión: ${datos.prevision || 'No registrada'}`);
    doc.moveDown(1.5);

    // --- DATOS DEL EXAMEN ---
    doc.fontSize(12).font('Helvetica-Bold').text('Detalles del Examen:');
    doc.font('Helvetica').text(`Tipo de Examen: ${datos.tipo_examen}`);
    doc.text(`Fecha de Realización: ${new Date(datos.fecha).toLocaleDateString('es-CL')}`);
    doc.text(`Médico Responsable: ${datos.medico_responsable}`);
    doc.text(`Estado Actual: ${datos.estado}`);
    doc.moveDown(1.5);

    // --- RESULTADOS ---
    doc.fontSize(12).font('Helvetica-Bold').text('Hallazgos y Resultados:');
    doc.font('Helvetica').text(datos.resultado || 'Sin resultados registrados aún.', { align: 'justify' });
    doc.moveDown(1);
    doc.font('Helvetica-Bold').text('Observaciones:');
    doc.font('Helvetica').text(datos.observaciones || 'Ninguna.', { align: 'justify' });

    // --- PIE DE PÁGINA ---
    doc.moveDown(4);
    doc.fontSize(9).fillColor('gray').text('Documento clínico generado automáticamente por la plataforma Cuidarte+.', { align: 'center' });
    doc.text(`Firma electrónica / ID de transacción: ${datos.id}`, { align: 'center' });

    // 4. Finalizar documento
    doc.end();

    // 5. Dejar rastro en auditoría de que se descargó un documento sensible
    await registrarAuditoria(req.user.email, 'Descarga de informe PDF', `Se autogeneró el informe del examen ID: ${examen_id}`, 'Baja');

  } catch (error) {
    console.error('Error generando PDF:', error);
    res.status(500).json({ error: 'Error al generar el documento' });
  }
});

export default router;