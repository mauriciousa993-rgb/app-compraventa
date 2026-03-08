export interface PropertyCardImageAdjustments {
  rotation: 0 | 90 | 180 | 270;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sharpen: number;
  upscale: number;
  binarizeThreshold: number | null;
}

export const DEFAULT_PROPERTY_CARD_IMAGE_ADJUSTMENTS: PropertyCardImageAdjustments = {
  rotation: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sharpen: 0,
  upscale: 1,
  binarizeThreshold: null,
};

export const OCR_PROPERTY_CARD_IMAGE_PRESET: PropertyCardImageAdjustments = {
  rotation: 0,
  brightness: 108,
  contrast: 138,
  saturation: 110,
  grayscale: 6,
  sharpen: 26,
  upscale: 1.05,
  binarizeThreshold: null,
};

export const OCR_HIGH_CONTRAST_PROPERTY_CARD_IMAGE_PRESET: PropertyCardImageAdjustments = {
  rotation: 0,
  brightness: 114,
  contrast: 156,
  saturation: 92,
  grayscale: 18,
  sharpen: 34,
  upscale: 1.1,
  binarizeThreshold: null,
};

export const OCR_GRAYSCALE_PROPERTY_CARD_IMAGE_PRESET: PropertyCardImageAdjustments = {
  rotation: 0,
  brightness: 118,
  contrast: 172,
  saturation: 0,
  grayscale: 72,
  sharpen: 30,
  upscale: 1.14,
  binarizeThreshold: null,
};

export const OCR_SOFT_COLOR_PROPERTY_CARD_IMAGE_PRESET: PropertyCardImageAdjustments = {
  rotation: 0,
  brightness: 104,
  contrast: 126,
  saturation: 122,
  grayscale: 0,
  sharpen: 18,
  upscale: 1.02,
  binarizeThreshold: null,
};

export const OCR_BLACK_AND_WHITE_PROPERTY_CARD_IMAGE_PRESET: PropertyCardImageAdjustments = {
  rotation: 0,
  brightness: 118,
  contrast: 176,
  saturation: 0,
  grayscale: 100,
  sharpen: 32,
  upscale: 1.16,
  binarizeThreshold: 158,
};

export const OCR_SOFT_BLACK_AND_WHITE_PROPERTY_CARD_IMAGE_PRESET: PropertyCardImageAdjustments = {
  rotation: 0,
  brightness: 114,
  contrast: 164,
  saturation: 0,
  grayscale: 100,
  sharpen: 28,
  upscale: 1.1,
  binarizeThreshold: 148,
};

export interface PropertyCardAutoEnhancementResult {
  file: File;
  documentFile: File;
  adjustments: PropertyCardImageAdjustments;
  presetKey: string;
  score: number;
}

type PropertyCardImagePresetOption = {
  key: string;
  adjustments: PropertyCardImageAdjustments;
};

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DrawableSource = HTMLCanvasElement | HTMLImageElement;

const MAX_OUTPUT_EDGE = 3200;
const CARD_PREPARE_MAX_EDGE = 1800;
const MAX_CROPPED_SOURCE_EDGE = 2600;
const MAX_AUTO_UPSCALE = 2.4;
const UPSCALE_STEP_FACTOR = 1.35;

const loadImage = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo preparar la imagen seleccionada.'));
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
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error('No se pudo generar la imagen mejorada.'));
      },
      'image/jpeg',
      0.92
    );
  });

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(new Error('No se pudo convertir la imagen a PDF.'));
    reader.readAsDataURL(blob);
  });

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getSourceDimensions = (source: DrawableSource) =>
  source instanceof HTMLCanvasElement
    ? { width: source.width, height: source.height }
    : {
        width: source.naturalWidth || source.width,
        height: source.naturalHeight || source.height,
      };

