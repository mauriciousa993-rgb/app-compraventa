import { Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { PDFDocument as PDFLibDocument, PDFTextField } from 'pdf-lib';
import Vehicle from '../models/Vehicle';
import VehicleInspectionChecklist, {
  IVehicleInspectionChecklistDocument,
} from '../models/VehicleInspectionChecklist';
import { AuthRequest } from '../types';

const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';
const TEMPLATE_DIR = path.join(__dirname, '../../templates');

type OpenAICompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type ChecklistTemplateData = {
  placa: string;
  marca: string;
  modelo: string;
  anio: string;
  color: string;
  inspectorNombre: string;
  fechaInspeccion: string;
  quienEntrega: string;
  totalComponentes: string;
  componentesBien: string;
  componentesMal: string;
  totalZonas: string;
  zonasBien: string;
  zonasMal: string;
  pendientesDetalle: string;
  zonasDanadasDetalle: string;
  observacionesGenerales: string;
  resumenGeneral: string;
};

type InspectionStatus = 'bien' | 'mal';

interface ChecklistInputRow {
  key?: string;
  label?: string;
  category?: string;
  status?: InspectionStatus;
  observaciones?: string;
  responsable?: string;
  porcentajeEstado?: number | string | null;
  tipoTransmision?: string;
}

interface DamageZoneInputRow {
  key?: string;
  label?: string;
  status?: InspectionStatus;
  observaciones?: string;
  responsable?: string;
  markerPositions?: Array<{
    x?: number | string | null;
    y?: number | string | null;
    z?: number | string | null;
  }> | null;
  markerPosition?: {
    x?: number | string | null;
    y?: number | string | null;
    z?: number | string | null;
  } | null;
}

const normalizeStatus = (value: any): InspectionStatus => (value === 'mal' ? 'mal' : 'bien');
const normalizeTransmissionType = (value: any): '' | 'mecanica' | 'automatica' =>
  value === 'mecanica' || value === 'automatica' ? value : '';

const normalizePercentage = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
};

const normalizeSignatureDataUrl = (value: any): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const isValidDataUrl = /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(trimmed);
  if (!isValidDataUrl) return '';
  if (trimmed.length > 350000) return '';
  return trimmed;
};

const normalizeMarkerPosition = (
  value: DamageZoneInputRow['markerPosition']
): { x: number; y: number; z: number } | null => {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
};

const normalizeMarkerPositions = (
  values: DamageZoneInputRow['markerPositions']
): { x: number; y: number; z: number }[] => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => normalizeMarkerPosition(value))
    .filter((value): value is { x: number; y: number; z: number } => value !== null);
};

const sanitizeChecklistItem = (row: ChecklistInputRow) => ({
  key: (row.key || '').toString().trim(),
  label: (row.label || '').toString().trim(),
  category: (row.category || 'General').toString().trim(),
  status: normalizeStatus(row.status),
  observaciones: (row.observaciones || '').toString().trim(),
  responsable: (row.responsable || '').toString().trim(),
  porcentajeEstado: normalizePercentage(row.porcentajeEstado),
  tipoTransmision: normalizeTransmissionType(row.tipoTransmision),
});

const sanitizeDamageZone = (row: DamageZoneInputRow) => {
  const normalizedMarkers = normalizeMarkerPositions(row.markerPositions);
  const fallbackMarker = normalizeMarkerPosition(row.markerPosition);
  const markers = normalizedMarkers.length > 0 ? normalizedMarkers : fallbackMarker ? [fallbackMarker] : [];

  return {
    key: (row.key || '').toString().trim(),
    label: (row.label || '').toString().trim(),
    status: normalizeStatus(row.status),
    observaciones: (row.observaciones || '').toString().trim(),
    responsable: (row.responsable || '').toString().trim(),
    markerPositions: markers,
    // Compatibilidad temporal con checklists previos.
    markerPosition: markers[0] || null,
  };
};

const createHttpError = (
  statusCode: number,
  message: string,
  extra?: Record<string, unknown>
) => {
  const error = new Error(message) as Error & {
    statusCode?: number;
    extra?: Record<string, unknown>;
  };
  error.statusCode = statusCode;
  if (extra) error.extra = extra;
  return error;
};

const getTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeUpperText = (value: unknown, maxLength: number): string => {
  const text = getTrimmedString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();

  if (!text) return '';
  return text.slice(0, maxLength);
};

const normalizeDigitsText = (value: unknown, maxLength: number): string => {
  const text = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, maxLength);
  return text;
};

const normalizeFieldToken = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const isTransferLikeTemplateName = (value: unknown): boolean => {
  const normalized = normalizeFieldToken(value);
  return (
    normalized.includes('traspaso') ||
    normalized.includes('transfer') ||
    normalized.includes('tramite') ||
    normalized.includes('transito')
  );
};

const formatInspectionDate = (value: unknown): string => {
  const parsed = value ? new Date(value as string) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const day = String(safeDate.getDate()).padStart(2, '0');
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const year = String(safeDate.getFullYear());
  return `${day}/${month}/${year}`;
};

const formatChecklistItemForSummary = (row: ChecklistInputRow): string => {
  const label = normalizeUpperText(row.label, 90);
  if (!label) return '';

  const extras: string[] = [];
  if (typeof row.porcentajeEstado === 'number' && Number.isFinite(row.porcentajeEstado)) {
    extras.push(`${Math.round(row.porcentajeEstado)}%`);
  }
  if (row.tipoTransmision === 'mecanica') extras.push('MECANICA');
  if (row.tipoTransmision === 'automatica') extras.push('AUTOMATICA');
  if (getTrimmedString(row.responsable)) {
    extras.push(`RESP ${normalizeUpperText(row.responsable, 24)}`);
  }

  const meta = extras.length > 0 ? ` (${extras.join(' | ')})` : '';
  const detail = getTrimmedString(row.observaciones)
    ? ` - ${normalizeUpperText(row.observaciones, 120)}`
    : '';

  return `${label}${meta}${detail}`;
};

const formatDamageZoneForSummary = (row: DamageZoneInputRow): string => {
  const label = normalizeUpperText(row.label, 90);
  if (!label) return '';

  const owner = getTrimmedString(row.responsable)
    ? ` (RESP ${normalizeUpperText(row.responsable, 24)})`
    : '';
  const detail = getTrimmedString(row.observaciones)
    ? ` - ${normalizeUpperText(row.observaciones, 120)}`
    : '';

  return `${label}${owner}${detail}`;
};

const joinSummaryLines = (values: string[], maxLength: number) => {
  const compact = values.filter(Boolean).slice(0, 18).join(' | ');
  return normalizeUpperText(compact, maxLength);
};

const sanitizeChecklistTemplateData = (
  data: Partial<ChecklistTemplateData>,
  fallback: ChecklistTemplateData
): ChecklistTemplateData => ({
  placa: normalizeUpperText(data.placa, 12) || fallback.placa,
  marca: normalizeUpperText(data.marca, 40) || fallback.marca,
  modelo: normalizeUpperText(data.modelo, 40) || fallback.modelo,
  anio: normalizeDigitsText(data.anio, 4) || fallback.anio,
  color: normalizeUpperText(data.color, 35) || fallback.color,
  inspectorNombre: normalizeUpperText(data.inspectorNombre, 60) || fallback.inspectorNombre,
  fechaInspeccion: normalizeUpperText(data.fechaInspeccion, 20) || fallback.fechaInspeccion,
  quienEntrega: normalizeUpperText(data.quienEntrega, 60) || fallback.quienEntrega,
  totalComponentes: normalizeDigitsText(data.totalComponentes, 3) || fallback.totalComponentes,
  componentesBien: normalizeDigitsText(data.componentesBien, 3) || fallback.componentesBien,
  componentesMal: normalizeDigitsText(data.componentesMal, 3) || fallback.componentesMal,
  totalZonas: normalizeDigitsText(data.totalZonas, 3) || fallback.totalZonas,
  zonasBien: normalizeDigitsText(data.zonasBien, 3) || fallback.zonasBien,
  zonasMal: normalizeDigitsText(data.zonasMal, 3) || fallback.zonasMal,
  pendientesDetalle: normalizeUpperText(data.pendientesDetalle, 1400) || fallback.pendientesDetalle,
  zonasDanadasDetalle: normalizeUpperText(data.zonasDanadasDetalle, 1200) || fallback.zonasDanadasDetalle,
  observacionesGenerales:
    normalizeUpperText(data.observacionesGenerales, 1200) || fallback.observacionesGenerales,
  resumenGeneral: normalizeUpperText(data.resumenGeneral, 1800) || fallback.resumenGeneral,
});

