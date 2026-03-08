export type ExtractedVehicleType = 'suv' | 'pickup' | 'sedan' | 'hatchback';

export interface VehicleCardExtractedData {
  placa: string;
  marca: string;
  modelo: string;
  año: number | null;
  color: string;
  vin: string;
  linea: string;
  cilindrada: string;
  claseVehiculo: string;
  servicio: string;
  tipoCarroceria: string;
  numeroMotor: string;
  capacidad: string;
  numeroChasis: string;
  propietario: string;
  identificacionPropietario: string;
  prenda: string;
  tipoVehiculo: ExtractedVehicleType | null;
}

export interface VehicleCardReaderResult {
  rawText: string;
  confidence: number;
  extracted: VehicleCardExtractedData;
  detectedFields: number;
}

const LABEL_ALIASES = {
  placa: ['PLACA'],
  marca: ['MARCA', 'FABRICANTE'],
  modelo: ['LINEA', 'LINEA REFERENCIA', 'REFERENCIA', 'VERSION'],
  año: ['MODELO', 'ANO', 'ANO MODELO'],
  color: ['COLOR', 'COLOR PRINCIPAL'],
  cilindrada: ['CILINDRAJE', 'CILINDRADA', 'CILINDRAJE CC'],
  claseVehiculo: ['CLASE', 'CLASE VEHICULO', 'CLASE DE VEHICULO'],
  servicio: ['SERVICIO', 'TIPO SERVICIO'],
  numeroMotor: ['NUMERO MOTOR', 'NO MOTOR', 'NO. MOTOR', 'NRO MOTOR', 'MOTOR'],
  capacidad: ['CAPACIDAD', 'CAPACIDAD KG PSJ', 'CAPACIDAD PSJ', 'CAPACIDAD PASAJEROS'],
  vin: ['VIN', 'NUMERO VIN', 'NO VIN', 'NO. VIN', 'NRO VIN'],
  numeroChasis: ['CHASIS', 'NUMERO DE CHASIS', 'NO CHASIS', 'NO. CHASIS', 'NRO CHASIS', 'SERIE', 'NRO SERIE'],
  carroceria: ['CARROCERIA', 'TIPO CARROCERIA', 'TIPO DE CARROCERIA'],
  propietario: [
    'PROPIETARIO',
    'NOMBRE PROPIETARIO',
    'TITULAR',
    'APELLIDOS Y NOMBRES',
    'APELLIDOS NOMBRES',
    'NOMBRES Y APELLIDOS',
    'RAZON SOCIAL',
  ],
  identificacion: [
    'IDENTIFICACION',
    'NO IDENTIFICACION',
    'NO. IDENTIFICACION',
    'NRO IDENTIFICACION',
    'CEDULA',
    'NIT',
    'DOCUMENTO',
    'DOCUMENTO IDENTIDAD',
  ],
  prenda: ['PRENDA', 'LIMITACION A LA PROPIEDAD', 'PIGNORACION'],
} as const;

const ALL_LABELS = Array.from(
  new Set(Object.values(LABEL_ALIASES).flat().sort((a, b) => b.length - a.length))
);

const KNOWN_BRANDS = [
  'AUDI',
  'BMW',
  'BYD',
  'CHEVROLET',
  'CHERY',
  'CITROEN',
  'DFSK',
  'FIAT',
  'FORD',
  'FOTON',
  'HONDA',
  'HYUNDAI',
  'ISUZU',
  'JAC',
  'JEEP',
  'KIA',
  'MAZDA',
  'MERCEDES BENZ',
  'MG',
  'MITSUBISHI',
  'NISSAN',
  'PEUGEOT',
  'RENAULT',
  'SEAT',
  'SKODA',
  'SUBARU',
  'SUZUKI',
  'TOYOTA',
  'VOLKSWAGEN',
  'VOLVO',
];

const COLOR_ALIASES: Record<string, string> = {
  BLANCO: 'Blanco',
  NEGRO: 'Negro',
  GRIS: 'Gris',
  PLATA: 'Plata',
  'GRIS PLATA': 'Gris Plata',
  AZUL: 'Azul',
  ROJO: 'Rojo',
  VERDE: 'Verde',
  AMARILLO: 'Amarillo',
  BEIGE: 'Beige',
  DORADO: 'Dorado',
  MARRON: 'Marron',
  CAFE: 'Cafe',
  NARANJA: 'Naranja',
  VINOTINTO: 'Vinotinto',
  CHAMPAGNE: 'Champagne',
  TITANIO: 'Titanio',
};

const SERVICE_ALIASES: Record<string, string> = {
  PARTICULAR: 'Particular',
  PUBLICO: 'Publico',
  OFICIAL: 'Oficial',
  DIPLOMATICO: 'Diplomatico',
  ESPECIAL: 'Especial',
};

