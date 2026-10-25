/**
 * Genera el PDF del checklist de ingreso vehicular sin depender de una
 * plantilla externa: lo arma desde cero con PDFKit.
 *
 * Antes el modulo exigia un PDF editable en backend/templates; si no existia,
 * la descarga fallaba con error 500. Ahora la plantilla es opcional y este
 * generador es el camino por defecto.
 */
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

// Paleta Horizon Autos (negro, azul electrico y cromo)
const COLOR_FONDO = '#0d1117';
const COLOR_AZUL = '#2f80d9';
const COLOR_AZUL_OSCURO = '#17508f';
const COLOR_TEXTO = '#1f2937';
const COLOR_TEXTO_SUAVE = '#6b7280';
const COLOR_LINEA = '#e5e7eb';
const COLOR_OK = '#15803d';
const COLOR_MAL = '#b91c1c';

const MARGEN = 40;
const ANCHO_UTIL = 595.28 - MARGEN * 2;

export interface ChecklistPdfItem {
  key?: string;
  label?: string;
  category?: string;
  status?: string;
  observaciones?: string;
  responsable?: string;
  porcentajeEstado?: number | null;
  tipoTransmision?: string;
}

export interface ChecklistPdfZone {
  key?: string;
  label?: string;
  status?: string;
  observaciones?: string;
  responsable?: string;
}

export interface ChecklistPdfInput {
  vehicle: {
    placa?: string;
    marca?: string;
    modelo?: string;
    color?: string;
    [key: string]: any;
  };
  checklist: {
    inspectorName?: string;
    inspectionDate?: Date | string;
    deliveredByName?: string;
    deliveredBySignature?: string;
    items?: ChecklistPdfItem[];
    damageZones?: ChecklistPdfZone[];
    generalObservations?: string;
    updatedAt?: Date | string;
  };
  /** Resumen redactado por IA (opcional, si esta disponible). */
  resumen?: string;
}

const texto = (valor: unknown): string => {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
};

