import { Request, Response } from 'express';
import crypto from 'crypto';
import Vehicle from '../models/Vehicle';
import { AuthRequest } from '../types';

// Días de anticipación con los que se avisa el vencimiento de SOAT / Tecnomecánica
const DIAS_AVISO_PREVIO = [2, 1];

// Estados cuyos documentos siguen siendo responsabilidad del negocio
const ESTADOS_VIGENTES = ['en_proceso', 'listo_venta', 'en_negociacion', 'separado'];

/**
 * Token del feed de calendario. Google Calendar consulta la URL sin encabezados
 * de autenticación, por eso el acceso se protege con un token en la URL.
 * Se puede fijar con CALENDAR_FEED_TOKEN; si no, se deriva del JWT_SECRET.
 */
export const getCalendarFeedToken = (): string => {
  if (process.env.CALENDAR_FEED_TOKEN) {
    return process.env.CALENDAR_FEED_TOKEN;
  }

  const secret = process.env.JWT_SECRET || 'autotech-calendar';
  return crypto.createHash('sha256').update(`${secret}:calendar-feed`).digest('hex').slice(0, 32);
};

const escapeIcsText = (value: string): string =>
  (value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// Las líneas de un archivo .ics no pueden superar los 75 octetos
const foldIcsLine = (line: string): string => {
  if (line.length <= 73) return line;

  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 73));
  rest = rest.slice(73);

  while (rest.length > 72) {
    chunks.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }

  if (rest.length > 0) chunks.push(` ${rest}`);
  return chunks.join('\r\n');
};

const toIcsDate = (date: Date): string => date.toISOString().slice(0, 10).replace(/-/g, '');

