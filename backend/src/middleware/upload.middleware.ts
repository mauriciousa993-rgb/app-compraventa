import multer from 'multer';
import { RequestHandler } from 'express';
import path from 'path';
import { ensureUploadsDir, getUploadsDir } from '../utils/uploads';
import { cloudinaryStorage, isCloudinaryConfigured } from '../config/cloudinary';

// Crear directorio de uploads si no existe (solo para almacenamiento local)
const uploadDir = ensureUploadsDir();

// Configuración de almacenamiento local
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `vehicle-${uniqueSuffix}${ext}`);
  },
});

// Filtro de archivos (solo imágenes)
const fileFilter = (req: any, file: any, cb: any) => {
  const imageTypes = /jpeg|jpg|png|gif|webp/;
  const pdfTypes = /pdf/;
  const ext = path.extname(file.originalname).toLowerCase();
  const isImage = imageTypes.test(ext) && imageTypes.test(file.mimetype);
  const isPdf = pdfTypes.test(ext) && file.mimetype === 'application/pdf';
  const isDocumentUpload = req.body?.tipo === 'documentos';

  if (isImage || (isDocumentUpload && isPdf)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        isDocumentUpload
          ? 'Solo se permiten imagenes o PDF para documentos.'
          : 'Solo se permiten archivos de imagen (jpeg, jpg, png, gif, webp)'
      )
    );
  }
};

// Seleccionar el almacenamiento según la configuración
const getStorage = () => {
  if (isCloudinaryConfigured()) {
    return cloudinaryStorage;
  }
  return localStorage;
};

/**
 * El uploader se construye en la primera subida, no al importar el modulo.
 * Asi la eleccion de almacenamiento ve siempre las variables de entorno ya
 * cargadas: si se decidia al importar, Cloudinary quedaba descartado y las
 * fotos terminaban en el disco local, que Render borra en cada despliegue.
 */
let uploader: multer.Multer | null = null;

const getUploader = (): multer.Multer => {
  if (!uploader) {
    uploader = multer({
      storage: getStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB máximo
      },
      fileFilter: fileFilter,
    });
  }
  return uploader;
};

// Se mantiene `upload` para compatibilidad con otros modulos
export const upload = {
  array: (campo: string, maximo?: number) => getUploader().array(campo, maximo),
  single: (campo: string) => getUploader().single(campo),
};

// Middleware para múltiples archivos (máximo 20 fotos)
export const uploadMultiple: RequestHandler = (req, res, next) =>
  getUploader().array('fotos', 20)(req, res, next);

// Middleware para un solo archivo
export const uploadSingle: RequestHandler = (req, res, next) =>
  getUploader().single('foto')(req, res, next);

// Exportar función para verificar si se usa Cloudinary
export const isUsingCloudinary = () => isCloudinaryConfigured();