const buildChecklistTemplateBaseData = (
  vehicle: any,
  checklist: Partial<IVehicleInspectionChecklistDocument> & {
    items?: ChecklistInputRow[];
    damageZones?: DamageZoneInputRow[];
  }
): ChecklistTemplateData => {
  const items = Array.isArray(checklist.items)
    ? checklist.items.map((item) => sanitizeChecklistItem(item))
    : [];
  const zones = Array.isArray(checklist.damageZones)
    ? checklist.damageZones.map((zone) => sanitizeDamageZone(zone))
    : [];

  const failingItems = items.filter((item) => item.status === 'mal');
  const passingItems = items.filter((item) => item.status === 'bien');
  const damagedZones = zones.filter((zone) => zone.status === 'mal');
  const healthyZones = zones.filter((zone) => zone.status === 'bien');

  const pendingDetail = joinSummaryLines(
    failingItems.map((row) => formatChecklistItemForSummary(row)),
    1400
  );
  const zonesDetail = joinSummaryLines(
    damagedZones.map((row) => formatDamageZoneForSummary(row)),
    1200
  );

  const summaryGeneral = joinSummaryLines(
    [
      `VEHICULO ${normalizeUpperText(vehicle?.marca, 30)} ${normalizeUpperText(vehicle?.modelo, 30)} ${normalizeUpperText(vehicle?.placa, 12)}`.trim(),
      `COMPONENTES ${items.length} BIEN ${passingItems.length} MAL ${failingItems.length}`,
      `ZONAS ${zones.length} BIEN ${healthyZones.length} MAL ${damagedZones.length}`,
      `ENTREGA ${normalizeUpperText(checklist.deliveredByName, 55) || 'NO ESPECIFICADO'}`,
      normalizeUpperText(checklist.generalObservations, 500),
    ],
    1800
  );

  const base: ChecklistTemplateData = {
    placa: normalizeUpperText(vehicle?.placa, 12),
    marca: normalizeUpperText(vehicle?.marca, 40),
    modelo: normalizeUpperText(vehicle?.modelo, 40),
    anio: normalizeDigitsText((vehicle as any)?.['a\u00f1o'], 4),
    color: normalizeUpperText(vehicle?.color, 35),
    inspectorNombre: normalizeUpperText(checklist.inspectorName, 60),
    fechaInspeccion: formatInspectionDate(checklist.inspectionDate),
    quienEntrega: normalizeUpperText(checklist.deliveredByName, 60),
    totalComponentes: String(items.length),
    componentesBien: String(passingItems.length),
    componentesMal: String(failingItems.length),
    totalZonas: String(zones.length),
    zonasBien: String(healthyZones.length),
    zonasMal: String(damagedZones.length),
    pendientesDetalle: pendingDetail || 'SIN COMPONENTES PENDIENTES',
    zonasDanadasDetalle: zonesDetail || 'SIN ZONAS CON DANO VISUAL',
    observacionesGenerales:
      normalizeUpperText(checklist.generalObservations, 1200) || 'SIN OBSERVACIONES GENERALES',
    resumenGeneral: summaryGeneral || 'CHECKLIST SIN INFORMACION ADICIONAL',
  };

  return sanitizeChecklistTemplateData(base, base);
};

const getMessageContentAsText = (responseData: OpenAICompletionResponse) => {
  const content = responseData?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('\n')
      .trim();
  }

  return '';
};

const parseJsonFromModelContent = (content: string) => {
  const trimmed = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('La respuesta del modelo no contiene JSON valido.');
    }

    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
};

