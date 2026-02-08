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
  getMonthlyReports,
  exportVehicleReport,
  exportMonthlyReport,
  exportExpensesTemplate,
  saveSaleData,
  generateContract,
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
router.get('/reports/monthly', getMonthlyReports);
router.get('/reports/monthly/export', exportMonthlyReport);
router.get('/expiring-documents', getVehiclesWithExpiringDocuments);
router.get('/export', exportToExcel);
router.get('/:id', getVehicleById);
router.get('/:id/export', exportVehicleReport);
router.get('/:id/expenses-template', exportExpensesTemplate);
router.put('/:id', authorize('admin', 'vendedor'), updateVehicle);
router.delete('/:id', authorize('admin'), deleteVehicle);

// Ruta para subir fotos
router.post('/:id/photos', authorize('admin', 'vendedor'), uploadMultiple, uploadPhotos);

// Rutas para contratos de compraventa
router.post('/:id/sale-data', authorize('admin', 'vendedor'), saveSaleData);
router.put('/:id/sale-data', authorize('admin', 'vendedor'), saveSaleData); // Reutiliza la misma función
router.get('/:id/contract', authorize('admin', 'vendedor'), generateContract);

export default router;