const OCR_DOCUMENT_BASE_WIDTH = 1654;
const OCR_DOCUMENT_BASE_HEIGHT = 2339;
const OCR_DOCUMENT_MARGIN = 96;
const OCR_DOCUMENT_MAX_EDGE = 3000;

const emptyExtractedData = (): VehicleCardExtractedData => ({
  placa: '',
  marca: '',
  modelo: '',
  año: null,
  color: '',
  vin: '',
  linea: '',
  cilindrada: '',
  claseVehiculo: '',
  servicio: '',
  tipoCarroceria: '',
  numeroMotor: '',
  capacidad: '',
  numeroChasis: '',
  propietario: '',
  identificacionPropietario: '',
  prenda: '',
  tipoVehiculo: null,
});

const stripAccents = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeForSearch = (value: string): string =>
  stripAccents(value)
    .toUpperCase()
    .replace(/[|()[\]{}]/g, ' ')
    .replace(/[.,;=_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeLine = (value: string): string =>
  normalizeForSearch(value.replace(/[:\-]+/g, ' '));

const cleanCandidate = (value: string): string => {
  const normalized = normalizeForSearch(value)
    .replace(/^[\s:.-]+/, '')
    .replace(/\b(?:LICENCIA DE TRANSITO|REPUBLICA DE COLOMBIA|MINISTERIO DE TRANSPORTE)\b/g, '')
    .trim();

  return normalized;
};

const trimAtNextLabel = (candidate: string): string => {
  let trimmed = candidate;

  for (const label of ALL_LABELS) {
    const labelIndex = trimmed.indexOf(` ${label} `);
    if (labelIndex > 0) {
      trimmed = trimmed.slice(0, labelIndex).trim();
    }
  }

  return trimmed.trim();
};

const findNextUsefulLine = (lines: string[], startIndex: number): string => {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const candidate = cleanCandidate(lines[index]);
    if (!candidate) continue;

    const isOnlyLabel = ALL_LABELS.some((label) => candidate === label);
    if (!isOnlyLabel) {
      return candidate;
    }
  }

  return '';
};

const extractLabeledValue = (lines: string[], labels: readonly string[]): string => {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    for (const label of labels) {
      const labelIndex = line.indexOf(label);
      if (labelIndex === -1) continue;

      const remainder = cleanCandidate(line.slice(labelIndex + label.length));
      const sameLineValue = trimAtNextLabel(remainder);
      if (sameLineValue && sameLineValue !== label) {
        return sameLineValue;
      }

      const nextLineValue = trimAtNextLabel(findNextUsefulLine(lines, index));
      if (nextLineValue && nextLineValue !== label) {
        return nextLineValue;
      }
    }
  }

  return '';
};

type OcrBoundingBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type OcrRecognitionWord = {
  text: string;
  bbox: OcrBoundingBox;
};

type OcrRecognitionLine = {
  text: string;
  bbox: OcrBoundingBox;
  words: OcrRecognitionWord[];
};

type OcrRecognitionParagraph = {
  lines: OcrRecognitionLine[];
};

type OcrRecognitionBlock = {
  paragraphs: OcrRecognitionParagraph[];
};

type OcrLayoutWord = {
  text: string;
  normalized: string;
  bbox: OcrBoundingBox;
};

type OcrLayoutLine = {
  text: string;
  normalized: string;
  words: OcrLayoutWord[];
  bbox: OcrBoundingBox;
};

const getBoxHeight = (bbox: OcrBoundingBox) =>
  Math.max(1, bbox.y1 - bbox.y0);

const buildLayoutLines = (blocks?: OcrRecognitionBlock[] | null): OcrLayoutLine[] => {
  if (!blocks?.length) {
    return [];
  }

  return blocks
    .flatMap((block) => block.paragraphs || [])
    .flatMap((paragraph) => paragraph.lines || [])
    .map((line) => ({
      text: line.text || '',
      normalized: normalizeLine(line.text || ''),
      words: (line.words || [])
        .map((word) => ({
          text: word.text || '',
          normalized: normalizeLine(word.text || ''),
          bbox: word.bbox,
        }))
        .filter((word) => word.normalized),
      bbox: line.bbox,
    }))
    .filter((line) => line.normalized && line.words.length > 0)
    .sort((left, right) => {
      const yDiff = left.bbox.y0 - right.bbox.y0;
      return Math.abs(yDiff) <= 12
        ? left.bbox.x0 - right.bbox.x0
        : yDiff;
    });
};

const findLabelMatchInWords = (words: OcrLayoutWord[], label: string) => {
  const labelTokens = label.split(' ');

  for (let index = 0; index <= words.length - labelTokens.length; index += 1) {
    const candidate = words
      .slice(index, index + labelTokens.length)
      .map((word) => word.normalized)
      .join(' ');

    if (candidate === label) {
      return {
        start: index,
        end: index + labelTokens.length - 1,
      };
    }
  }

  return null;
};

