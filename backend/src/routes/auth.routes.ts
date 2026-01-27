import { Router } from 'express';
import {
  register,
  login,
  getProfile,
  getAllUsers,
  updateUser,
  deleteUser,
} from '../controllers/auth.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Rutas públicas
router.post('/register', register);
router.post('/login', login);

// Rutas protegidas
router.get('/profile', authenticate, getProfile);
router.get('/users', authenticate, authorize('admin'), getAllUsers);
router.put('/users/:id', authenticate, authorize('admin'), updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

export default router;