const drawSourceToCanvas = (
  source: DrawableSource,
  outputWidth: number,
  outputHeight: number,
  cropBox?: CropBox
) => {
  const targetCanvas = createCanvas(outputWidth, outputHeight);
  const context = targetCanvas.getContext('2d');

  if (!context) {
    throw new Error('No se pudo preparar la imagen seleccionada.');
  }

  const sourceDimensions = getSourceDimensions(source);
  const x = cropBox?.x ?? 0;
  const y = cropBox?.y ?? 0;
  const width = cropBox?.width ?? sourceDimensions.width;
  const height = cropBox?.height ?? sourceDimensions.height;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, x, y, width, height, 0, 0, targetCanvas.width, targetCanvas.height);

  return targetCanvas;
};

const progressivelyUpscaleCanvas = (
  sourceCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
) => {
  if (targetWidth <= sourceCanvas.width && targetHeight <= sourceCanvas.height) {
    return sourceCanvas;
  }

  let workingCanvas = sourceCanvas;

  while (workingCanvas.width < targetWidth || workingCanvas.height < targetHeight) {
    const nextWidth = Math.min(
      targetWidth,
      Math.max(workingCanvas.width + 1, Math.round(workingCanvas.width * UPSCALE_STEP_FACTOR))
    );
    const nextHeight = Math.min(
      targetHeight,
      Math.max(workingCanvas.height + 1, Math.round(workingCanvas.height * UPSCALE_STEP_FACTOR))
    );

    workingCanvas = drawSourceToCanvas(workingCanvas, nextWidth, nextHeight);
  }

  return workingCanvas;
};

const estimateAdaptiveUpscale = (width: number, height: number) => {
  const longEdge = Math.max(width, height);

  if (longEdge <= 720) return 2.35;
  if (longEdge <= 900) return 2.1;
  if (longEdge <= 1150) return 1.85;
  if (longEdge <= 1450) return 1.6;
  if (longEdge <= 1850) return 1.35;
  return 1.12;
};

const buildAutoPropertyCardImagePresets = (
  preparedCanvas: HTMLCanvasElement
): PropertyCardImagePresetOption[] => {
  const longEdge = Math.max(preparedCanvas.width, preparedCanvas.height);
  const maxAllowedUpscale = clamp(
    MAX_OUTPUT_EDGE / Math.max(1, longEdge),
    1,
    MAX_AUTO_UPSCALE
  );
  const baseUpscale = clamp(
    estimateAdaptiveUpscale(preparedCanvas.width, preparedCanvas.height),
    1,
    maxAllowedUpscale
  );
  const withUpscale = (
    adjustments: PropertyCardImageAdjustments,
    factor: number
  ): PropertyCardImageAdjustments => ({
    ...adjustments,
    upscale: clamp(adjustments.upscale * baseUpscale * factor, 1, maxAllowedUpscale),
  });

  return [
    {
      key: 'ocr-soft-bw',
      adjustments: withUpscale(OCR_SOFT_BLACK_AND_WHITE_PROPERTY_CARD_IMAGE_PRESET, 1.08),
    },
    {
      key: 'ocr-bw',
      adjustments: withUpscale(OCR_BLACK_AND_WHITE_PROPERTY_CARD_IMAGE_PRESET, 1.12),
    },
  ];
};

const applySharpen = (canvas: HTMLCanvasElement, amount: number) => {
  if (amount <= 0) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const source = imageData.data;
  const target = new Uint8ClampedArray(source);
  const width = canvas.width;
  const height = canvas.height;
  const weight = clamp(amount / 100, 0, 1) * 0.45;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel];
        const top = source[index + channel - width * 4];
        const bottom = source[index + channel + width * 4];
        const left = source[index + channel - 4];
        const right = source[index + channel + 4];
        const sharpened =
          center * (1 + weight * 4) -
          top * weight -
          bottom * weight -
          left * weight -
          right * weight;

        target[index + channel] = clamp(Math.round(sharpened), 0, 255);
      }
    }
  }

  context.putImageData(new ImageData(target, width, height), 0, 0);
};

