/**
 * Lectura con IA de documentos de identidad colombianos para diligenciar los
 * datos del vendedor y del comprador al generar el contrato.
 *
 * Reconoce la cedula amarilla, la cedula digital y la cedula de extranjeria,
 * tanto por el frente como por el reverso.
 */
import { Response } from 'express';
import axios from 'axios';
import { AuthRequest } from '../types';

type CedulaExtractedPayload = {
  nombres?: unknown;
  apellidos?: unknown;
  nombreCompleto?: unknown;
  tipoDocumento?: unknown;
  numeroDocumento?: unknown;
  fechaNacimiento?: unknown;
  lugarNacimiento?: unknown;
  sexo?: unknown;
  fechaExpedicion?: unknown;
  lugarExpedicion?: unknown;
  rh?: unknown;
  confidence?: unknown;
  rawText?: unknown;
};

type VisionCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type UploadedImageFile = {
  mimetype: string;
  buffer: Buffer;
};

const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1';

const TIPOS_DOCUMENTO = new Set(['CC', 'CE', 'PASAPORTE', 'NIT', 'TI']);

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Los contratos se diligencian en mayusculas, igual que el documento. */
const normalizeName = (value: unknown) => {
  const texto = normalizeText(value)
    .toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚÑÜ'\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return texto.length >= 2 && texto.length <= 80 ? texto : '';
};

const normalizeDigits = (value: unknown, minLength: number, maxLength: number) => {
  const normalized = String(value ?? '').replace(/\D/g, '');
  if (normalized.length < minLength || normalized.length > maxLength) {
    return '';
  }
  return normalized;
};

const normalizeTipoDocumento = (value: unknown) => {
  const normalized = normalizeText(value).toUpperCase().replace(/[^A-Z]/g, '');
  if (TIPOS_DOCUMENTO.has(normalized)) return normalized;
  if (normalized.includes('EXTRANJERIA')) return 'CE';
  if (normalized.includes('PASAPORTE')) return 'PASAPORTE';
  if (normalized.includes('CIUDADANIA')) return 'CC';
  return 'CC';
};

/** Normaliza a dd/mm/aaaa; si no se puede interpretar, devuelve cadena vacia. */
const normalizeFecha = (value: unknown) => {
  const texto = normalizeText(value);
  if (!texto) return '';

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const partes = texto.match(/(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})/);
  if (partes) {
    const dia = partes[1].padStart(2, '0');
    const mes = partes[2].padStart(2, '0');
    return `${dia}/${mes}/${partes[3]}`;
  }

  return '';
};

const normalizeSexo = (value: unknown) => {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized.startsWith('M')) return 'M';
  if (normalized.startsWith('F')) return 'F';
  return '';
};

const normalizeRh = (value: unknown) => {
  const normalized = normalizeText(value).toUpperCase().replace(/\s/g, '');
  return /^(A|B|AB|O)[+-]$/.test(normalized) ? normalized : '';
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

const getMessageContentAsText = (responseData: VisionCompletionResponse) => {
  const content = responseData?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('\n')
      .trim();
  }

  return '';
};

const countDetectedFields = (payload: Record<string, unknown>) =>
  Object.values(payload).filter(
    (value) => typeof value === 'string' && value.trim().length > 0
  ).length;

export const ocrCedulaWithVisionAI = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        message: 'La lectura con IA no esta configurada en el servidor. Falta OPENAI_API_KEY.',
        missingEnv: ['OPENAI_API_KEY'],
      });
      return;
    }

    const file = req.file as UploadedImageFile | undefined;
    if (!file) {
      res.status(400).json({ message: 'Debes adjuntar una foto de la cedula en el campo file.' });
      return;
    }

    if (!file.mimetype.startsWith('image/')) {
      res.status(400).json({ message: 'Solo se permiten imagenes para leer la cedula.' });
      return;
    }

    const base64 = file.buffer.toString('base64');
    const imageUrl = `data:${file.mimetype};base64,${base64}`;

    const prompt = [
      'Extrae los datos de un documento de identidad colombiano (cedula de ciudadania amarilla,',
      'cedula digital o cedula de extranjeria). La foto puede ser del frente o del reverso.',
      'Responde SOLO JSON valido con esta estructura:',
      '{',
      '  "nombres": string,',
      '  "apellidos": string,',
      '  "nombreCompleto": string,',
      '  "tipoDocumento": "CC"|"CE"|"PASAPORTE",',
      '  "numeroDocumento": string,',
      '  "fechaNacimiento": string,',
      '  "lugarNacimiento": string,',
      '  "sexo": "M"|"F"|"",',
      '  "fechaExpedicion": string,',
      '  "lugarExpedicion": string,',
      '  "rh": string,',
      '  "confidence": number,',
      '  "rawText": string',
      '}',
      'Reglas:',
      '- numeroDocumento solo digitos, sin puntos ni espacios.',
      '- nombreCompleto debe ser "NOMBRES APELLIDOS" en ese orden, en mayusculas.',
      '- Las fechas en formato dd/mm/aaaa.',
      '- Si un dato no se ve o no esta en esa cara del documento, devuelve cadena vacia.',
      '- No inventes datos ni completes con ejemplos.',
    ].join('\n');

    const completion = await axios.post<VisionCompletionResponse>(
      `${OPENAI_API_BASE_URL}/chat/completions`,
      {
        model: OPENAI_VISION_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Eres un OCR experto en documentos de identidad de Colombia. Debes responder solo JSON.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
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

    const rawModelContent = getMessageContentAsText(completion.data);
    if (!rawModelContent) {
      throw new Error('La IA no devolvio contenido util.');
    }

    const parsed = parseJsonFromModelContent(rawModelContent) as CedulaExtractedPayload;

    const nombres = normalizeName(parsed.nombres);
    const apellidos = normalizeName(parsed.apellidos);
    const nombreCompleto =
      normalizeName(parsed.nombreCompleto) || [nombres, apellidos].filter(Boolean).join(' ');

    const extracted = {
      nombres,
      apellidos,
      nombreCompleto,
      tipoDocumento: normalizeTipoDocumento(parsed.tipoDocumento),
      numeroDocumento: normalizeDigits(parsed.numeroDocumento, 5, 15),
      fechaNacimiento: normalizeFecha(parsed.fechaNacimiento),
      lugarNacimiento: normalizeText(parsed.lugarNacimiento).toUpperCase(),
      sexo: normalizeSexo(parsed.sexo),
      fechaExpedicion: normalizeFecha(parsed.fechaExpedicion),
      lugarExpedicion: normalizeText(parsed.lugarExpedicion).toUpperCase(),
      rh: normalizeRh(parsed.rh),
    };

    const detectedFields = countDetectedFields(extracted);
    const modelConfidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(99, Math.round(parsed.confidence)))
        : null;
    const fallbackConfidence = Math.max(35, Math.min(97, Math.round(40 + detectedFields * 6)));

    res.json({
      source: 'vision_ai',
      confidence: modelConfidence ?? fallbackConfidence,
      detectedFields,
      rawText: normalizeText(parsed.rawText),
      extracted,
    });
  } catch (error: any) {
    const status = error?.response?.status;
    const providerError = error?.response?.data?.error?.message || error?.response?.data?.message;

    res.status(status && status >= 400 && status < 600 ? status : 500).json({
      message: 'No se pudo leer la cedula con IA.',
      error: providerError || error?.message || 'Error desconocido',
    });
  }
};