const enrichChecklistTemplateDataWithAI = async (
  baseData: ChecklistTemplateData,
  vehicle: any,
  checklist: Partial<IVehicleInspectionChecklistDocument>
): Promise<ChecklistTemplateData> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw createHttpError(
      503,
      'Diligenciamiento con IA no configurado. Falta OPENAI_API_KEY.',
      { missingEnv: ['OPENAI_API_KEY'] }
    );
  }

  const prompt = [
    'Completa y normaliza datos para diligenciar un checklist vehicular en PDF editable.',
    'Responde SOLO JSON valido con EXACTAMENTE estas claves:',
    JSON.stringify(Object.keys(baseData)),
    'Reglas:',
    '- Mantener MAYUSCULAS sin tildes.',
    '- No inventar informacion faltante; dejar cadena vacia.',
    '- Los campos placa, marca, modelo, anio y color deben salir del objeto vehiculo.',
    '- Campos numericos: totalComponentes, componentesBien, componentesMal, totalZonas, zonasBien, zonasMal.',
    'Contexto:',
    JSON.stringify(
      {
        vehiculo: {
          placa: vehicle?.placa,
          marca: vehicle?.marca,
          modelo: vehicle?.modelo,
          anio: (vehicle as any)?.['a\u00f1o'],
          color: vehicle?.color,
        },
        checklist: {
          inspectorName: checklist.inspectorName,
          inspectionDate: checklist.inspectionDate,
          deliveredByName: checklist.deliveredByName,
          generalObservations: checklist.generalObservations,
          items: checklist.items,
          damageZones: checklist.damageZones,
        },
        sugerenciaBase: baseData,
      },
      null,
      2
    ),
  ].join('\n');

  try {
    const completion = await axios.post<OpenAICompletionResponse>(
      `${OPENAI_API_BASE_URL}/chat/completions`,
      {
        model: OPENAI_TEXT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Eres un asistente experto en diligenciar formularios vehiculares de Colombia. Responde solo JSON.',
          },
          { role: 'user', content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const rawContent = getMessageContentAsText(completion.data);
    if (!rawContent) {
      throw new Error('La IA no devolvio contenido util.');
    }

    const parsed = parseJsonFromModelContent(rawContent) as Partial<ChecklistTemplateData>;
    const aiSanitized = sanitizeChecklistTemplateData(parsed, baseData);

    // Datos del vehiculo se mantienen fijos para evitar mezcla o alucinaciones.
    return {
      ...aiSanitized,
      placa: baseData.placa,
      marca: baseData.marca,
      modelo: baseData.modelo,
      anio: baseData.anio,
      color: baseData.color,
    };
  } catch (error: any) {
    console.error('Error al enriquecer checklist PDF con IA:', error?.response?.data || error);
    return baseData;
  }
};

const CHECKLIST_EDITABLE_FIELD_MAP: Record<string, keyof ChecklistTemplateData> = {};

const CHECKLIST_FIELD_ALIASES: Record<keyof ChecklistTemplateData, string[]> = {
  placa: ['placa', 'placavehiculo', 'vehiculoplaca'],
  marca: ['marca', 'vehiculomarca'],
  modelo: ['modelo', 'vehiculomodelo'],
  anio: ['anio', 'ano', 'vehiculoanio', 'vehiculoano'],
  color: ['color', 'vehiculocolor'],
  inspectorNombre: ['inspectornombre', 'inspector', 'nombreinspector'],
  fechaInspeccion: ['fechainspeccion', 'fecha', 'inspeccionfecha'],
  quienEntrega: ['quienentrega', 'nombreentrega', 'entregadopor', 'entregapor'],
  totalComponentes: ['totalcomponentes', 'componentestotal'],
  componentesBien: ['componentesbien', 'biencomponentes'],
  componentesMal: ['componentesmal', 'pendientescomponentes'],
  totalZonas: ['totalzonas', 'zonastotal'],
  zonasBien: ['zonasbien', 'bienzonas'],
  zonasMal: ['zonasmal', 'danadaszonas', 'zonasdanadas'],
  pendientesDetalle: ['pendientesdetalle', 'componentespendientes', 'pendientes'],
  zonasDanadasDetalle: ['zonasdanadasdetalle', 'detallezonasdanadas', 'danoszonas'],
  observacionesGenerales: ['observacionesgenerales', 'observaciones'],
  resumenGeneral: ['resumengeneral', 'resumen', 'resumenchecklist'],
};

const resolveChecklistTemplatePdfPath = (): string | null => {
  const envTemplate = getTrimmedString(process.env.INSPECTION_CHECKLIST_TEMPLATE_PDF);
  if (envTemplate) {
    if (isTransferLikeTemplateName(path.basename(envTemplate))) {
      return null;
    }

    const envResolved = path.isAbsolute(envTemplate)
      ? envTemplate
      : path.join(TEMPLATE_DIR, envTemplate);

    if (fs.existsSync(envResolved) && !isTransferLikeTemplateName(path.basename(envResolved))) {
      return envResolved;
    }
  }

  if (!fs.existsSync(TEMPLATE_DIR)) return null;

  const pdfFiles = fs
    .readdirSync(TEMPLATE_DIR)
    .filter((name) => name.toLowerCase().endsWith('.pdf'));
  if (pdfFiles.length === 0) return null;

  const scored = pdfFiles
    .map((name) => {
      const normalized = normalizeFieldToken(name);
      const hasChecklist =
        normalized.includes('checklist') ||
        normalized.includes('inspeccion') ||
        normalized.includes('inspection');
      const hasEditable = normalized.includes('editable');
      const isTransfer = isTransferLikeTemplateName(name);
      return {
        name,
        hasChecklist,
        isTransfer,
        score: (hasChecklist ? 100 : 0) + (hasEditable ? 10 : 0),
      };
    })
    .filter((item) => item.hasChecklist && !item.isTransfer)
    .sort((a, b) => b.score - a.score);

  const selected = scored[0];
  if (!selected) {
    return null;
  }

  return path.join(TEMPLATE_DIR, selected.name);
};

const setEditablePdfTextField = (
  form: ReturnType<PDFLibDocument['getForm']>,
  fieldName: string,
  value: string
) => {
  try {
    const field = form.getTextField(fieldName);
    field.setText(value || '');
    return true;
  } catch {
    return false;
  }
};

const applyChecklistTemplateDataToEditablePdf = (
  pdfDoc: PDFLibDocument,
  data: ChecklistTemplateData
) => {
  const form = pdfDoc.getForm();
  let appliedCount = 0;
  const usedFields = new Set<string>();

  Object.entries(CHECKLIST_EDITABLE_FIELD_MAP).forEach(([fieldName, dataKey]) => {
    if (setEditablePdfTextField(form, fieldName, data[dataKey] || '')) {
      usedFields.add(fieldName);
      appliedCount += 1;
    }
  });

  const aliasIndex = new Map<string, keyof ChecklistTemplateData>();
  (Object.keys(CHECKLIST_FIELD_ALIASES) as Array<keyof ChecklistTemplateData>).forEach((dataKey) => {
    CHECKLIST_FIELD_ALIASES[dataKey].forEach((alias) => {
      aliasIndex.set(normalizeFieldToken(alias), dataKey);
    });
    aliasIndex.set(normalizeFieldToken(dataKey), dataKey);
  });

  form.getFields().forEach((field) => {
    if (!(field instanceof PDFTextField)) return;

    const fieldName = field.getName();
    if (usedFields.has(fieldName)) return;

    const normalizedFieldName = normalizeFieldToken(fieldName);
    const dataKey = aliasIndex.get(normalizedFieldName);
    if (!dataKey) return;

    field.setText(data[dataKey] || '');
    appliedCount += 1;
  });

  form.updateFieldAppearances();
  return appliedCount;
};

const buildChecklistTemplatePdfBuffer = async (
  vehicle: any,
  checklist: Partial<IVehicleInspectionChecklistDocument>
): Promise<Buffer> => {
  const templatePdfPath = resolveChecklistTemplatePdfPath();
  if (!templatePdfPath) {
    throw createHttpError(
      500,
      'No se encontro plantilla PDF editable para checklist en backend/templates.',
      {
        missingTemplateHint:
          'Sube un PDF editable de checklist con nombre que incluya "checklist" o "inspeccion" (no traspaso), o define INSPECTION_CHECKLIST_TEMPLATE_PDF apuntando a esa plantilla.',
      }
    );
  }

  const baseData = buildChecklistTemplateBaseData(vehicle, checklist as any);
  const aiData = await enrichChecklistTemplateDataWithAI(baseData, vehicle, checklist);

  const templateBytes = fs.readFileSync(templatePdfPath);
  const pdfDoc = await PDFLibDocument.load(templateBytes);
  const appliedFields = applyChecklistTemplateDataToEditablePdf(pdfDoc, aiData);

  if (appliedFields === 0) {
    throw createHttpError(
      500,
      'No se pudo mapear ningun campo de texto del PDF editable del checklist.',
      {
        templatePath: templatePdfPath,
        mappingHint:
          'Renombra los campos del PDF con nombres semanticos (ej: placa, inspectorNombre) o agrega mapeo en CHECKLIST_EDITABLE_FIELD_MAP.',
      }
    );
  }

  const output = await pdfDoc.save();
  return Buffer.from(output);
};

export const getVehicleInspectionChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id).select('_id');

    if (!vehicle) {
      res.status(404).json({ message: 'Vehiculo no encontrado' });
      return;
    }

    const checklist = await VehicleInspectionChecklist.findOne({ vehicle: id }).lean();
    if (!checklist) {
      res.json({
        vehicle: id,
        inspectorName: '',
        inspectionDate: new Date().toISOString(),
        deliveredByName: '',
        deliveredBySignature: '',
        items: [],
        damageZones: [],
        generalObservations: '',
      });
      return;
    }

    res.json(checklist);
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al obtener checklist del vehiculo',
      error: error.message,
    });
  }
};

