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
  vin: ['VIN', 'CHASIS', 'SERIE', 'NUMERO DE CHASIS', 'NO CHASIS', 'NO. CHASIS', 'NRO CHASIS', 'NRO SERIE'],
  carroceria: ['CARROCERIA', 'TIPO CARROCERIA', 'TIPO DE CARROCERIA'],
  propietario: ['PROPIETARIO', 'NOMBRE PROPIETARIO', 'TITULAR'],
  identificacion: ['IDENTIFICACION', 'NO IDENTIFICACION', 'NO. IDENTIFICACION', 'NRO IDENTIFICACION', 'CEDULA', 'NIT', 'DOCUMENTO'],
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
    .replace(/\b(?:SERVICIO|CILINDRAJE|CILINDRADA|MOTOR|CAPACIDAD)\b.*$/, '')
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

const enhanceImageForOcr = async (file: File): Promise<Blob> => {
  const image = await loadImageElement(file);
  const scaleFactor = image.width < 1500 ? 2 : 1.35;
  const canvas = document.createElement('canvas');
  const width = Math.max(1, Math.round(image.width * scaleFactor));
  const height = Math.max(1, Math.round(image.height * scaleFactor));

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return file;
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
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

  return canvasToBlob(canvas);
};

const buildProgressLogger = (
  onProgress: ((progress: number) => void) | undefined,
  start: number,
  end: number
) => {
  const span = end - start;

  return (message: { status?: string; progress?: number }) => {
    if (message.status === 'recognizing text' && typeof message.progress === 'number') {
      onProgress?.(Math.round(start + message.progress * span));
    }
  };
};

const runRecognition = async (
  file: File | Blob,
  startProgress: number,
  endProgress: number,
  onProgress?: (progress: number) => void
) => {
  const { recognize } = await import('tesseract.js');
  const recognition = await recognize(file, 'spa+eng', {
    logger: buildProgressLogger(onProgress, startProgress, endProgress),
  });

  return parseVehicleCardText(
    recognition.data.text || '',
    recognition.data.confidence || 0
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
    rawText: baseResult.rawText,
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
  const baseResult = await runRecognition(file, 0, 62, onProgress);

  if (!shouldRetryWithEnhancedPass(baseResult)) {
    onProgress?.(100);
    return baseResult;
  }

  try {
    const enhancedImage = await enhanceImageForOcr(file);
    const enhancedResult = await runRecognition(enhancedImage, 62, 100, onProgress);
    onProgress?.(100);
    const mergedResult = mergeVehicleCardResults(baseResult, enhancedResult);

    return mergedResult.detectedFields > baseResult.detectedFields
      ? mergedResult
      : baseResult;
  } catch {
    onProgress?.(100);
    return baseResult;
  }
};
