/** Solicitudes de crédito: datos que llegan del formulario público (Supabase). */

export type EstadoSolicitud = 'nueva' | 'en_estudio' | 'aprobada' | 'rechazada' | 'desistida';

export interface SolicitudResumen {
  id: string;
  radicado: string;
  creado_en: string;
  estado: EstadoSolicitud;
  nombre: string;
  tipo_documento: string;
  numero_documento: string;
  celular: string | null;
  email: string | null;
  ciudad: string | null;
  ocupacion: string | null;
  vehiculo: string | null;
  total_financiar: number | null;
  correo_enviado: boolean;
  correo_error: string | null;
}

export interface SolicitudCompleta extends SolicitudResumen {
  actualizado_en: string;
  tipo_solicitud: string | null;
  calidad: string | null;
  total_ingresos: number | null;
  pdf_path: string;
  datos: Record<string, any>;
  constancia: { fechaHora: string; ip: string; userAgent: string };
  notas: string | null;
}

export interface DocumentoSolicitud {
  id: string;
  solicitud_id: string;
  doc_id: string;
  nombre: string;
  tipo: string | null;
  size: number | null;
  path: string;
  creado_en: string;
}

export interface ListadoSolicitudes {
  solicitudes: SolicitudResumen[];
  total: number;
  pagina: number;
  paginas: number;
  porPagina: number;
  conteos: Record<string, number>;
  estados: { valor: EstadoSolicitud; texto: string }[];
}

export interface DetalleSolicitud {
  solicitud: SolicitudCompleta;
  documentos: DocumentoSolicitud[];
}