const findNextLabelStartInWords = (words: OcrLayoutWord[], startIndex: number) => {
  for (let index = startIndex; index < words.length; index += 1) {
    const startsLabel = ALL_LABELS.some((label) => findLabelMatchInWords(words.slice(index), label)?.start === 0);
    if (startsLabel) {
      return index;
    }
  }

  return -1;
};

const findNextUsefulLayoutLine = (
  lines: OcrLayoutLine[],
  startIndex: number,
  sourceBox: OcrBoundingBox
): string => {
  const sourceHeight = getBoxHeight(sourceBox);

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const candidateLine = lines[index];
    const verticalDistance = candidateLine.bbox.y0 - sourceBox.y1;

    if (verticalDistance <= sourceHeight * 0.15) {
      continue;
    }

    if (verticalDistance > sourceHeight * 3.5) {
      break;
    }

    const hasHorizontalAffinity =
      candidateLine.bbox.x0 <= sourceBox.x1 + sourceHeight * 5 &&
      candidateLine.bbox.x1 >= sourceBox.x0 - sourceHeight * 1.5;

    if (!hasHorizontalAffinity) {
      continue;
    }

    const candidate = trimAtNextLabel(cleanCandidate(candidateLine.text));
    if (!candidate) continue;

    const isOnlyLabel = ALL_LABELS.some((label) => candidate === label);
    if (!isOnlyLabel) {
      return candidate;
    }
  }

  return '';
};

const extractLabeledValueFromLayout = (
  layoutLines: OcrLayoutLine[],
  labels: readonly string[]
): string => {
  for (let lineIndex = 0; lineIndex < layoutLines.length; lineIndex += 1) {
    const line = layoutLines[lineIndex];

    for (const label of labels) {
      const match = findLabelMatchInWords(line.words, label);
      if (!match) continue;

      const nextLabelStart = findNextLabelStartInWords(line.words, match.end + 1);
      const sameLineWords = line.words.slice(
        match.end + 1,
        nextLabelStart === -1 ? undefined : nextLabelStart
      );
      const sameLineValue = trimAtNextLabel(
        cleanCandidate(sameLineWords.map((word) => word.text).join(' '))
      );

      if (sameLineValue && sameLineValue !== label) {
        return sameLineValue;
      }

      const nextLineValue = findNextUsefulLayoutLine(layoutLines, lineIndex, line.bbox);
      if (nextLineValue && nextLineValue !== label) {
        return nextLineValue;
      }
    }
  }

  return '';
};

const extractPlate = (text: string): string => {
  const match = text.match(/\b[A-Z]{3}\s?\d{3}\b|\b[A-Z]{3}\s?\d{2}[A-Z]\b/);
  return match ? match[0].replace(/\s+/g, '') : '';
};

const extractVin = (text: string): string => {
  const match = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  return match ? match[0] : '';
};

const extractIdentification = (text: string): string => {
  const match = text.match(/\b\d{5,15}\b/);
  return match ? match[0] : '';
};

const extractYear = (text: string): number | null => {
  const match = text.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
};

const normalizeBrand = (value: string, fallbackText: string): string => {
  const candidate = cleanCandidate(value);
  if (candidate) {
    const looksLikeColor = Object.keys(COLOR_ALIASES).some((color) => candidate.includes(color));
    if (!looksLikeColor) {
      return candidate;
    }
  }

  return KNOWN_BRANDS.find((brand) => fallbackText.includes(brand)) || '';
};

const normalizeColor = (value: string, fallbackText: string): string => {
  const candidate = cleanCandidate(value);
  if (candidate) {
    if (KNOWN_BRANDS.includes(candidate)) {
      const fallbackColor = Object.entries(COLOR_ALIASES).find(([key]) => fallbackText.includes(key));
      return fallbackColor ? fallbackColor[1] : '';
    }

    const colorMatch = Object.entries(COLOR_ALIASES).find(([key]) => candidate.includes(key));
    return colorMatch ? colorMatch[1] : candidate;
  }

  const fallbackColor = Object.entries(COLOR_ALIASES).find(([key]) => fallbackText.includes(key));
  return fallbackColor ? fallbackColor[1] : '';
};

const normalizeService = (value: string, fallbackText: string): string => {
  const candidate = cleanCandidate(value);
  if (candidate) {
    const serviceMatch = Object.entries(SERVICE_ALIASES).find(([key]) => candidate.includes(key));
    if (serviceMatch) {
      return serviceMatch[1];
    }

    if (!/^\d{2,5}$/.test(candidate)) {
      return candidate;
    }
  }

  const fallbackService = Object.entries(SERVICE_ALIASES).find(([key]) => fallbackText.includes(key));
  return fallbackService ? fallbackService[1] : '';
};

const normalizeMechanicalValue = (value: string): string => {
  const candidate = cleanCandidate(value);
  return candidate === 'REG' ? '' : candidate;
};

const normalizeCilindrada = (value: string): string => {
  const candidate = cleanCandidate(value);
  const numericMatch = candidate.match(/\b\d{2,5}\b/);

  if (numericMatch) {
    return numericMatch[0];
  }

  return candidate;
};