export const upsertVehicleInspectionChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const vehicle = await Vehicle.findById(id).select('_id');
    if (!vehicle) {
      res.status(404).json({ message: 'Vehiculo no encontrado' });
      return;
    }

    const items = Array.isArray(req.body.items)
      ? req.body.items
          .map((row: ChecklistInputRow) => sanitizeChecklistItem(row))
          .filter((row: any) => row.key && row.label)
      : [];

    const damageZones = Array.isArray(req.body.damageZones)
      ? req.body.damageZones
          .map((row: DamageZoneInputRow) => sanitizeDamageZone(row))
          .filter((row: any) => row.key && row.label)
      : [];

    const payload: any = {
      inspectorName: (req.body.inspectorName || '').toString().trim(),
      inspectionDate: req.body.inspectionDate ? new Date(req.body.inspectionDate) : new Date(),
      deliveredByName: (req.body.deliveredByName || '').toString().trim(),
      deliveredBySignature: normalizeSignatureDataUrl(req.body.deliveredBySignature),
      items,
      damageZones,
      generalObservations: (req.body.generalObservations || '').toString().trim(),
      updatedBy: userId,
    };

    const checklist = await VehicleInspectionChecklist.findOneAndUpdate(
      { vehicle: id },
      {
        $set: payload,
        $setOnInsert: {
          vehicle: id,
          createdBy: userId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: 'Checklist de inspeccion guardado exitosamente',
      checklist,
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al guardar checklist del vehiculo',
      error: error.message,
    });
  }
};

export const generateVehicleInspectionChecklistPdfAI = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id).select('placa marca modelo color año');
    if (!vehicle) {
      res.status(404).json({ message: 'Vehiculo no encontrado' });
      return;
    }

    const checklist = await VehicleInspectionChecklist.findOne({ vehicle: id }).lean();
    if (!checklist) {
      res.status(400).json({
        message: 'El vehiculo no tiene checklist guardado para diligenciar el PDF.',
      });
      return;
    }

    const buffer = await buildChecklistTemplatePdfBuffer(vehicle, checklist as any);
    const fileName = `checklist-inspeccion-${vehicle.placa}-ia-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (error: any) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    res.status(statusCode).json({
      message: error?.message || 'Error al generar checklist en PDF editable con IA',
      ...(error?.extra && typeof error.extra === 'object' ? error.extra : {}),
    });
  }
};
