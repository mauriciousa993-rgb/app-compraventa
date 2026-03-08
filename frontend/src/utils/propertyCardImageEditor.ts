export interface PropertyCardImageAdjustments {
  rotation: 0 | 90 | 180 | 270;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sharpen: number;
}

export const DEFAULT_PROPERTY_CARD_IMAGE_ADJUSTMENTS: PropertyCardImageAdjustments = {
  rotation: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sharpen: 0,
};

export const OCR_PROPERTY_CARD_IMAGE_PRESET: PropertyCardImageAdjustments = {
  rotation: 0,
  brightness: 108,
  contrast: 138,
  saturation: 110,
  grayscale: 6,
  sharpen: 26,
};

const MAX_OUTPUT_EDGE = 2600;

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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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

const buildEditedFileName = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return `${fileName}-editada.jpg`;
  }

  return `${fileName.slice(0, dotIndex)}-editada.jpg`;
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

export const processPropertyCardImage = async (
  file: File,
  adjustments: PropertyCardImageAdjustments
): Promise<File> => {
  const image = await loadImage(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(sourceWidth, sourceHeight));
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const rotateRightAngle =
    adjustments.rotation === 90 || adjustments.rotation === 270;
  const canvas = createCanvas(
    rotateRightAngle ? drawHeight : drawWidth,
    rotateRightAngle ? drawWidth : drawHeight
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
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.filter = 'none';

  applySharpen(canvas, adjustments.sharpen);

  const blob = await canvasToBlob(canvas);
  return new File([blob], buildEditedFileName(file.name), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
};