const normalizeOwner = (value: string): string => {
  const candidate = cleanCandidate(value)
    .replace(/\b(?:APELLIDOS Y NOMBRES|NOMBRES Y APELLIDOS|RAZON SOCIAL|PROPIETARIO|TITULAR)\b/g, '')
    .trim();

  if (!candidate || /\d/.test(candidate)) {
    return '';
  }

  return candidate;
};

const inferVehicleType = (text: string): ExtractedVehicleType | null => {
  if (text.includes('PICK UP') || text.includes('PICKUP')) return 'pickup';
  if (text.includes('HATCHBACK') || text.includes('HB')) return 'hatchback';
  if (text.includes('SUV') || text.includes('CAMPERO') || text.includes('CAMIONETA')) return 'suv';
  if (text.includes('SEDAN') || text.includes('AUTOMOVIL')) return 'sedan';
  return null;
};

const parseVehicleCardText = (rawText: string, confidence: number): VehicleCardReaderResult => {
  const normalizedText = normalizeForSearch(rawText);
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  const joinedLines = lines.join(' ');

  const placa = extractPlate(normalizedText) || extractPlate(joinedLines);
  const marca = normalizeBrand(extractLabeledValue(lines, LABEL_ALIASES.marca), normalizedText);
  const linea = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.modelo));
  const modelo = linea;
  const año =
    extractYear(extractLabeledValue(lines, LABEL_ALIASES.año)) ||
    extractYear(normalizedText) ||
    null;
  const color = normalizeColor(extractLabeledValue(lines, LABEL_ALIASES.color), normalizedText);
  const cilindrada = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.cilindrada));
  const claseVehiculo = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.claseVehiculo));
  const servicio = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.servicio));
  const numeroMotor = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.numeroMotor));
  const capacidad = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.capacidad));
  const vin =
    extractVin(normalizedText) ||
    extractVin(extractLabeledValue(lines, LABEL_ALIASES.vin).replace(/\s+/g, '')) ||
    '';
  const numeroChasis = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.vin)) || vin;
  const tipoCarroceria = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.carroceria));
  const propietario = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.propietario));
  const identificacionLabeled = cleanCandidate(
    extractLabeledValue(lines, LABEL_ALIASES.identificacion)
  );
  const identificacionPropietario =
    extractIdentification(identificacionLabeled) ||
    extractIdentification(normalizedText) ||
    '';
  const prenda = cleanCandidate(extractLabeledValue(lines, LABEL_ALIASES.prenda));
  const tipoVehiculo = inferVehicleType(`${tipoCarroceria} ${claseVehiculo} ${normalizedText}`);

  const extracted: VehicleCardExtractedData = {
    ...emptyExtractedData(),
    placa,
    marca,
    modelo,
    año,
    color,
    vin,
    linea,
    cilindrada,
    claseVehiculo,
    servicio,
    tipoCarroceria,
    numeroMotor,
    capacidad,
    numeroChasis,
    propietario,
    identificacionPropietario,
    prenda,
    tipoVehiculo,
  };

  const detectedFields = [
    extracted.placa,
    extracted.marca,
    extracted.modelo,
    extracted.año,
    extracted.color,
    extracted.vin,
    extracted.linea,
    extracted.cilindrada,
    extracted.claseVehiculo,
    extracted.servicio,
    extracted.tipoCarroceria,
    extracted.numeroMotor,
    extracted.capacidad,
    extracted.numeroChasis,
    extracted.propietario,
    extracted.identificacionPropietario,
    extracted.prenda,
    extracted.tipoVehiculo,
  ].filter(Boolean).length;

  return {
    rawText,
    confidence,
    extracted,
    detectedFields,
  };
};