const applyBinarization = (canvas: HTMLCanvasElement, threshold: number | null) => {
  if (threshold === null) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const normalizedThreshold = clamp(threshold, 64, 220);
  const width = canvas.width;
  const height = canvas.height;
  const lumaValues = new Float32Array(width * height);

  let globalSum = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const luma =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114;
    lumaValues[index / 4] = luma;
    globalSum += luma;
  }

  const globalMean = globalSum / Math.max(1, width * height);
  const integral = buildIntegralImage(lumaValues, width, height);
  const radius = clamp(Math.round(Math.min(width, height) * 0.028), 18, 52);
  const adaptiveOffset = clamp((200 - normalizedThreshold) * 0.34, 7, 22);
  const softness = clamp(Math.round((220 - normalizedThreshold) * 0.09), 10, 24);
  const blackValue = 14;
  const whiteValue = 246;

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);

    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const localMean = getRectangleMeanScore(integral, width, height, x0, y0, x1, y1);
      const stabilizedMean = localMean + (globalMean - localMean) * 0.18;
      let adaptiveThreshold = stabilizedMean - adaptiveOffset;

      if (stabilizedMean < 92) {
        adaptiveThreshold -= 6;
      } else if (stabilizedMean > 210) {
        adaptiveThreshold += 4;
      }

      adaptiveThreshold = adaptiveThreshold * 0.72 + normalizedThreshold * 0.28;

      const pixelIndex = (y * width + x) * 4;
      const luma = lumaValues[y * width + x];
      const diff = luma - adaptiveThreshold;

      let value = whiteValue;
      if (diff <= -softness) {
        value = blackValue;
      } else if (diff < softness) {
        const ratio = (diff + softness) / (softness * 2);
        value = Math.round(blackValue + ratio * (whiteValue - blackValue));
      }

      pixels[pixelIndex] = value;
      pixels[pixelIndex + 1] = value;
      pixels[pixelIndex + 2] = value;
    }
  }

  context.putImageData(imageData, 0, 0);
};

const smoothSeries = (values: number[], radius: number) =>
  values.map((_, index) => {
    let total = 0;
    let count = 0;

    for (
      let cursor = Math.max(0, index - radius);
      cursor <= Math.min(values.length - 1, index + radius);
      cursor += 1
    ) {
      total += values[cursor];
      count += 1;
    }

    return count ? total / count : values[index];
  });

const sampleBorderColor = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
) => {
  const border = Math.max(4, Math.round(Math.min(width, height) * 0.025));
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x >= border &&
        x < width - border &&
        y >= border &&
        y < height - border
      ) {
        continue;
      }

      const index = (y * width + x) * 4;
      red += pixels[index];
      green += pixels[index + 1];
      blue += pixels[index + 2];
      count += 1;
    }
  }

  if (!count) {
    return { red: 255, green: 255, blue: 255 };
  }

  return {
    red: red / count,
    green: green / count,
    blue: blue / count,
  };
};

const detectProjectionBounds = (
  projection: number[],
  thresholdRatio: number,
  minCoverage: number
) => {
  const smoothed = smoothSeries(projection, 6);
  const maxValue = Math.max(...smoothed, 0);
  const meanValue =
    smoothed.reduce((total, value) => total + value, 0) /
    Math.max(1, smoothed.length);
  const threshold = Math.max(maxValue * thresholdRatio, meanValue * 1.18);

  let start = smoothed.findIndex((value) => value >= threshold);
  let end = -1;

  for (let index = smoothed.length - 1; index >= 0; index -= 1) {
    if (smoothed[index] >= threshold) {
      end = index;
      break;
    }
  }

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const coverage = (end - start + 1) / Math.max(1, smoothed.length);
  if (coverage < minCoverage) {
    return null;
  }

  return { start, end };
};

const buildIntegralImage = (values: Float32Array, width: number, height: number) => {
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowTotal = 0;

    for (let x = 1; x <= width; x += 1) {
      rowTotal += values[(y - 1) * width + (x - 1)];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowTotal;
    }
  }

  return integral;
};

