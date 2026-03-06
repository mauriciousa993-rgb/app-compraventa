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
  modelo: ['LINEA', 'REFERENCIA', 'LINEA REFERENCIA', 'VERSION'],
  año: ['MODELO', 'ANO', 'ANO MODELO'],
  color: ['COLOR', 'COLOR PRINCIPAL'],
  cilindrada: ['CILINDRAJE', 'CILINDRADA'],
  claseVehiculo: ['CLASE', 'CLASE VEHICULO', 'CLASE DE VEHICULO'],
  servicio: ['SERVICIO', 'TIPO SERVICIO'],
  numeroMotor: ['NUMERO MOTOR', 'NO MOTOR', 'NRO MOTOR', 'MOTOR'],
  capacidad: ['CAPACIDAD', 'CAPACIDAD KG PSJ', 'CAPACIDAD PSJ'],
  vin: ['VIN', 'CHASIS', 'SERIE', 'NUMERO DE CHASIS', 'NO CHASIS', 'NRO CHASIS', 'NRO SERIE'],
  carroceria: ['CARROCERIA', 'CLASE', 'TIPO CARROCERIA'],
  propietario: ['PROPIETARIO', 'NOMBRE PROPIETARIO'],
  identificacion: ['IDENTIFICACION', 'NO IDENTIFICACION', 'NRO IDENTIFICACION', 'CEDULA', 'NIT', 'DOCUMENTO'],
  prenda: ['PRENDA', 'LIMITACION A LA PROPIEDAD'],
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

const normalizeLine = (value: string): string => normalizeForSearch(value.replace(/[:\-]+/g, ' '));

const cleanCandidate = (value: string): string => {
  const normalized = normalizeForSearch(value)
    .replace(/^[\s:.-]+/, '')
    .replace(/\b(?:SERVICIO|CILINDRAJE|MOTOR|CAPACIDAD)\b.*$/, '')
    .trim();

  return normalized;
};

const findNextUsefulLine = (lines: string[], startIndex: number): string => {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const candidate = cleanCandidate(lines[index]);
    if (!candidate) continue;

    const isOnlyALabel = ALL_LABELS.some((label) => candidate === label);
    if (!isOnlyALabel) return candidate;
  }

  return '';
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
      if (nextLineValue) {
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
  if (candidate) return candidate;

  return KNOWN_BRANDS.find((brand) => fallbackText.includes(brand)) || '';
};

const normalizeColor = (value: string, fallbackText: string): string => {
  const candidate = cleanCandidate(value);
  if (candidate) {
    const colorMatch = Object.entries(COLOR_ALIASES).find(([key]) => candidate.includes(key));
    return colorMatch ? colorMatch[1] : candidate;
  }

  const fallbackColor = Object.entries(COLOR_ALIASES).find(([key]) => fallbackText.includes(key));
  return fallbackColor ? fallbackColor[1] : '';
};

const inferVehicleType = (text: string): ExtractedVehicleType | null => {
  if (text.includes('PICK UP') || text.includes('PICKUP')) return 'pickup';
  if (text.includes('HATCHBACK') || text.includes('HB')) return 'hatchback';
  if (text.includes('SUV') || text.includes('CAMPERO') || text.includes('CAMIONETA')) return 'suv';
  if (text.includes('SEDAN') || text.includes('AUTOMOVIL')) return 'sedan';
  return null;
};

export const readVehicleCard = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<VehicleCardReaderResult> => {
  const { recognize } = await import('tesseract.js');

  const recognition = await recognize(file, 'spa+eng', {
    logger: (message: { status?: string; progress?: number }) => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') {
        onProgress?.(Math.round(message.progress * 100));
      }
    },
  });

  const rawText = recognition.data.text || '';
  const confidence = recognition.data.confidence || 0;
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
  const identificacionPropietario =
    extractIdentification(extractLabeledValue(lines, LABEL_ALIASES.identificacion)) ||
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
