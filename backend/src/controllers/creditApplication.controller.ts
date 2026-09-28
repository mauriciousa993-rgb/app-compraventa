/**
 * Panel de solicitudes de crédito.
 *
 * Reemplaza el panel /admin que vivía en el proyecto Next.js: aquí las mismas
 * operaciones quedan detrás del JWT y del rol admin de la app de compraventa.
 */
import { Response } from 'express';
import JSZip from 'jszip';
import { AuthRequest } from '../types';
import {
  BUCKET,
  ESTADOS_SOLICITUD,
  FilaSolicitud,
  VALORES_ESTADO,
  descargarArchivo,
  documentosDe,
  enlaceDescarga,
  supabaseAdmin,
  supabaseConfigurado,
} from '../config/supabase';

const POR_PAGINA = 50;

const CAMPOS_LISTADO =
  'id, radicado, creado_en, estado, nombre, tipo_documento, numero_documento, celular, email, ciudad, ocupacion, vehiculo, total_financiar, correo_enviado, correo_error';

/**
 * Traduce los errores tipicos de Supabase a algo accionable. El mas comun al
 * montar el modulo es una service role key mal copiada o de otro proyecto.
 */
const mensajeError = (error: { message?: string } | null): string => {
  const detalle = error?.message ?? '';

  if (/invalid api key/i.test(detalle)) {
    return 'Supabase rechazo la llave del servidor. Revisa SUPABASE_SERVICE_ROLE_KEY: debe ser la service_role del mismo proyecto de SUPABASE_URL, completa y sin espacios ni comillas.';
  }

  if (/not find the table|does not exist/i.test(detalle)) {
    return 'La tabla de solicitudes no existe en el proyecto de Supabase configurado. Verifica que SUPABASE_URL apunte al proyecto correcto.';
  }

  return `Error al consultar las solicitudes: ${detalle}`;
};

const sinConfigurar = (res: Response): boolean => {
  if (supabaseConfigurado()) return false;

  res.status(503).json({
    message:
      'El módulo de créditos no está conectado: faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el servidor.',
    noConfigurado: true,
  });
  return true;
};

/** Listado con filtros por estado y búsqueda libre, más el conteo por estado. */
export const listCreditApplications = async (req: AuthRequest, res: Response): Promise<void> => {
  if (sinConfigurar(res)) return;

  try {
    const q = String(req.query.q ?? '').trim();
    const estado = String(req.query.estado ?? '').trim();
    const pagina = Math.max(1, Number(req.query.pagina) || 1);

    let consulta = supabaseAdmin()
      .from('hz_solicitudes')
      .select(CAMPOS_LISTADO, { count: 'exact' })
      .order('creado_en', { ascending: false })
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

    if (estado) consulta = consulta.eq('estado', estado);

    if (q) {
      // Se limpian % y , porque rompen la sintaxis del filtro `or` de PostgREST
      const termino = q.replace(/[%,]/g, '');
      consulta = consulta.or(
        `nombre.ilike.%${termino}%,numero_documento.ilike.%${termino}%,radicado.ilike.%${termino}%,celular.ilike.%${termino}%`
      );
    }

    const { data, count, error } = await consulta;
    if (error) {
      res.status(500).json({ message: mensajeError(error), error: error.message });
      return;
    }

    const { data: todosLosEstados } = await supabaseAdmin().from('hz_solicitudes').select('estado');
    const conteos: Record<string, number> = {};
    for (const fila of (todosLosEstados ?? []) as { estado: string }[]) {
      conteos[fila.estado] = (conteos[fila.estado] ?? 0) + 1;
    }

    const total = count ?? 0;

    res.json({
      solicitudes: data ?? [],
      total,
      pagina,
      paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
      porPagina: POR_PAGINA,
      conteos,
      estados: ESTADOS_SOLICITUD,
    });
  } catch (error: any) {
    console.error('Error al listar solicitudes de crédito:', error);
    res.status(500).json({ message: 'Error al listar las solicitudes', error: error.message });
  }
};