/*
const parseVehicleCardRecognition = (
  rawText: string,
  confidence: number,
  blocks?: OcrRecognitionBlock[] | null
): VehicleCardReaderResult => {
  const normalizedText = normalizeForSearch(rawText);
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  const joinedLines = lines.join(' ');
  const layoutLines = buildLayoutLines(blocks);

  const extractFieldValue = (labels: readonly string[]) =>
    extractLabeledValueFromLayout(layoutLines, labels) || extractLabeledValue(lines, labels);

  const placa = extractPlate(normalizedText) || extractPlate(joinedLines);
  const marca = normalizeBrand(extractFieldValue(LABEL_ALIASES.marca), normalizedText);
  const linea = cleanCandidate(extractFieldValue(LABEL_ALIASES.modelo));
  const modelo = linea;
  const aÃ±o =
    extractYear(extractFieldValue(LABEL_ALIASES.aÃ±o)) ||
    extractYear(normalizedText) ||
    null;
  const color = normalizeColor(extractFieldValue(LABEL_ALIASES.color), normalizedText);
  const cilindrada = normalizeCilindrada(extractFieldValue(LABEL_ALIASES.cilindrada));
  const claseVehiculo = cleanCandidate(extractFieldValue(LABEL_ALIASES.claseVehiculo));
  const servicio = normalizeService(extractFieldValue(LABEL_ALIASES.servicio), normalizedText);
  const numeroMotor = normalizeMechanicalValue(extractFieldValue(LABEL_ALIASES.numeroMotor));
  const capacidad = cleanCandidate(extractFieldValue(LABEL_ALIASES.capacidad));
  const vinLabeled = cleanCandidate(extractFieldValue(LABEL_ALIASES.vin)).replace(/\s+/g, '');
  const numeroChasisLabeled = normalizeMechanicalValue(
    extractFieldValue(LABEL_ALIASES.numeroChasis)
  );
  const vin =
    extractVin(vinLabeled) ||
    extractVin(numeroChasisLabeled.replace(/\s+/g, '')) ||
    extractVin(normalizedText) ||
    '';
  const numeroChasis = cleanCandidate(numeroChasisLabeled || vinLabeled || vin);
  const tipoCarroceria = cleanCandidate(extractFieldValue(LABEL_ALIASES.carroceria));
  const propietario = normalizeOwner(extractFieldValue(LABEL_ALIASES.propietario));
  const identificacionLabeled = cleanCandidate(extractFieldValue(LABEL_ALIASES.identificacion));
  const identificacionPropietario =
    extractIdentification(identificacionLabeled) ||
    extractIdentification(normalizedText) ||
    '';
  const prenda = cleanCandidate(extractFieldValue(LABEL_ALIASES.prenda));
  const tipoVehiculo = inferVehicleType(`${tipoCarroceria} ${claseVehiculo} ${normalizedText}`);

  const extracted: VehicleCardExtractedData = {
    ...emptyExtractedData(),
    placa,
    marca,
    modelo,
    aÃ±o,
    color,
    vin,
    linea,
    cilindrada,
    claseVehiculo,
    servicio,
    tipoCarroceria,
    numeroMotor,
    capacidad,
    numeroChasis,
    propietario,
    identificacionPropietario,
    prenda,
    tipoVehiculo,
  };

  const detectedFields = [
    extracted.placa,
    extracted.marca,
    extracted.modelo,
    extracted.aÃ±o,
    extracted.color,
    extracted.vin,
    extracted.linea,
    extracted.cilindrada,
    extracted.claseVehiculo,
    extracted.servicio,
    extracted.tipoCarroceria,
    extracted.numeroMotor,
    extracted.capacidad,
    extracted.numeroChasis,
    extracted.propietario,
    extracted.identificacionPropietario,
    extracted.prenda,
    extracted.tipoVehiculo,
  ].filter(Boolean).length;

  return {
    rawText,
    confidence,
    extracted,
    detectedFields,
  };
};

*/

const parseVehicleCardRecognition = (
  rawText: string,
  confidence: number,
  blocks?: OcrRecognitionBlock[] | null
): VehicleCardReaderResult => {
  const normalizedText = normalizeForSearch(rawText);
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  const joinedLines = lines.join(' ');
  const layoutLines = buildLayoutLines(blocks);

  const extractFieldValue = (labels: readonly string[]) =>
    extractLabeledValueFromLayout(layoutLines, labels) || extractLabeledValue(lines, labels);

  const placa = extractPlate(normalizedText) || extractPlate(joinedLines);
  const marca = normalizeBrand(extractFieldValue(LABEL_ALIASES.marca), normalizedText);
  const linea = cleanCandidate(extractFieldValue(LABEL_ALIASES.modelo));
  const modelo = linea;
  const yearValue =
    extractYear(extractFieldValue(LABEL_ALIASES['a\u00f1o'])) ||
    extractYear(normalizedText) ||
    null;
  const color = normalizeColor(extractFieldValue(LABEL_ALIASES.color), normalizedText);
  const cilindrada = normalizeCilindrada(extractFieldValue(LABEL_ALIASES.cilindrada));
  const claseVehiculo = cleanCandidate(extractFieldValue(LABEL_ALIASES.claseVehiculo));
  const servicio = normalizeService(extractFieldValue(LABEL_ALIASES.servicio), normalizedText);
  const numeroMotor = normalizeMechanicalValue(extractFieldValue(LABEL_ALIASES.numeroMotor));
  const capacidad = cleanCandidate(extractFieldValue(LABEL_ALIASES.capacidad));
  const vinLabeled = cleanCandidate(extractFieldValue(LABEL_ALIASES.vin)).replace(/\s+/g, '');
  const numeroChasisLabeled = normalizeMechanicalValue(
    extractFieldValue(LABEL_ALIASES.numeroChasis)
  );
  const vin =
    extractVin(vinLabeled) ||
    extractVin(numeroChasisLabeled.replace(/\s+/g, '')) ||
    extractVin(normalizedText) ||
    '';
  const numeroChasis = cleanCandidate(numeroChasisLabeled || vinLabeled || vin);
  const tipoCarroceria = cleanCandidate(extractFieldValue(LABEL_ALIASES.carroceria));
  const propietario = normalizeOwner(extractFieldValue(LABEL_ALIASES.propietario));
  const identificacionLabeled = cleanCandidate(extractFieldValue(LABEL_ALIASES.identificacion));
  const identificacionPropietario =
    extractIdentification(identificacionLabeled) ||
    extractIdentification(normalizedText) ||
    '';
  const prenda = cleanCandidate(extractFieldValue(LABEL_ALIASES.prenda));
  const tipoVehiculo = inferVehicleType(`${tipoCarroceria} ${claseVehiculo} ${normalizedText}`);

  const extracted: VehicleCardExtractedData = {
    ...emptyExtractedData(),
    placa,
    marca,
    modelo,
    ['a\u00f1o']: yearValue,
    color,
    vin,
    linea,
    cilindrada,
    claseVehiculo,
    servicio,
    tipoCarroceria,
    numeroMotor,
    capacidad,
    numeroChasis,
    propietario,
    identificacionPropietario,
    prenda,
    tipoVehiculo,
  };

  const detectedFields = [
    extracted.placa,
    extracted.marca,
    extracted.modelo,
    extracted['a\u00f1o'],
    extracted.color,
    extracted.vin,
    extracted.linea,
    extracted.cilindrada,
    extracted.claseVehiculo,
    extracted.servicio,
    extracted.tipoCarroceria,
    extracted.numeroMotor,
    extracted.capacidad,
    extracted.numeroChasis,
    extracted.propietario,
    extracted.identificacionPropietario,
    extracted.prenda,
    extracted.tipoVehiculo,
  ].filter(Boolean).length;

  return {
    rawText,
    confidence,
    extracted,
    detectedFields,
  };
};

