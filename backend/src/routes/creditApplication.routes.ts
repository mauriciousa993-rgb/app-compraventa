import { Router } from 'express';
import {
  deleteCreditApplication,
  downloadCreditApplicationZip,
  exportCreditApplications,
  getCreditApplication,
  getCreditApplicationFileUrl,
  listCreditApplications,
  updateCreditApplication,
} from '../controllers/creditApplication.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// El panel de créditos es exclusivo del administrador
router.use(authenticate);
router.use(authorize('admin'));

// '/export' va antes que '/:id' para que no lo capture la ruta con parámetro
router.get('/export', exportCreditApplications);
router.get('/', listCreditApplications);
router.get('/:id', getCreditApplication);
router.get('/:id/zip', downloadCreditApplicationZip);
router.get('/:id/archivo', getCreditApplicationFileUrl);
router.patch('/:id', updateCreditApplication);
router.delete('/:id', deleteCreditApplication);

export default router;
