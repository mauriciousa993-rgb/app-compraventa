import { Router } from 'express';
import {
  register,
  login,
  getProfile,
  getAllUsers,
  updateUser,
  deleteUser,
  createUser,
} from '../controllers/auth.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Rutas públicas
// NOTA: La ruta de registro público ha sido eliminada por seguridad
// Solo el administrador puede crear nuevos usuarios
router.post('/login', login);

// Rutas protegidas - Solo Admin
router.post('/users/create', authenticate, authorize('admin'), createUser);
router.get('/users', authenticate, authorize('admin'), getAllUsers);
router.put('/users/:id', authenticate, authorize('admin'), updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

// Rutas protegidas - Todos los usuarios autenticados
router.get('/profile', authenticate, getProfile);

export default router;