/** Detalle completo de una solicitud, con sus soportes adjuntos. */
export const getCreditApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  if (sinConfigurar(res)) return;

  try {
    const { id } = req.params;

    const { data: fila, error } = await supabaseAdmin()
      .from('hz_solicitudes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !fila) {
      res.status(404).json({ message: 'Solicitud no encontrada' });
      return;
    }

    const solicitud = fila as FilaSolicitud;
    const documentos = await documentosDe(solicitud);

    res.json({ solicitud, documentos });
  } catch (error: any) {
    console.error('Error al obtener la solicitud de crédito:', error);
    res.status(500).json({ message: 'Error al obtener la solicitud', error: error.message });
  }
};

/** Cambia el estado y/o las notas internas. */
export const updateCreditApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  if (sinConfigurar(res)) return;

  try {
    const { id } = req.params;
    const cambios: { estado?: string; notas?: string } = {};

    if (req.body?.estado !== undefined) {
      if (!VALORES_ESTADO.includes(req.body.estado)) {
        res.status(400).json({ message: 'Estado inválido' });
        return;
      }
      cambios.estado = req.body.estado;
    }

    if (req.body?.notas !== undefined) {
      cambios.notas = String(req.body.notas).slice(0, 4000);
    }

    if (Object.keys(cambios).length === 0) {
      res.status(400).json({ message: 'No hay cambios para guardar' });
      return;
    }

    const { error } = await supabaseAdmin().from('hz_solicitudes').update(cambios).eq('id', id);
    if (error) {
      res.status(500).json({ message: 'Error al actualizar la solicitud', error: error.message });
      return;
    }

    res.json({ message: 'Solicitud actualizada', cambios });
  } catch (error: any) {
    console.error('Error al actualizar la solicitud de crédito:', error);
    res.status(500).json({ message: 'Error al actualizar la solicitud', error: error.message });
  }
};

/** Elimina la solicitud y todos sus archivos del bucket. */
export const deleteCreditApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  if (sinConfigurar(res)) return;

  try {
    const { id } = req.params;
    const sb = supabaseAdmin();

    const { data: fila } = await sb.from('hz_solicitudes').select('radicado').eq('id', id).single();
    if (!fila) {
      res.status(404).json({ message: 'Solicitud no encontrada' });
      return;
    }

    const storage = sb.storage.from(BUCKET);
    const rutas: string[] = [];
    for (const carpeta of [fila.radicado, `${fila.radicado}/documentos`]) {
      const { data } = await storage.list(carpeta, { limit: 200 });
      for (const archivo of data ?? []) {
        if (archivo.id) rutas.push(`${carpeta}/${archivo.name}`);
      }
    }
    if (rutas.length > 0) await storage.remove(rutas);

    const { error } = await sb.from('hz_solicitudes').delete().eq('id', id);
    if (error) {
      res.status(500).json({ message: 'Error al eliminar la solicitud', error: error.message });
      return;
    }

    res.json({ message: 'Solicitud eliminada' });
  } catch (error: any) {
    console.error('Error al eliminar la solicitud de crédito:', error);
    res.status(500).json({ message: 'Error al eliminar la solicitud', error: error.message });
  }
};