const loadImageElement = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo cargar la imagen de la tarjeta.'));
    };

    image.src = objectUrl;
  });

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  return canvas;
};

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('No se pudo preparar la imagen para OCR.'));
    }, 'image/png');
  });

const renderBlobToCanvas = async (file: Blob, scaleFactor = 1): Promise<HTMLCanvasElement> => {
  const image = await loadImageElement(file);
  const canvas = createCanvas(
    Math.max(1, Math.round(image.width * scaleFactor)),
    Math.max(1, Math.round(image.height * scaleFactor))
  );
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('No se pudo preparar la imagen de la tarjeta.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas;
};

const getDocumentCanvasSize = (imageWidth: number, imageHeight: number) => {
  const baseWidth = OCR_DOCUMENT_BASE_HEIGHT;
  const baseHeight = OCR_DOCUMENT_BASE_WIDTH;
  const usableWidth = baseWidth - OCR_DOCUMENT_MARGIN * 2;
  const usableHeight = baseHeight - OCR_DOCUMENT_MARGIN * 2;
  const fitScale = Math.min(usableWidth / imageWidth, usableHeight / imageHeight);
  const upscaleFactor = fitScale < 1 ? 1 / fitScale : 1;
  const maxScale = OCR_DOCUMENT_MAX_EDGE / Math.max(baseWidth, baseHeight);
  const pageScale = Math.min(upscaleFactor, maxScale);

  return {
    width: Math.max(1, Math.round(baseWidth * pageScale)),
    height: Math.max(1, Math.round(baseHeight * pageScale)),
    margin: Math.max(24, Math.round(OCR_DOCUMENT_MARGIN * pageScale)),
  };
};

const createPdfPageImageForOcr = async (file: Blob): Promise<Blob> => {
  const image = await loadImageElement(file);
  const pageSize = getDocumentCanvasSize(image.width, image.height);
  const canvas = createCanvas(pageSize.width, pageSize.height);
  const context = canvas.getContext('2d');

  if (!context) {
    return file;
  }

  const maxWidth = pageSize.width - pageSize.margin * 2;
  const maxHeight = pageSize.height - pageSize.margin * 2;
  const fitScale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * fitScale));
  const drawHeight = Math.max(1, Math.round(image.height * fitScale));
  const offsetX = Math.round((pageSize.width - drawWidth) / 2);
  const offsetY = Math.round((pageSize.height - drawHeight) / 2);

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, pageSize.width, pageSize.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  return canvasToBlob(canvas);
};

const applyCanvasOcrEnhancement = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const grayscale = 0.299 * red + 0.587 * green + 0.114 * blue;
    const contrasted = Math.max(0, Math.min(255, (grayscale - 128) * 1.7 + 128));
    const boosted = contrasted > 182 ? 255 : contrasted < 68 ? 0 : contrasted;

    pixels[index] = boosted;
    pixels[index + 1] = boosted;
    pixels[index + 2] = boosted;
  }

  context.putImageData(imageData, 0, 0);
};

