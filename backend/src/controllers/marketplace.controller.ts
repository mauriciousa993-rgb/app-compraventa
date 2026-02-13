import { Response } from 'express';
import Vehicle from '../models/Vehicle';
import { AuthRequest } from '../types';

// Nueva función para obtener vehículos del marketplace (público - sin autenticación)
// VERSION: 2025-01-13-v2-marketplace-fotos
export const getMarketplaceVehicles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('📸 Marketplace v2: Obteniendo vehículos con fotos...');
    const vehicles = await Vehicle.find({ estado: 'listo_venta' })

      .select('marca modelo año placa color kilometraje precioVenta fotos.exteriores fotos.interiores fotos.detalles observaciones')
      .sort({ fechaIngreso: -1 });

    res.json(vehicles);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener vehículos del marketplace', error: error.message });
  }
};
