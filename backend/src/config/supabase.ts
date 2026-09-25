/**
 * Conexión con Supabase, donde vive la automatización de solicitudes de crédito.
 *
 * El formulario público (proyecto solicitud-credito, Next.js) escribe aquí las
 * solicitudes, el PDF firmado y los soportes. Este backend solo los lee y
 * gestiona desde el panel de administración de la app de compraventa.
 *
 * La service role key salta las políticas RLS, así que NUNCA debe salir del
 * servidor: se usa únicamente en los controladores.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const BUCKET = 'hz-solicitudes';

export type EstadoSolicitud = 'nueva' | 'en_estudio' | 'aprobada' | 'rechazada' | 'desistida';

export const ESTADOS_SOLICITUD: { valor: EstadoSolicitud; texto: string }[] = [
  { valor: 'nueva', texto: 'Nueva' },
  { valor: 'en_estudio', texto: 'En estudio' },
  { valor: 'aprobada', texto: 'Aprobada' },
  { valor: 'rechazada', texto: 'Rechazada' },
  { valor: 'desistida', texto: 'Desistida' },
];

export const VALORES_ESTADO = ESTADOS_SOLICITUD.map((e) => e.valor);

export interface FilaSolicitud {
  id: string;
  radicado: string;
  creado_en: string;
  actualizado_en: string;
  estado: EstadoSolicitud;
  nombre: string;
  tipo_documento: string;
  numero_documento: string;
  celular: string | null;
  email: string | null;
  ciudad: string | null;
  ocupacion: string | null;
  tipo_solicitud: string | null;
  calidad: string | null;
  vehiculo: string | null;
  total_financiar: number | null;
  total_ingresos: number | null;
  pdf_path: string;
  datos: Record<string, unknown>;
  constancia: { fechaHora: string; ip: string; userAgent: string };
  correo_enviado: boolean;
  correo_error: string | null;
  notas: string | null;
}

export interface FilaDocumento {
  id: string;
  solicitud_id: string;
  doc_id: string;
  nombre: string;
  tipo: string | null;
  size: number | null;
  path: string;
  creado_en: string;
}

let cliente: SupabaseClient | null = null;

export const supabaseConfigurado = (): boolean =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const supabaseAdmin = (): SupabaseClient => {
  if (cliente) return cliente;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase no está configurado: faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  cliente = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
};

/** Enlace temporal (1 hora) para descargar un archivo del bucket privado. */
export const enlaceDescarga = async (path: string, nombre?: string): Promise<string> => {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60 * 60, nombre ? { download: nombre } : undefined);

  if (error || !data) throw new Error(error?.message ?? 'No se pudo firmar el enlace');
  return data.signedUrl;
};

/**
 * Documentos de una solicitud. Lee el índice `hz_documentos` y, si está vacío
 * (un insert que falló), reconstruye la lista desde `datos.documentos`.
 */
export const documentosDe = async (
  fila: Pick<FilaSolicitud, 'id' | 'datos'>
): Promise<FilaDocumento[]> => {
  const { data } = await supabaseAdmin()
    .from('hz_documentos')
    .select('*')
    .eq('solicitud_id', fila.id)
    .order('creado_en');

  if (data && data.length > 0) return data as FilaDocumento[];

  const lista = ((fila.datos?.documentos ?? []) as {
    docId: string;
    nombre: string;
    tipo?: string;
    size?: number;
    path: string;
  }[]);

  return lista.map((d, i) => ({
    id: `json-${i}`,
    solicitud_id: fila.id,
    doc_id: d.docId,
    nombre: d.nombre,
    tipo: d.tipo ?? null,
    size: d.size ?? null,
    path: d.path,
    creado_en: '',
  }));
};

export const descargarArchivo = async (path: string): Promise<Buffer> => {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? `No se pudo descargar ${path}`);
  return Buffer.from(await data.arrayBuffer());
};