const getRectangleScore = (
  integral: Float64Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) => {
  const stride = width + 1;
  const left = clamp(Math.round(Math.min(x0, x1)), 0, width);
  const right = clamp(Math.round(Math.max(x0, x1)), 0, width);
  const top = clamp(Math.round(Math.min(y0, y1)), 0, height);
  const bottom = clamp(Math.round(Math.max(y0, y1)), 0, height);

  if (right <= left || bottom <= top) {
    return 0;
  }

  return (
    integral[bottom * stride + right] -
    integral[top * stride + right] -
    integral[bottom * stride + left] +
    integral[top * stride + left]
  );
};

const getRectangleMeanScore = (
  integral: Float64Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) => {
  const left = clamp(Math.round(Math.min(x0, x1)), 0, width);
  const right = clamp(Math.round(Math.max(x0, x1)), 0, width);
  const top = clamp(Math.round(Math.min(y0, y1)), 0, height);
  const bottom = clamp(Math.round(Math.max(y0, y1)), 0, height);
  const area = Math.max(1, (right - left) * (bottom - top));

  return getRectangleScore(integral, width, height, left, top, right, bottom) / area;
};

const refineVerticalBoundary = (
  integral: Float64Array,
  width: number,
  height: number,
  roughX: number,
  y0: number,
  y1: number,
  direction: 'left' | 'right',
  searchRadius: number,
  bandWidth: number
) => {
  const minX = clamp(roughX - searchRadius, 1, width - 1);
  const maxX = clamp(roughX + searchRadius, 1, width - 1);
  let bestX = roughX;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let candidate = minX; candidate <= maxX; candidate += 1) {
    const edgeMean = getRectangleMeanScore(
      integral,
      width,
      height,
      candidate - 1,
      y0,
      candidate + 1,
      y1
    );
    const insideMean =
      direction === 'left'
        ? getRectangleMeanScore(integral, width, height, candidate, y0, candidate + bandWidth, y1)
        : getRectangleMeanScore(integral, width, height, candidate - bandWidth, y0, candidate, y1);
    const outsideMean =
      direction === 'left'
        ? getRectangleMeanScore(integral, width, height, candidate - bandWidth, y0, candidate, y1)
        : getRectangleMeanScore(integral, width, height, candidate, y0, candidate + bandWidth, y1);
    const centerBias = 1 - Math.abs(candidate - roughX) / Math.max(1, searchRadius + 1);
    const score =
      edgeMean * 1.25 +
      insideMean * 0.95 -
      outsideMean * 0.82 +
      centerBias * 3.5;

    if (score > bestScore) {
      bestScore = score;
      bestX = candidate;
    }
  }

  return bestX;
};

const refineHorizontalBoundary = (
  integral: Float64Array,
  width: number,
  height: number,
  roughY: number,
  x0: number,
  x1: number,
  direction: 'top' | 'bottom',
  searchRadius: number,
  bandHeight: number
) => {
  const minY = clamp(roughY - searchRadius, 1, height - 1);
  const maxY = clamp(roughY + searchRadius, 1, height - 1);
  let bestY = roughY;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let candidate = minY; candidate <= maxY; candidate += 1) {
    const edgeMean = getRectangleMeanScore(
      integral,
      width,
      height,
      x0,
      candidate - 1,
      x1,
      candidate + 1
    );
    const insideMean =
      direction === 'top'
        ? getRectangleMeanScore(integral, width, height, x0, candidate, x1, candidate + bandHeight)
        : getRectangleMeanScore(integral, width, height, x0, candidate - bandHeight, x1, candidate);
    const outsideMean =
      direction === 'top'
        ? getRectangleMeanScore(integral, width, height, x0, candidate - bandHeight, x1, candidate)
        : getRectangleMeanScore(integral, width, height, x0, candidate, x1, candidate + bandHeight);
    const centerBias = 1 - Math.abs(candidate - roughY) / Math.max(1, searchRadius + 1);
    const score =
      edgeMean * 1.25 +
      insideMean * 0.95 -
      outsideMean * 0.82 +
      centerBias * 3.5;

    if (score > bestScore) {
      bestScore = score;
      bestY = candidate;
    }
  }

  return bestY;
};

