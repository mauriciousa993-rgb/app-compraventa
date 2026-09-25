import { EstadoSolicitud } from '../types/credit';

/** Estados de una solicitud, con los colores del tema oscuro de la app. */
export const ESTADOS_SOLICITUD: Array<{
  valor: EstadoSolicitud;
  texto: string;
  badge: string;
  card: string;
  cardActiva: string;
}> = [
  {
    valor: 'nueva',
    texto: 'Nueva',
    badge: 'bg-[#152027] text-[#8fd5e5] border border-[#4e8896]',
    card: 'bg-[#152027] border-[#2d3f47] hover:border-[#4e8896]',
    cardActiva: 'bg-[#16242c] border-[#4e8896] ring-2 ring-[#4e8896]',
  },
  {
    valor: 'en_estudio',
    texto: 'En estudio',
    badge: 'bg-[#2b2116] text-[#f4c26b] border border-[#7e6642]',
    card: 'bg-[#221a12] border-[#3b3125] hover:border-[#7e6642]',
    cardActiva: 'bg-[#2b2116] border-[#7e6642] ring-2 ring-[#7e6642]',
  },
  {
    valor: 'aprobada',
    texto: 'Aprobada',
    badge: 'bg-[#10261d] text-[#7be0aa] border border-[#214333]',
    card: 'bg-[#10261d] border-[#214333] hover:border-[#3d7a5c]',
    cardActiva: 'bg-[#123024] border-[#3d7a5c] ring-2 ring-[#3d7a5c]',
  },
  {
    valor: 'rechazada',
    texto: 'Rechazada',
    badge: 'bg-[#311418] text-primary-300 border border-primary-700/60',
    card: 'bg-[#251317] border-[#412228] hover:border-primary-600',
    cardActiva: 'bg-[#351418] border-primary-500 ring-2 ring-primary-500',
  },
  {
    valor: 'desistida',
    texto: 'Desistida',
    badge: 'bg-[#1a2129] text-silver border border-[#4d5663]',
    card: 'bg-[#1c2027] border-[#30343d] hover:border-[#7f8a98]',
    cardActiva: 'bg-[#1d242b] border-[#8f9aa8] ring-2 ring-[#8f9aa8]',
  },
];

export const getEstadoSolicitud = (estado?: string) =>
  ESTADOS_SOLICITUD.find((e) => e.valor === estado) ?? ESTADOS_SOLICITUD[0];

export const TIPO_DOCUMENTO_LABEL: Record<string, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  PASAPORTE: 'Pasaporte',
};

export const ETIQUETA_DOCUMENTO: Record<string, string> = {
  cedula: 'Cédula de ciudadanía',
  extractos: 'Extractos bancarios',
  rut: 'RUT',
  carta_laboral: 'Carta laboral',
  desprendible_nomina: 'Desprendible de nómina',
};

const ZONA = 'America/Bogota';

export const fechaCorta = (iso?: string) => {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
};

export const fechaLarga = (iso?: string) => {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(iso));
};

/** Separador de miles al estilo colombiano, igual que en el formulario público. */
export const formatoMiles = (valor: string | number | null | undefined) => {
  const limpio = String(valor ?? '').replace(/[^\d]/g, '');
  if (!limpio) return '';
  return limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const formatoPeso = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