/** Exporta el listado a CSV (se abre directo en Excel). */
export const exportCreditApplications = async (req: AuthRequest, res: Response): Promise<void> => {
  if (sinConfigurar(res)) return;

  try {
    const estado = String(req.query.estado ?? '').trim();

    let consulta = supabaseAdmin()
      .from('hz_solicitudes')
      .select(
        'radicado, creado_en, estado, nombre, tipo_documento, numero_documento, celular, email, ciudad, ocupacion, tipo_solicitud, vehiculo, total_financiar, total_ingresos, correo_enviado, notas'
      )
      .order('creado_en', { ascending: false })
      .limit(5000);

    if (estado) consulta = consulta.eq('estado', estado);

    const { data, error } = await consulta;
    if (error) {
      res.status(500).json({ message: 'Error al exportar', error: error.message });
      return;
    }

    const etiqueta = (valor: string) =>
      ESTADOS_SOLICITUD.find((e) => e.valor === valor)?.texto ?? valor;

    const celda = (valor: unknown) => {
      const texto = valor === null || valor === undefined ? '' : String(valor);
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };

    const cabecera = [
      'Radicado', 'Fecha', 'Estado', 'Nombre', 'Tipo doc', 'Documento', 'Celular', 'Correo',
      'Ciudad', 'Ocupación', 'Tipo', 'Vehículo', 'Total a financiar', 'Ingresos',
      'Correo enviado', 'Notas',
    ];

    const filas = ((data ?? []) as Partial<FilaSolicitud>[]).map((f) =>
      [
        f.radicado,
        f.creado_en
          ? new Date(f.creado_en).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
          : '',
        etiqueta(f.estado ?? ''),
        f.nombre, f.tipo_documento, f.numero_documento, f.celular, f.email, f.ciudad, f.ocupacion,
        f.tipo_solicitud, f.vehiculo, f.total_financiar, f.total_ingresos,
        f.correo_enviado ? 'Sí' : 'No', f.notas,
      ]
        .map(celda)
        .join(';')
    );

    // BOM + punto y coma: así Excel en español lo abre en columnas y con tildes
    const csv = '﻿' + [cabecera.join(';'), ...filas].join('\r\n');
    const fecha = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="solicitudes-${fecha}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(csv);
  } catch (error: any) {
    console.error('Error al exportar solicitudes de crédito:', error);
    res.status(500).json({ message: 'Error al exportar', error: error.message });
  }
};

/** Descarga la solicitud completa: PDF firmado + todos los soportes, en un ZIP. */
export const downloadCreditApplicationZip = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (sinConfigurar(res)) return;

  try {
    const { id } = req.params;

    const { data: fila } = await supabaseAdmin()
      .from('hz_solicitudes')
      .select('id, radicado, nombre, pdf_path, datos')
      .eq('id', id)
      .single();

    if (!fila) {
      res.status(404).json({ message: 'Solicitud no encontrada' });
      return;
    }

    const documentos = await documentosDe(fila as Pick<FilaSolicitud, 'id' | 'datos'>);
    const zip = new JSZip();

    zip.file(fila.pdf_path.split('/').pop() ?? 'solicitud.pdf', await descargarArchivo(fila.pdf_path));
    for (const doc of documentos) {
      zip.file(`documentos/${doc.path.split('/').pop() ?? doc.nombre}`, await descargarArchivo(doc.path));
    }

    const contenido = await zip.generateAsync({ type: 'nodebuffer' });
    const nombreZip = `${fila.radicado}-${String(fila.nombre).replace(/[^A-Za-z0-9]+/g, '-')}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreZip}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(contenido);
  } catch (error: any) {
    console.error('Error al armar el ZIP de la solicitud:', error);
    res.status(500).json({ message: 'No se pudo armar el ZIP', error: error.message });
  }
};

/**
 * Devuelve un enlace firmado (1 h) del PDF o de un soporte. Se comprueba que el
 * archivo pertenezca a la solicitud para que la URL no sirva de puerta a otros
 * radicados. El navegador abre la URL; el token JWT nunca viaja a Supabase.
 */
export const getCreditApplicationFileUrl = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  if (sinConfigurar(res)) return;

  try {
    const { id } = req.params;
    const path = String(req.query.path ?? '');
    const nombre = req.query.nombre ? String(req.query.nombre) : undefined;

    const { data: fila } = await supabaseAdmin()
      .from('hz_solicitudes')
      .select('radicado, pdf_path')
      .eq('id', id)
      .single();

    if (!fila) {
      res.status(404).json({ message: 'Solicitud no encontrada' });
      return;
    }

    const destino = path || fila.pdf_path;
    if (!destino.startsWith(`${fila.radicado}/`)) {
      res.status(403).json({ message: 'Archivo no permitido' });
      return;
    }

    const url = await enlaceDescarga(destino, nombre ?? destino.split('/').pop());
    res.json({ url });
  } catch (error: any) {
    console.error('Error al generar el enlace del archivo:', error);
    res.status(500).json({ message: 'No se pudo generar el enlace', error: error.message });
  }
};