const refinePropertyCardCropBox = (
  integral: Float64Array,
  width: number,
  height: number,
  roughCropBox: CropBox
): CropBox => {
  const roughRight = roughCropBox.x + roughCropBox.width;
  const roughBottom = roughCropBox.y + roughCropBox.height;
  const searchRadiusX = Math.max(8, Math.round(roughCropBox.width * 0.09));
  const searchRadiusY = Math.max(8, Math.round(roughCropBox.height * 0.1));
  const bandWidth = Math.max(6, Math.round(roughCropBox.width * 0.045));
  const bandHeight = Math.max(6, Math.round(roughCropBox.height * 0.05));
  const verticalTop = clamp(roughCropBox.y + Math.round(roughCropBox.height * 0.08), 0, height);
  const verticalBottom = clamp(roughBottom - Math.round(roughCropBox.height * 0.08), 0, height);

  let left = refineVerticalBoundary(
    integral,
    width,
    height,
    roughCropBox.x,
    verticalTop,
    verticalBottom,
    'left',
    searchRadiusX,
    bandWidth
  );
  let right = refineVerticalBoundary(
    integral,
    width,
    height,
    roughRight,
    verticalTop,
    verticalBottom,
    'right',
    searchRadiusX,
    bandWidth
  );

  if (right - left < roughCropBox.width * 0.45) {
    left = roughCropBox.x;
    right = roughRight;
  }

  const horizontalLeft = clamp(left + Math.round((right - left) * 0.06), 0, width);
  const horizontalRight = clamp(right - Math.round((right - left) * 0.06), 0, width);
  let top = refineHorizontalBoundary(
    integral,
    width,
    height,
    roughCropBox.y,
    horizontalLeft,
    horizontalRight,
    'top',
    searchRadiusY,
    bandHeight
  );
  let bottom = refineHorizontalBoundary(
    integral,
    width,
    height,
    roughBottom,
    horizontalLeft,
    horizontalRight,
    'bottom',
    searchRadiusY,
    bandHeight
  );

  if (bottom - top < roughCropBox.height * 0.45) {
    top = roughCropBox.y;
    bottom = roughBottom;
  }

  const finalPaddingX = Math.max(4, Math.round((right - left) * 0.012));
  const finalPaddingY = Math.max(4, Math.round((bottom - top) * 0.014));
  const x = clamp(left - finalPaddingX, 0, width - 1);
  const y = clamp(top - finalPaddingY, 0, height - 1);
  const x1 = clamp(right + finalPaddingX, x + 1, width);
  const y1 = clamp(bottom + finalPaddingY, y + 1, height);

  return {
    x,
    y,
    width: x1 - x,
    height: y1 - y,
  };
};

