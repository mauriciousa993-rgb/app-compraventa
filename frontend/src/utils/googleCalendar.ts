// Recordatorios de vencimiento (SOAT / Tecnomecánica) en Google Calendar.
// Se crea un evento de día completo N días ANTES del vencimiento para que el
// aviso llegue a tiempo a la cuenta de Gmail del usuario.

export const DIAS_AVISO_CALENDARIO = 2;

/**
 * Normaliza la fecha a medianoche UTC. Acepta el valor de un <input type="date">
 * ('YYYY-MM-DD') o una fecha del backend, evitando corrimientos por zona horaria.
 */
const toUtcDate = (valor?: string | Date | null): Date | null => {
  if (!valor) return null;

  if (typeof valor === 'string') {
    const soloFecha = valor.slice(0, 10);
    const [anio, mes, dia] = soloFecha.split('-').map(Number);
    if (!anio || !mes || !dia) return null;
    return new Date(Date.UTC(anio, mes - 1, dia));
  }

  if (Number.isNaN(valor.getTime())) return null;
  return new Date(
    Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate())
  );
};

const addDays = (fecha: Date, dias: number): Date => {
  const resultado = new Date(fecha.getTime());
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
};

const toGoogleDate = (fecha: Date): string =>
  fecha.toISOString().slice(0, 10).replace(/-/g, '');

const formatFechaLarga = (fecha: Date): string =>
  fecha.toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

interface RecordatorioVencimiento {
  /** 'SOAT' o 'Tecnomecánica' */
  documento: string;
  placa?: string;
  /** Ej: 'RENAULT KWID 2020' */
  descripcionVehiculo?: string;
  fechaVencimiento?: string | Date | null;
  diasAviso?: number;
}

/**
 * Devuelve el enlace para crear el recordatorio en Google Calendar,
 * o null si la fecha de vencimiento aún no es válida.
 */
export const buildGoogleCalendarEventUrl = ({
  documento,
  placa,
  descripcionVehiculo,
  fechaVencimiento,
  diasAviso = DIAS_AVISO_CALENDARIO,
}: RecordatorioVencimiento): string | null => {
  const vencimiento = toUtcDate(fechaVencimiento);
  if (!vencimiento) return null;

  const fechaAviso = addDays(vencimiento, -diasAviso);
  const identificador = placa?.trim() || descripcionVehiculo?.trim() || 'vehículo';

  const titulo = `Recordatorio: ${documento} de ${identificador} vence en ${diasAviso} días`;
  const detalles = [
    `${documento} del vehículo ${descripcionVehiculo?.trim() || identificador}${
      placa?.trim() ? ` (placa ${placa.trim()})` : ''
    }.`,
    `Fecha de vencimiento: ${formatFechaLarga(vencimiento)}.`,
    'Recuerda renovarlo antes de la fecha para evitar sanciones.',
  ].join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo,
    dates: `${toGoogleDate(fechaAviso)}/${toGoogleDate(addDays(fechaAviso, 1))}`,
    details: detalles,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};