const toIcsTimestamp = (date: Date): string =>
  `${date.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const formatHumanDate = (date: Date): string =>
  date.toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

interface DocumentEvent {
  uid: string;
  fechaVencimiento: Date;
  titulo: string;
  descripcion: string;
}

const buildVehicleEvents = (vehicle: any): DocumentEvent[] => {
  const eventos: DocumentEvent[] = [];
  const identificacion = `${vehicle.marca || ''} ${vehicle.modelo || ''} ${vehicle.año || ''}`.trim();
  const placa = vehicle.placa || 'SIN PLACA';

  const documentos: Array<{ key: 'soat' | 'tecnomecanica'; label: string }> = [
    { key: 'soat', label: 'SOAT' },
    { key: 'tecnomecanica', label: 'Tecnomecánica' },
  ];

  documentos.forEach(({ key, label }) => {
    const fecha = vehicle.documentacion?.[key]?.fechaVencimiento;
    if (!fecha) return;

    const fechaVencimiento = new Date(fecha);
    if (Number.isNaN(fechaVencimiento.getTime())) return;

    eventos.push({
      uid: `${vehicle._id}-${key}`,
      fechaVencimiento,
      titulo: `Vence ${label} - ${placa}`,
      descripcion:
        `${label} del vehículo ${identificacion} (placa ${placa}).\n` +
        `Fecha de vencimiento: ${formatHumanDate(fechaVencimiento)}.\n` +
        `Recuerda renovarlo antes de la fecha para evitar sanciones.`,
    });
  });

  return eventos;
};

export const buildIcsCalendar = (vehicles: any[]): string => {
  const ahora = new Date();
  const lineas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AutoTech//Vencimientos de documentos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Vencimientos SOAT y Tecnomecánica',
    'X-WR-TIMEZONE:America/Bogota',
    'X-WR-CALDESC:Vencimientos de SOAT y Tecnomecánica del inventario de vehículos',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];

  vehicles.forEach((vehicle) => {
    buildVehicleEvents(vehicle).forEach((evento) => {
      // 1) Evento el día del vencimiento, con alarmas 2 días y 1 día antes
      lineas.push('BEGIN:VEVENT');
      lineas.push(`UID:${evento.uid}-vencimiento@autotech`);
      lineas.push(`DTSTAMP:${toIcsTimestamp(ahora)}`);
      lineas.push(`DTSTART;VALUE=DATE:${toIcsDate(evento.fechaVencimiento)}`);
      lineas.push(`DTEND;VALUE=DATE:${toIcsDate(addDays(evento.fechaVencimiento, 1))}`);
      lineas.push(`SUMMARY:${escapeIcsText(evento.titulo)}`);
      lineas.push(`DESCRIPTION:${escapeIcsText(evento.descripcion)}`);
      lineas.push('TRANSP:TRANSPARENT');

      DIAS_AVISO_PREVIO.forEach((dias) => {
        lineas.push('BEGIN:VALARM');
        lineas.push(`TRIGGER:-P${dias}D`);
        lineas.push('ACTION:DISPLAY');
        lineas.push(
          `DESCRIPTION:${escapeIcsText(
            `${evento.titulo} - ${dias === 1 ? 'falta 1 día' : `faltan ${dias} días`}`
          )}`
        );
        lineas.push('END:VALARM');
      });

      lineas.push('END:VEVENT');

      // 2) Aviso previo como evento propio: los calendarios suscritos por URL
      //    no siempre respetan las alarmas, así el recordatorio se ve igual.
      const diasAvisoPrevio = Math.max(...DIAS_AVISO_PREVIO);
      const fechaAviso = addDays(evento.fechaVencimiento, -diasAvisoPrevio);

      lineas.push('BEGIN:VEVENT');
      lineas.push(`UID:${evento.uid}-aviso@autotech`);
      lineas.push(`DTSTAMP:${toIcsTimestamp(ahora)}`);
      lineas.push(`DTSTART;VALUE=DATE:${toIcsDate(fechaAviso)}`);
      lineas.push(`DTEND;VALUE=DATE:${toIcsDate(addDays(fechaAviso, 1))}`);
      lineas.push(
        `SUMMARY:${escapeIcsText(`Recordatorio: ${evento.titulo} en ${diasAvisoPrevio} días`)}`
      );
      lineas.push(`DESCRIPTION:${escapeIcsText(evento.descripcion)}`);
      lineas.push('TRANSP:TRANSPARENT');
      lineas.push('BEGIN:VALARM');
      lineas.push('TRIGGER:-PT9H');
      lineas.push('ACTION:DISPLAY');
      lineas.push(`DESCRIPTION:${escapeIcsText(evento.titulo)}`);
      lineas.push('END:VALARM');
      lineas.push('END:VEVENT');
    });
  });

  lineas.push('END:VCALENDAR');

  return lineas.map(foldIcsLine).join('\r\n');
};

/**
 * Feed .ics público (protegido por token) para suscribir Google Calendar.
 * Google lo relee cada pocas horas, así que se mantiene sincronizado.
 */
export const getDocumentsCalendarFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.query.token || '');

    if (!token || token !== getCalendarFeedToken()) {
      res.status(401).json({ message: 'Token de calendario inválido' });
      return;
    }

    const vehicles = await Vehicle.find({
      estado: { $in: ESTADOS_VIGENTES },
      $or: [
        { 'documentacion.soat.fechaVencimiento': { $ne: null } },
        { 'documentacion.tecnomecanica.fechaVencimiento': { $ne: null } },
      ],
    }).select('marca modelo año placa documentacion estado');

    const ics = buildIcsCalendar(vehicles);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vencimientos-vehiculos.ics"');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(ics);
  } catch (error: any) {
    console.error('Error al generar el calendario de vencimientos:', error);
    res.status(500).json({
      message: 'Error al generar el calendario de vencimientos',
      error: error.message,
    });
  }
};

/**
 * Devuelve las URLs que el usuario necesita para conectar el calendario
 * con su cuenta de Gmail (suscripción por URL o descarga del archivo).
 */
export const getCalendarSubscriptionInfo = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const token = getCalendarFeedToken();
    const baseUrl = (
      process.env.PUBLIC_API_URL ||
      `${req.protocol}://${req.get('host')}`
    ).replace(/\/$/, '');

    const feedUrl = `${baseUrl}/api/vehicles/documents-calendar.ics?token=${token}`;
    const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');

    res.json({
      feedUrl,
      webcalUrl,
      googleCalendarUrl: `https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(
        feedUrl
      )}`,
      diasAvisoPrevio: DIAS_AVISO_PREVIO,
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al obtener la información del calendario',
      error: error.message,
    });
  }
};