const detectPropertyCardCropBox = (canvas: HTMLCanvasElement): CropBox | null => {
  const context = canvas.getContext('2d');
  if (!context) return null;

  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const background = sampleBorderColor(pixels, width, height);
  const scoreMap = new Float32Array(width * height);
  const rowProjection = new Array<number>(height).fill(0);
  const colProjection = new Array<number>(width).fill(0);

  const colorDistance = (index: number) =>
    Math.abs(pixels[index] - background.red) +
    Math.abs(pixels[index + 1] - background.green) +
    Math.abs(pixels[index + 2] - background.blue);

  const luma = (index: number) =>
    pixels[index] * 0.299 +
    pixels[index + 1] * 0.587 +
    pixels[index + 2] * 0.114;

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const rightIndex = index + 4;
      const bottomIndex = index + width * 4;
      const distance = colorDistance(index);
      const edgeStrength =
        Math.abs(luma(index) - luma(rightIndex)) +
        Math.abs(luma(index) - luma(bottomIndex));
      const score =
        distance > 46 || edgeStrength > 36
          ? distance * 0.42 + edgeStrength
          : 0;

      if (score <= 0) continue;

      scoreMap[y * width + x] = score;
      rowProjection[y] += score;
      colProjection[x] += score;
    }
  }

  const rowBounds = detectProjectionBounds(rowProjection, 0.22, 0.34);
  const colBounds = detectProjectionBounds(colProjection, 0.24, 0.42);

  if (!rowBounds || !colBounds) {
    return null;
  }

  const paddingX = Math.max(8, Math.round(width * 0.025));
  const paddingY = Math.max(8, Math.round(height * 0.025));
  const roughCropBox: CropBox = {
    x: Math.max(0, colBounds.start - paddingX),
    y: Math.max(0, rowBounds.start - paddingY),
    width: Math.min(width, colBounds.end + paddingX) - Math.max(0, colBounds.start - paddingX),
    height: Math.min(height, rowBounds.end + paddingY) - Math.max(0, rowBounds.start - paddingY),
  };
  const cropBox = refinePropertyCardCropBox(
    buildIntegralImage(scoreMap, width, height),
    width,
    height,
    roughCropBox
  );
  const cropWidth = cropBox.width;
  const cropHeight = cropBox.height;

  if (
    cropWidth < width * 0.45 ||
    cropHeight < height * 0.32 ||
    cropWidth > width * 0.98 ||
    cropHeight > height * 0.98
  ) {
    return null;
  }

  const aspectRatio = cropWidth / Math.max(1, cropHeight);
  if (aspectRatio < 1.15 || aspectRatio > 2.6) {
    return null;
  }

  return {
    x: cropBox.x,
    y: cropBox.y,
    width: cropWidth,
    height: cropHeight,
  };
};

const preparePropertyCardBaseCanvas = async (file: Blob) => {
  const image = await loadImage(file);
  const { width: imageWidth, height: imageHeight } = getSourceDimensions(image);
  const detectionScale = Math.min(1, CARD_PREPARE_MAX_EDGE / Math.max(imageWidth, imageHeight));
  const detectionWidth = Math.max(1, Math.round(imageWidth * detectionScale));
  const detectionHeight = Math.max(1, Math.round(imageHeight * detectionScale));
  const detectionCanvas = drawSourceToCanvas(image, detectionWidth, detectionHeight);
  const detectedCropBox = detectPropertyCardCropBox(detectionCanvas);

  if (detectedCropBox) {
    const cropBox: CropBox = {
      x: clamp(Math.round(detectedCropBox.x / detectionScale), 0, imageWidth - 1),
      y: clamp(Math.round(detectedCropBox.y / detectionScale), 0, imageHeight - 1),
      width: clamp(
        Math.round(detectedCropBox.width / detectionScale),
        1,
        imageWidth
      ),
      height: clamp(
        Math.round(detectedCropBox.height / detectionScale),
        1,
        imageHeight
      ),
    };
    const safeCropWidth = clamp(cropBox.width, 1, imageWidth - cropBox.x);
    const safeCropHeight = clamp(cropBox.height, 1, imageHeight - cropBox.y);
    const cropScale = Math.min(
      1,
      MAX_CROPPED_SOURCE_EDGE / Math.max(safeCropWidth, safeCropHeight)
    );

    return drawSourceToCanvas(
      image,
      Math.max(1, Math.round(safeCropWidth * cropScale)),
      Math.max(1, Math.round(safeCropHeight * cropScale)),
      {
        ...cropBox,
        width: safeCropWidth,
        height: safeCropHeight,
      }
    );
  }

  const fallbackScale = Math.min(1, MAX_CROPPED_SOURCE_EDGE / Math.max(imageWidth, imageHeight));
  return drawSourceToCanvas(
    image,
    Math.max(1, Math.round(imageWidth * fallbackScale)),
    Math.max(1, Math.round(imageHeight * fallbackScale))
  );
};