const enhanceImageForOcr = async (file: Blob): Promise<Blob> => {
  const image = await loadImageElement(file);
  const scaleFactor = image.width < 1500 ? 2 : 1.35;
  const canvas = await renderBlobToCanvas(file, scaleFactor);

  applyCanvasOcrEnhancement(canvas);
  return canvasToBlob(canvas);
};

type OcrProgressState = {
  start: number;
  end: number;
  onProgress?: (progress: number) => void;
};

const buildProgressLogger = (state: OcrProgressState) => {
  return (message: { status?: string; progress?: number }) => {
    if (message.status === 'recognizing text' && typeof message.progress === 'number') {
      const span = state.end - state.start;
      state.onProgress?.(Math.round(state.start + message.progress * span));
    }
  };
};

const createOcrWorker = async (progressState: OcrProgressState) => {
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const worker = await createWorker('spa+eng', OEM.LSTM_ONLY, {
    logger: buildProgressLogger(progressState),
  });

  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });

  return worker;
};

type OcrWorker = Awaited<ReturnType<typeof createOcrWorker>>;

const runRecognition = async (
  worker: OcrWorker,
  progressState: OcrProgressState,
  file: File | Blob,
  startProgress: number,
  endProgress: number,
  onProgress?: (progress: number) => void
) => {
  progressState.start = startProgress;
  progressState.end = endProgress;
  progressState.onProgress = onProgress;
  onProgress?.(startProgress);

  const recognition = await worker.recognize(file, {
    rotateAuto: true,
  }, {
    blocks: true,
  });
  onProgress?.(endProgress);

  return parseVehicleCardRecognition(
    recognition.data.text || '',
    recognition.data.confidence || 0,
    recognition.data.blocks as OcrRecognitionBlock[] | null | undefined
  );
};

type ExtractedTextField = Exclude<keyof VehicleCardExtractedData, 'año' | 'tipoVehiculo'>;

const isValidPlate = (value: string) =>
  /\b[A-Z]{3}\d{3}\b|\b[A-Z]{3}\d{2}[A-Z]\b/.test(value);

const isValidVin = (value: string) =>
  /^[A-HJ-NPR-Z0-9]{17}$/.test(value);

const isValidIdentification = (value: string) =>
  /^\d{5,15}$/.test(value);

const scoreExtractedText = (field: ExtractedTextField, value: string): number => {
  const candidate = cleanCandidate(value);
  if (!candidate) return 0;

  switch (field) {
    case 'placa':
      return isValidPlate(candidate) ? 100 : 10;
    case 'vin':
    case 'numeroChasis':
      if (isValidVin(candidate)) return 100;
      return /^[A-Z0-9]{6,20}$/.test(candidate) ? 45 : 5;
    case 'marca':
      if (KNOWN_BRANDS.includes(candidate)) return 95;
      return /^[A-Z ]{2,20}$/.test(candidate) ? 40 : 5;
    case 'identificacionPropietario':
      return isValidIdentification(candidate) ? 90 : 5;
    case 'numeroMotor':
      return /^[A-Z0-9-]{4,25}$/.test(candidate) ? 60 : 5;
    case 'propietario':
      if (/\d/.test(candidate)) return 5;
      return candidate.split(' ').length >= 2 && candidate.length <= 40 ? 70 : 20;
    case 'color':
      return Object.keys(COLOR_ALIASES).some((color) => candidate.includes(color)) ? 70 : 25;
    case 'cilindrada':
      return /^\d{2,5}$/.test(candidate) ? 65 : 10;
    case 'capacidad':
      return /^\d{1,4}(?:\s+\d{1,4})?$/.test(candidate) ? 55 : 10;
    case 'modelo':
    case 'linea':
      if (candidate.length > 28) return 5;
      return candidate.length >= 2 ? 55 : 10;
    case 'claseVehiculo':
    case 'servicio':
    case 'tipoCarroceria':
    case 'prenda':
      return candidate.length <= 30 ? 45 : 10;
    default:
      return candidate.length <= 40 ? 35 : 5;
  }
};

const pickPreferredText = (
  field: ExtractedTextField,
  primary: string,
  secondary: string
) => {
  const primaryScore = scoreExtractedText(field, primary);
  const secondaryScore = scoreExtractedText(field, secondary);

  if (secondaryScore > primaryScore) {
    return secondary;
  }

  return primary;
};

const pickPreferredYear = (
  primary: number | null,
  secondary: number | null
) => {
  const currentYear = new Date().getFullYear() + 1;
  const isPrimaryValid = typeof primary === 'number' && primary >= 1900 && primary <= currentYear;
  const isSecondaryValid = typeof secondary === 'number' && secondary >= 1900 && secondary <= currentYear;

  if (!isPrimaryValid && isSecondaryValid) return secondary;
  return primary;
};

