import { Router } from 'express';
import {
  createVehicle,
  getAllVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  getStatistics,
  exportToExcel,
  uploadPhotos,
  getVehiclesWithExpiringDocuments,
} from '../controllers/vehicle.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { uploadMultiple } from '../middleware/upload.middleware';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas de vehículos
router.post('/', authorize('admin', 'vendedor'), createVehicle);
router.get('/', getAllVehicles);
router.get('/statistics', getStatistics);
router.get('/expiring-documents', getVehiclesWithExpiringDocuments);
router.get('/export', exportToExcel);
router.get('/:id', getVehicleById);
router.put('/:id', authorize('admin', 'vendedor'), updateVehicle);
router.delete('/:id', authorize('admin'), deleteVehicle);

// Ruta para subir fotos
router.post('/:id/photos', authorize('admin', 'vendedor'), uploadMultiple, uploadPhotos);

export default router;