const buildEditedFileName = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return `${fileName}-editada.jpg`;
  }

  return `${fileName.slice(0, dotIndex)}-editada.jpg`;
};

const buildEditedFileNameWithKey = (fileName: string, key: string) => {
  const safeKey = key.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return `${fileName}-${safeKey}.jpg`;
  }

  return `${fileName.slice(0, dotIndex)}-${safeKey}.jpg`;
};

const buildPdfFileName = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return `${fileName}.pdf`;
  }

  return `${fileName.slice(0, dotIndex)}.pdf`;
};

export const buildPropertyCardPdfFile = async (file: File): Promise<File> => {
  const { jsPDF } = await import('jspdf');
  const image = await loadImage(file);
  const width = Math.max(1, image.width);
  const height = Math.max(1, image.height);
  const orientation = width >= height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [width, height],
    compress: true,
  });
  const imageDataUrl = await blobToDataUrl(file);

  pdf.addImage(imageDataUrl, 'JPEG', 0, 0, width, height, undefined, 'FAST');

  const pdfBlob = pdf.output('blob');
  return new File([pdfBlob], buildPdfFileName(file.name), {
    type: 'application/pdf',
    lastModified: Date.now(),
  });
};

export const buildPropertyCardPreviewFilter = (
  adjustments: PropertyCardImageAdjustments
) =>
  [
    `brightness(${adjustments.brightness}%)`,
    `contrast(${adjustments.contrast}%)`,
    `saturate(${adjustments.saturation}%)`,
    `grayscale(${adjustments.grayscale}%)`,
  ].join(' ');

export const rotatePropertyCardAdjustments = (
  adjustments: PropertyCardImageAdjustments,
  direction: 'left' | 'right'
): PropertyCardImageAdjustments => {
  const step = direction === 'right' ? 90 : -90;
  const rotation = (((adjustments.rotation + step) % 360) + 360) % 360 as
    | 0
    | 90
    | 180
    | 270;

  return {
    ...adjustments,
    rotation,
  };
};

