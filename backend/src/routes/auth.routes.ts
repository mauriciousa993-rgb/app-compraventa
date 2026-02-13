import { Router, Request, Response } from 'express';
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
import User from '../models/User';

const router = Router();

// Rutas públicas
// NOTA: La ruta de registro público ha sido eliminada por seguridad
// Solo el administrador puede crear nuevos usuarios
router.post('/login', login);

// Ruta temporal para crear el primer admin (solo si no existe ningún admin)
// Esta ruta se puede eliminar después de crear el primer admin
router.post('/setup-admin', async (req: Request, res: Response) => {
  try {
    // Verificar si ya existe algún usuario admin
    const adminExistente = await User.findOne({ rol: 'admin' });
    if (adminExistente) {
      res.status(403).json({ 
        message: 'Ya existe un administrador. Usa el login normal o contacta al admin existente.' 
      });
      return;
    }

    // Crear el primer admin
    const { nombre, email, password } = req.body;
    
    if (!nombre || !email || !password) {
      res.status(400).json({ 
        message: 'Se requieren nombre, email y password' 
      });
      return;
    }

    const admin = new User({
      nombre,
      email,
      password,
      rol: 'admin',
      activo: true,
    });

    await admin.save();

    res.status(201).json({
      message: 'Administrador inicial creado exitosamente',
      user: {
        id: admin._id,
        nombre: admin.nombre,
        email: admin.email,
        rol: admin.rol,
      },
    });
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Error al crear administrador inicial', 
      error: error.message 
    });
  }
});


// Rutas protegidas - Solo Admin
router.post('/users/create', authenticate, authorize('admin'), createUser);
router.get('/users', authenticate, authorize('admin'), getAllUsers);
router.put('/users/:id', authenticate, authorize('admin'), updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

// Rutas protegidas - Todos los usuarios autenticados
router.get('/profile', authenticate, getProfile);

export default router;