const formatearFecha = (valor?: Date | string): string => {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatearFechaHora = (valor?: Date | string): string => {
  const fecha = valor ? new Date(valor) : new Date();
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
};

/** Logo de la marca, si esta disponible en backend/templates o backend/assets. */
const buscarLogo = (): string | null => {
  const candidatos = [
    path.join(__dirname, '../../templates/horizon-logo.png'),
    path.join(__dirname, '../../assets/horizon-logo.png'),
  ];

  for (const ruta of candidatos) {
    if (fs.existsSync(ruta)) return ruta;
  }
  return null;
};

/** La firma llega como data URL desde el canvas del navegador. */
const firmaABuffer = (firma?: string): Buffer | null => {
  const valor = texto(firma);
  if (!valor.startsWith('data:image/')) return null;

  const base64 = valor.split(',')[1];
  if (!base64) return null;

  try {
    return Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
};

const agruparPorCategoria = (items: ChecklistPdfItem[]): Map<string, ChecklistPdfItem[]> => {
  const grupos = new Map<string, ChecklistPdfItem[]>();

  for (const item of items) {
    const categoria = texto(item.category) || 'GENERAL';
    const lista = grupos.get(categoria) ?? [];
    lista.push(item);
    grupos.set(categoria, lista);
  }

  return grupos;
};

export const buildChecklistPdfBuffer = async (entrada: ChecklistPdfInput): Promise<Buffer> => {
  const { vehicle, checklist } = entrada;
  const items = Array.isArray(checklist.items) ? checklist.items : [];
  const zonas = Array.isArray(checklist.damageZones) ? checklist.damageZones : [];

  const itemsBien = items.filter((i) => i.status === 'bien').length;
  const itemsMal = items.length - itemsBien;
  const zonasBien = zonas.filter((z) => z.status === 'bien').length;
  const zonasMal = zonas.length - zonasBien;

  const doc = new PDFDocument({ size: 'A4', margin: MARGEN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const terminado = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  /* ---------------------------------------------------------------- *
   * Encabezado
   * ---------------------------------------------------------------- */
  doc.rect(0, 0, 595.28, 92).fill(COLOR_FONDO);

  const logo = buscarLogo();
  let xTexto = MARGEN;
  if (logo) {
    try {
      doc.image(logo, MARGEN, 20, { fit: [52, 52] });
      xTexto = MARGEN + 64;
    } catch {
      // Si el logo no se puede leer, el encabezado sigue sin el
    }
  }

  doc
    .fillColor('#ffffff')
    .fontSize(17)
    .font('Helvetica-Bold')
    .text('HORIZON AUTOS', xTexto, 26);

  doc
    .fillColor(COLOR_AZUL)
    .fontSize(11)
    .font('Helvetica')
    .text('Checklist de ingreso vehicular', xTexto, 48);

  doc
    .fillColor('#9ca3af')
    .fontSize(8)
    .text(`Generado el ${formatearFechaHora()}`, xTexto, 64);

  const placa = texto(vehicle.placa).toUpperCase();
  if (placa) {
    doc
      .fillColor('#ffffff')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(placa, 595.28 - MARGEN - 150, 34, { width: 150, align: 'right' });
  }

  doc.y = 112;

  /* ---------------------------------------------------------------- *
   * Datos del vehiculo y de la inspeccion
   * ---------------------------------------------------------------- */
  const datos: Array<[string, string]> = [
    ['Marca', texto(vehicle.marca)],
    ['Modelo', texto(vehicle.modelo)],
    ['Año', texto(vehicle['año'] ?? vehicle.anio)],
    ['Color', texto(vehicle.color)],
    ['Inspector', texto(checklist.inspectorName)],
    ['Fecha de inspección', formatearFecha(checklist.inspectionDate)],
    ['Quien entrega', texto(checklist.deliveredByName)],
  ];

  const yInicio = doc.y;
  const anchoColumna = ANCHO_UTIL / 2;

  datos.forEach(([etiqueta, valor], indice) => {
    const columna = indice % 2;
    const fila = Math.floor(indice / 2);
    const x = MARGEN + columna * anchoColumna;
    const y = yInicio + fila * 26;

    doc.fillColor(COLOR_TEXTO_SUAVE).fontSize(8).font('Helvetica').text(etiqueta.toUpperCase(), x, y);
    doc
      .fillColor(COLOR_TEXTO)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(valor || '—', x, y + 10, { width: anchoColumna - 12 });
  });

  doc.y = yInicio + Math.ceil(datos.length / 2) * 26 + 8;

  /* ---------------------------------------------------------------- *
   * Resumen
   * ---------------------------------------------------------------- */
  const yResumen = doc.y;
  const tarjetas: Array<[string, string, string]> = [
    ['Componentes', String(items.length), COLOR_TEXTO],
    ['En buen estado', String(itemsBien), COLOR_OK],
    ['Con pendiente', String(itemsMal), itemsMal > 0 ? COLOR_MAL : COLOR_TEXTO],
    ['Zonas con daño', String(zonasMal), zonasMal > 0 ? COLOR_MAL : COLOR_TEXTO],
  ];

  const anchoTarjeta = ANCHO_UTIL / tarjetas.length;
  tarjetas.forEach(([etiqueta, valor, color], indice) => {
    const x = MARGEN + indice * anchoTarjeta;
    doc.roundedRect(x, yResumen, anchoTarjeta - 8, 44, 6).fillAndStroke('#f8fafc', COLOR_LINEA);
    doc.fillColor(COLOR_TEXTO_SUAVE).fontSize(7).font('Helvetica').text(etiqueta.toUpperCase(), x + 10, yResumen + 8, {
      width: anchoTarjeta - 24,
    });
    doc.fillColor(color).fontSize(16).font('Helvetica-Bold').text(valor, x + 10, yResumen + 20);
  });

  doc.y = yResumen + 60;

  /* ---------------------------------------------------------------- *
   * Tabla de componentes por categoria
   * ---------------------------------------------------------------- */
  const tituloSeccion = (titulo: string) => {
    if (doc.y > 720) doc.addPage();
    doc
      .fillColor(COLOR_AZUL_OSCURO)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(titulo, MARGEN, doc.y);
    doc
      .moveTo(MARGEN, doc.y + 2)
      .lineTo(MARGEN + ANCHO_UTIL, doc.y + 2)
      .strokeColor(COLOR_AZUL)
      .lineWidth(1)
      .stroke();
    doc.y += 10;
  };

  tituloSeccion('Componentes revisados');

  if (items.length === 0) {
    doc.fillColor(COLOR_TEXTO_SUAVE).fontSize(10).font('Helvetica').text('Sin componentes registrados.', MARGEN, doc.y);
    doc.y += 16;
  } else {
    const columnas = {
      componente: MARGEN,
      estado: MARGEN + 210,
      porcentaje: MARGEN + 270,
      responsable: MARGEN + 320,
      observaciones: MARGEN + 400,
    };

    const encabezadoTabla = () => {
      doc.fillColor(COLOR_TEXTO_SUAVE).fontSize(7).font('Helvetica-Bold');
      doc.text('COMPONENTE', columnas.componente, doc.y, { continued: false });
      const y = doc.y - 9;
      doc.text('ESTADO', columnas.estado, y);
      doc.text('%', columnas.porcentaje, y);
      doc.text('RESPONSABLE', columnas.responsable, y);
      doc.text('OBSERVACIONES', columnas.observaciones, y);
      doc.y = y + 12;
    };

    for (const [categoria, lista] of agruparPorCategoria(items)) {
      if (doc.y > 700) {
        doc.addPage();
      }

      doc
        .fillColor(COLOR_AZUL)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(categoria.toUpperCase(), MARGEN, doc.y);
      doc.y += 4;
      encabezadoTabla();

      for (const item of lista) {
        if (doc.y > 760) {
          doc.addPage();
          encabezadoTabla();
        }

        const y = doc.y;
        const malEstado = item.status !== 'bien';
        const transmision = texto(item.tipoTransmision);

        doc
          .fillColor(COLOR_TEXTO)
          .fontSize(9)
          .font('Helvetica')
          .text(
            texto(item.label) + (transmision ? ` (${transmision})` : ''),
            columnas.componente,
            y,
            { width: 200 }
          );

        const alturaFila = Math.max(doc.y - y, 12);

        doc
          .fillColor(malEstado ? COLOR_MAL : COLOR_OK)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(malEstado ? 'PENDIENTE' : 'BIEN', columnas.estado, y, { width: 58 });

        doc
          .fillColor(COLOR_TEXTO)
          .font('Helvetica')
          .text(
            item.porcentajeEstado === null || item.porcentajeEstado === undefined
              ? '—'
              : `${item.porcentajeEstado}%`,
            columnas.porcentaje,
            y,
            { width: 44 }
          );

        doc.text(texto(item.responsable) || '—', columnas.responsable, y, { width: 74 });
        doc.text(texto(item.observaciones) || '—', columnas.observaciones, y, {
          width: ANCHO_UTIL - (columnas.observaciones - MARGEN),
        });

        doc.y = y + Math.max(alturaFila, doc.y - y) + 4;
        doc
          .moveTo(MARGEN, doc.y - 2)
          .lineTo(MARGEN + ANCHO_UTIL, doc.y - 2)
          .strokeColor(COLOR_LINEA)
          .lineWidth(0.5)
          .stroke();
      }

      doc.y += 8;
    }
  }

  /* ---------------------------------------------------------------- *
   * Zonas con dano
   * ---------------------------------------------------------------- */
  doc.y += 6;
  tituloSeccion('Mapa de daños por zona');

  const zonasConDano = zonas.filter((z) => z.status !== 'bien');
  if (zonasConDano.length === 0) {
    doc
      .fillColor(COLOR_OK)
      .fontSize(10)
      .font('Helvetica')
      .text(
        zonas.length === 0
          ? 'Sin zonas registradas.'
          : `Las ${zonas.length} zonas revisadas quedaron en buen estado.`,
        MARGEN,
        doc.y
      );
    doc.y += 16;
  } else {
    for (const zona of zonasConDano) {
      if (doc.y > 760) doc.addPage();

      const y = doc.y;
      doc.fillColor(COLOR_MAL).fontSize(9).font('Helvetica-Bold').text(texto(zona.label), MARGEN, y, {
        width: 160,
      });
      doc
        .fillColor(COLOR_TEXTO)
        .font('Helvetica')
        .text(texto(zona.responsable) || '—', MARGEN + 170, y, { width: 90 });
      doc.text(texto(zona.observaciones) || 'Sin detalle', MARGEN + 270, y, {
        width: ANCHO_UTIL - 270,
      });
      doc.y = Math.max(doc.y, y + 12) + 4;
    }
  }

  /* ---------------------------------------------------------------- *
   * Observaciones y resumen
   * ---------------------------------------------------------------- */
  const observaciones = texto(checklist.generalObservations);
  if (observaciones) {
    doc.y += 6;
    tituloSeccion('Observaciones generales');
    doc.fillColor(COLOR_TEXTO).fontSize(10).font('Helvetica').text(observaciones, MARGEN, doc.y, {
      width: ANCHO_UTIL,
      align: 'justify',
    });
    doc.y += 8;
  }

  const resumen = texto(entrada.resumen);
  if (resumen) {
    doc.y += 6;
    tituloSeccion('Resumen');
    doc.fillColor(COLOR_TEXTO).fontSize(10).font('Helvetica').text(resumen, MARGEN, doc.y, {
      width: ANCHO_UTIL,
      align: 'justify',
    });
    doc.y += 8;
  }

  /* ---------------------------------------------------------------- *
   * Firma de quien entrega
   * ---------------------------------------------------------------- */
  if (doc.y > 672) doc.addPage();
  doc.y += 20;

  const yFirma = doc.y;
  const firma = firmaABuffer(checklist.deliveredBySignature);
  if (firma) {
    try {
      doc.image(firma, MARGEN, yFirma, { fit: [180, 70] });
    } catch {
      // Una firma corrupta no debe tumbar el documento
    }
  }

  doc
    .moveTo(MARGEN, yFirma + 76)
    .lineTo(MARGEN + 220, yFirma + 76)
    .strokeColor(COLOR_TEXTO)
    .lineWidth(0.8)
    .stroke();

  doc
    .fillColor(COLOR_TEXTO)
    .fontSize(9)
    .font('Helvetica-Bold')
    .text(texto(checklist.deliveredByName) || 'Quien entrega el vehículo', MARGEN, yFirma + 82);
  doc
    .fillColor(COLOR_TEXTO_SUAVE)
    .fontSize(8)
    .font('Helvetica')
    .text('Firma de quien entrega el vehículo', MARGEN, yFirma + 94);

  doc
    .moveTo(MARGEN + 300, yFirma + 76)
    .lineTo(MARGEN + 300 + 200, yFirma + 76)
    .strokeColor(COLOR_TEXTO)
    .lineWidth(0.8)
    .stroke();
  doc
    .fillColor(COLOR_TEXTO)
    .fontSize(9)
    .font('Helvetica-Bold')
    .text(texto(checklist.inspectorName) || 'Inspector', MARGEN + 300, yFirma + 82);
  doc
    .fillColor(COLOR_TEXTO_SUAVE)
    .fontSize(8)
    .font('Helvetica')
    .text('Inspector responsable', MARGEN + 300, yFirma + 94);

  /* ---------------------------------------------------------------- *
   * Pie de pagina en todas las hojas
   * ---------------------------------------------------------------- */
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i += 1) {
    doc.switchToPage(rango.start + i);

    // Escribir dentro del margen inferior haria que PDFKit agregue una hoja mas,
    // asi que se anula el margen mientras se dibuja el pie.
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc
      .fillColor(COLOR_TEXTO_SUAVE)
      .fontSize(7)
      .font('Helvetica')
      .text(
        `Horizon Autos · Checklist de ingreso · ${placa || 'sin placa'} · Página ${i + 1} de ${rango.count}`,
        MARGEN,
        doc.page.height - 28,
        { width: ANCHO_UTIL, align: 'center', lineBreak: false }
      );

    doc.page.margins.bottom = margenInferior;
  }

  doc.end();
  return terminado;
};