const countDetectedFields = (extracted: VehicleCardExtractedData) =>
  [
    extracted.placa,
    extracted.marca,
    extracted.modelo,
    extracted.año,
    extracted.color,
    extracted.vin,
    extracted.linea,
    extracted.cilindrada,
    extracted.claseVehiculo,
    extracted.servicio,
    extracted.tipoCarroceria,
    extracted.numeroMotor,
    extracted.capacidad,
    extracted.numeroChasis,
    extracted.propietario,
    extracted.identificacionPropietario,
    extracted.prenda,
    extracted.tipoVehiculo,
  ].filter(Boolean).length;

const mergeVehicleCardResults = (
  baseResult: VehicleCardReaderResult,
  enhancedResult: VehicleCardReaderResult
): VehicleCardReaderResult => {
  const extracted: VehicleCardExtractedData = {
    ...emptyExtractedData(),
    placa: pickPreferredText('placa', baseResult.extracted.placa, enhancedResult.extracted.placa),
    marca: pickPreferredText('marca', baseResult.extracted.marca, enhancedResult.extracted.marca),
    modelo: pickPreferredText('modelo', baseResult.extracted.modelo, enhancedResult.extracted.modelo),
    año: pickPreferredYear(baseResult.extracted.año, enhancedResult.extracted.año),
    color: pickPreferredText('color', baseResult.extracted.color, enhancedResult.extracted.color),
    vin: pickPreferredText('vin', baseResult.extracted.vin, enhancedResult.extracted.vin),
    linea: pickPreferredText('linea', baseResult.extracted.linea, enhancedResult.extracted.linea),
    cilindrada: pickPreferredText('cilindrada', baseResult.extracted.cilindrada, enhancedResult.extracted.cilindrada),
    claseVehiculo: pickPreferredText(
      'claseVehiculo',
      baseResult.extracted.claseVehiculo,
      enhancedResult.extracted.claseVehiculo
    ),
    servicio: pickPreferredText('servicio', baseResult.extracted.servicio, enhancedResult.extracted.servicio),
    tipoCarroceria: pickPreferredText(
      'tipoCarroceria',
      baseResult.extracted.tipoCarroceria,
      enhancedResult.extracted.tipoCarroceria
    ),
    numeroMotor: pickPreferredText(
      'numeroMotor',
      baseResult.extracted.numeroMotor,
      enhancedResult.extracted.numeroMotor
    ),
    capacidad: pickPreferredText('capacidad', baseResult.extracted.capacidad, enhancedResult.extracted.capacidad),
    numeroChasis: pickPreferredText(
      'numeroChasis',
      baseResult.extracted.numeroChasis,
      enhancedResult.extracted.numeroChasis
    ),
    propietario: pickPreferredText(
      'propietario',
      baseResult.extracted.propietario,
      enhancedResult.extracted.propietario
    ),
    identificacionPropietario: pickPreferredText(
      'identificacionPropietario',
      baseResult.extracted.identificacionPropietario,
      enhancedResult.extracted.identificacionPropietario
    ),
    prenda: pickPreferredText('prenda', baseResult.extracted.prenda, enhancedResult.extracted.prenda),
    tipoVehiculo: baseResult.extracted.tipoVehiculo || enhancedResult.extracted.tipoVehiculo,
  };

  return {
    rawText:
      enhancedResult.detectedFields > baseResult.detectedFields
        ? enhancedResult.rawText
        : baseResult.rawText,
    confidence: Math.max(baseResult.confidence, enhancedResult.confidence),
    extracted,
    detectedFields: countDetectedFields(extracted),
  };
};

const shouldRetryWithEnhancedPass = (result: VehicleCardReaderResult) =>
  result.detectedFields <= 4 ||
  (
    result.confidence < 55 &&
    (!result.extracted.placa || !result.extracted.modelo || !result.extracted.propietario)
  );

export const readVehicleCard = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<VehicleCardReaderResult> => {
  const progressState: OcrProgressState = {
    start: 0,
    end: 100,
    onProgress,
  };
  const worker = await createOcrWorker(progressState);

  try {
    // Tesseract.js no procesa PDF como entrada. Para aproximar ese flujo,
    // normalizamos la foto a una pagina tipo documento antes del OCR.
    const documentImage = await createPdfPageImageForOcr(file).catch(() => file);
    const baseResult = await runRecognition(worker, progressState, documentImage, 0, 62, onProgress);

    if (!shouldRetryWithEnhancedPass(baseResult)) {
      onProgress?.(100);
      return baseResult;
    }

    try {
      const enhancedImage = await enhanceImageForOcr(documentImage);
      const enhancedResult = await runRecognition(
        worker,
        progressState,
        enhancedImage,
        62,
        100,
        onProgress
      );
      onProgress?.(100);
      const mergedResult = mergeVehicleCardResults(baseResult, enhancedResult);

      return mergedResult.detectedFields > baseResult.detectedFields
        ? mergedResult
        : baseResult;
    } catch {
      onProgress?.(100);
      return baseResult;
    }
  } finally {
    await worker.terminate();
  }
};
