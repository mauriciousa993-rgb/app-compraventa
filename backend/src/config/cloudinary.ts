import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Configurar Cloudinary con las variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verificar si Cloudinary está configurado
export const isCloudinaryConfigured = (): boolean => {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

// Configuración del almacenamiento con Cloudinary
export const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (_req: any, file: any) => {
    const ext = ((file?.originalname || '').split('.').pop() || '').toLowerCase();
    const isPdf = ext === 'pdf' || file?.mimetype === 'application/pdf';

    return {
      folder: 'vehiculos',
      resource_type: 'auto',
      allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'pdf'],
      ...(isPdf
        ? {}
        : {
            transformation: [
              { width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
            ],
          }),
    };
  },
});

/**
 * Estado real de la conexion con Cloudinary.
 *
 * Tener las tres variables no garantiza que las credenciales sirvan: si son
 * invalidas, la subida falla en caliente y la foto no queda en ningun lado.
 * Por eso al arrancar se hace un ping y el resultado queda disponible para los
 * logs y para la raiz de la API.
 */
export type EstadoCloudinary = {
  configurado: boolean;
  verificado: boolean;
  error: string | null;
};

let estado: EstadoCloudinary = {
  configurado: isCloudinaryConfigured(),
  verificado: false,
  error: null,
};

export const getEstadoCloudinary = (): EstadoCloudinary => estado;

export const verificarCloudinary = async (): Promise<EstadoCloudinary> => {
  const configurado = isCloudinaryConfigured();

  if (!configurado) {
    estado = { configurado: false, verificado: false, error: null };
    return estado;
  }

  try {
    await cloudinary.api.ping();
    estado = { configurado: true, verificado: true, error: null };
  } catch (error: any) {
    estado = {
      configurado: true,
      verificado: false,
      error: error?.error?.message || error?.message || 'Cloudinary rechazo las credenciales',
    };
  }

  return estado;
};

// Exportar cloudinary y multer configurados
export { cloudinary, multer };