const renderAdjustedPropertyCardCanvas = async (
  source: Blob | HTMLCanvasElement,
  adjustments: PropertyCardImageAdjustments
): Promise<HTMLCanvasElement> => {
  const imageCanvas =
    source instanceof HTMLCanvasElement
      ? source
      : await preparePropertyCardBaseCanvas(source);
  const sourceWidth = imageCanvas.width;
  const sourceHeight = imageCanvas.height;
  const scale = Math.min(
    Math.max(adjustments.upscale, 0.1),
    MAX_OUTPUT_EDGE / Math.max(sourceWidth, sourceHeight)
  );
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const preparedDrawCanvas =
    scale > 1.02
      ? progressivelyUpscaleCanvas(imageCanvas, drawWidth, drawHeight)
      : scale < 0.98
        ? drawSourceToCanvas(imageCanvas, drawWidth, drawHeight)
        : imageCanvas;
  const rotateRightAngle =
    adjustments.rotation === 90 || adjustments.rotation === 270;
  const canvas = createCanvas(
    rotateRightAngle ? preparedDrawCanvas.height : preparedDrawCanvas.width,
    rotateRightAngle ? preparedDrawCanvas.width : preparedDrawCanvas.height
  );
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('No se pudo abrir el editor de imagen.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.filter = buildPropertyCardPreviewFilter(adjustments);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((adjustments.rotation * Math.PI) / 180);
  context.drawImage(
    preparedDrawCanvas,
    -preparedDrawCanvas.width / 2,
    -preparedDrawCanvas.height / 2,
    preparedDrawCanvas.width,
    preparedDrawCanvas.height
  );
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.filter = 'none';

  applySharpen(canvas, adjustments.sharpen);
  applyBinarization(canvas, adjustments.binarizeThreshold);

  return canvas;
};

const calculatePropertyCardLegibilityScore = (canvas: HTMLCanvasElement): number => {
  const context = canvas.getContext('2d');
  if (!context) return 0;

  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height).data;
  const step = Math.max(1, Math.round(Math.max(width, height) / 900));

  let count = 0;
  let sum = 0;
  let sumSq = 0;
  let edgeSum = 0;
  let clippedPixels = 0;
  let textLikePixels = 0;
  let darkTextPixels = 0;

  const getLuma = (offset: number) =>
    imageData[offset] * 0.299 +
    imageData[offset + 1] * 0.587 +
    imageData[offset + 2] * 0.114;

  for (let y = 0; y < height - step; y += step) {
    for (let x = 0; x < width - step; x += step) {
      const index = (y * width + x) * 4;
      const luma = getLuma(index);
      const right = getLuma(index + step * 4);
      const bottom = getLuma(index + step * width * 4);

      sum += luma;
      sumSq += luma * luma;
      edgeSum += Math.abs(luma - right) + Math.abs(luma - bottom);
      clippedPixels += luma < 18 || luma > 242 ? 1 : 0;
      textLikePixels += luma > 35 && luma < 215 ? 1 : 0;
      darkTextPixels += luma >= 8 && luma <= 138 ? 1 : 0;
      count += 1;
    }
  }

  if (!count) return 0;

  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  const contrast = Math.sqrt(variance);
  const edge = edgeSum / (count * 2);
  const clippedRatio = clippedPixels / count;
  const textRatio = textLikePixels / count;
  const darkTextRatio = darkTextPixels / count;
  const exposureBalance = 255 - Math.abs(mean - 172);
  const resolutionBonus =
    Math.min(28, Math.max(0, (Math.max(width, height) - 1350) / 65)) +
    Math.min(18, Math.max(0, (Math.min(width, height) - 760) / 48));
  const binaryBalance = 1 - Math.min(1, Math.abs(darkTextRatio - 0.22) / 0.22);
  const binaryFriendlyBonus = edge > 20 ? binaryBalance * 18 : 0;
  const clippingPenalty = clippedRatio * (darkTextRatio > 0.08 && edge > 18 ? 46 : 85);

  return (
    edge * 1.8 +
    contrast * 1.45 +
    exposureBalance * 0.35 +
    textRatio * 45 -
    clippingPenalty +
    resolutionBonus +
    binaryFriendlyBonus
  );
};

export const processPropertyCardImage = async (
  file: File,
  adjustments: PropertyCardImageAdjustments
): Promise<File> => {
  const preparedCanvas = await preparePropertyCardBaseCanvas(file);
  const canvas = await renderAdjustedPropertyCardCanvas(preparedCanvas, adjustments);
  const blob = await canvasToBlob(canvas);
  return new File([blob], buildEditedFileName(file.name), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
};

export const autoProcessPropertyCardImage = async (
  file: File
): Promise<PropertyCardAutoEnhancementResult> => {
  const preparedCanvas = await preparePropertyCardBaseCanvas(file);
  const presets = buildAutoPropertyCardImagePresets(preparedCanvas);
  let bestCandidate: Omit<PropertyCardAutoEnhancementResult, 'documentFile'> | null = null;

  for (const preset of presets) {
    const canvas = await renderAdjustedPropertyCardCanvas(preparedCanvas, preset.adjustments);
    const score = calculatePropertyCardLegibilityScore(canvas);
    const blob = await canvasToBlob(canvas);
    const processedFile = new File(
      [blob],
      buildEditedFileNameWithKey(file.name, preset.key),
      {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }
    );

    const candidate: Omit<PropertyCardAutoEnhancementResult, 'documentFile'> = {
      file: processedFile,
      adjustments: preset.adjustments,
      presetKey: preset.key,
      score,
    };

    if (!bestCandidate || candidate.score > bestCandidate.score) {
      bestCandidate = candidate;
    }
  }

  if (!bestCandidate) {
    throw new Error('No se pudo optimizar la imagen automaticamente.');
  }

  return {
    ...bestCandidate,
    documentFile: await buildPropertyCardPdfFile(bestCandidate.file),
  };
};
