import { Request, Response } from 'express';
import Vehicle, { IDatosVenta } from '../models/Vehicle';
import { AuthRequest } from '../types';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { ensureUploadsDir, getPhotoFileName, getUploadsDir } from '../utils/uploads';

const calculateVehicleTotalExpenses = (vehicle: any): number => {
  const gastos = vehicle.gastos || {};
  const gastosGenerales =
    (gastos.pintura || 0) +
    (gastos.mecanica || 0) +
    (gastos.traspaso || 0) +
    (gastos.alistamiento || 0) +
    (gastos.tapiceria || 0) +
    (gastos.transporte || 0) +
    (gastos.varios || 0);

  const gastosInversionistas = (vehicle.inversionistas || []).reduce((sum: number, inv: any) => {
    const totalInv = (inv.gastos || []).reduce((acc: number, g: any) => acc + (g.monto || 0), 0);
    return sum + totalInv;
  }, 0);

  return gastosGenerales + gastosInversionistas;
};

// Crear nuevo vehículo
export const createVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const vehicleData = req.body;
    
    // Asignar el usuario que registra
    vehicleData.registradoPor = req.user?.userId;

    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();

    res.status(201).json({
      message: 'Vehículo creado exitosamente',
      vehicle,
    });
  } catch (error: any) {
    console.error('Error al crear vehículo:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({ 
        message: 'Error de validación', 
        errors: errors,
        details: error.message 
      });
      return;
    }
    
    // Manejar errores de duplicados (placa o VIN)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(400).json({ 
        message: `Ya existe un vehículo con ${field === 'placa' ? 'esta placa' : 'este VIN'}`,
        field: field
      });
      return;
    }
    
    res.status(500).json({ 
      message: 'Error al crear vehículo', 
      error: error.message 
    });
  }
};


// Obtener todos los vehículos
export const getAllVehicles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { estado, marca, modelo, año } = req.query;
    const userRole = req.user?.rol;
    
    const filter: any = {};
    
    if (estado) filter.estado = estado;
    if (marca) filter.marca = new RegExp(marca as string, 'i');
    if (modelo) filter.modelo = new RegExp(modelo as string, 'i');
    if (año) filter.año = parseInt(año as string);

    const vehicles = await Vehicle.find(filter)
      .populate('registradoPor', 'nombre email')
      .sort({ fechaIngreso: -1 });

    // Si el usuario es visualizador, ocultar información financiera
    // Los vendedores SÍ pueden ver precio de venta
    if (userRole === 'visualizador') {
      const vehiclesSinFinanzas = vehicles.map(vehicle => {
        const vehicleObj = vehicle.toObject();
        delete vehicleObj.precioCompra;
        delete vehicleObj.precioVenta;
        delete vehicleObj.gastos;
        delete vehicleObj.gastosDetallados;
        delete vehicleObj.inversionistas;
        return vehicleObj;
      });
      res.json(vehiclesSinFinanzas);
      return;
    }
    
    // Si el usuario es vendedor, ocultar solo información sensible (costos e inversionistas)
    if (userRole === 'vendedor') {
      const vehiclesVendedor = vehicles.map(vehicle => {
        const vehicleObj = vehicle.toObject();
        delete vehicleObj.precioCompra;
        delete vehicleObj.gastos;
        delete vehicleObj.gastosDetallados;
        delete vehicleObj.inversionistas;
        return vehicleObj;
      });
      res.json(vehiclesVendedor);
      return;
    }

    res.json(vehicles);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener vehículos', error: error.message });
  }
};

// Obtener vehículo por ID
export const getVehicleById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userRole = req.user?.rol;

    const vehicle = await Vehicle.findById(id).populate('registradoPor', 'nombre email');

    if (!vehicle) {
      res.status(404).json({ message: 'Vehículo no encontrado' });
      return;
    }

    // Si el usuario es visualizador, ocultar información financiera
    if (userRole === 'visualizador') {
      const vehicleObj = vehicle.toObject();
      const vehicleSinFinanzas = {
        ...vehicleObj,
        precioCompra: undefined,
        precioVenta: undefined,
        gastos: undefined,
        gastosDetallados: undefined,
        inversionistas: undefined,
      };
      res.json(vehicleSinFinanzas);
      return;
    }
    
    // Si el usuario es vendedor, ocultar solo información sensible (costos e inversionistas)
    if (userRole === 'vendedor') {
      const vehicleObj = vehicle.toObject();
      const vehicleVendedor = {
        ...vehicleObj,
        precioCompra: undefined,
        gastos: undefined,
        gastosDetallados: undefined,
        inversionistas: undefined,
      };
      res.json(vehicleVendedor);
      return;
    }


    res.json(vehicle);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener vehículo', error: error.message });
  }
};

// Actualizar vehículo
export const updateVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      res.status(404).json({ message: 'Vehículo no encontrado' });
      return;
    }

    // Usar save() para disparar hooks de mongoose (recalcula gastos.total e inversionistas)
    vehicle.set(req.body);
    await vehicle.save();
    await vehicle.populate('registradoPor', 'nombre email');

    res.json({
      message: 'Vehículo actualizado exitosamente',
      vehicle,
    });
  } catch (error: any) {
    console.error('Error al actualizar vehículo:', error);
    
    // Manejar errores de validación de Mongoose
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({ 
        message: 'Error de validación', 
        errors: errors,
        details: error.message 
      });
      return;
    }
    
    // Manejar errores de duplicados (placa o VIN)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(400).json({ 
        message: `Ya existe un vehículo con ${field === 'placa' ? 'esta placa' : 'este VIN'}`,
        field: field
      });
      return;
    }
    
    res.status(500).json({ 
      message: 'Error al actualizar vehículo', 
      error: error.message 
    });
  }
};

// Eliminar vehículo
export const deleteVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findByIdAndDelete(id);

    if (!vehicle) {
      res.status(404).json({ message: 'Vehículo no encontrado' });
      return;
    }

    // Eliminar fotos asociadas
    const allPhotos = [
      ...vehicle.fotos.exteriores,
      ...vehicle.fotos.interiores,
      ...vehicle.fotos.detalles,
      ...vehicle.fotos.documentos,
    ];

    allPhotos.forEach((photo) => {
      const fileName = getPhotoFileName(photo);
      if (!fileName) return;
      const photoPath = path.join(getUploadsDir(), fileName);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    });

    res.json({ message: 'Vehículo eliminado exitosamente' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al eliminar vehículo', error: error.message });
  }
};

// Servir foto por nombre de archivo
export const getVehiclePhoto = async (req: Request, res: Response): Promise<void> => {
  try {
    const fileName = getPhotoFileName(req.params.filename || '');
    if (!fileName) {
      res.status(404).json({ message: 'Foto no encontrada' });
      return;
    }

    const photoPath = path.join(getUploadsDir(), fileName);
    if (!fs.existsSync(photoPath)) {
      res.status(404).json({ message: 'Foto no encontrada' });
      return;
    }

    res.sendFile(photoPath);
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener foto', error: error.message });
  }
};

// Obtener estadísticas
export const getStatistics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.rol;

    const totalVehiculos = await Vehicle.countDocuments();
    const vehiculosListos = await Vehicle.countDocuments({ estado: 'listo_venta' });
    const vehiculosPendientes = await Vehicle.countDocuments({ estado: 'en_proceso' });
    const vehiculosVendidos = await Vehicle.countDocuments({ estado: 'vendido' });

    // Obtener solo vehículos que NO están vendidos (inventario actual)
    const vehiculosEnStock = await Vehicle.find({
      estado: { $in: ['en_proceso', 'listo_venta', 'en_negociacion'] },
    });

    // Obtener vehículos vendidos
    const vehiculosVendidosData = await Vehicle.find({ estado: 'vendido' });

    let valorInventario = 0;
    let totalGastos = 0;
    let gananciasEstimadas = 0;
    let gananciasReales = 0;

    // Si es admin, calcular totales completos
    if (userRole === 'admin') {
      // Valor del inventario = suma de (Precio Compra + Gastos TOTALES) de vehículos en stock
      valorInventario = vehiculosEnStock.reduce(
        (sum, vehicle) => {
          const precioCompra = vehicle.precioCompra || 0;
          const gastosTotal = calculateVehicleTotalExpenses(vehicle);
          return sum + precioCompra + gastosTotal;
        },
        0
      );

      // Total de gastos solo de vehículos en stock
      totalGastos = vehiculosEnStock.reduce(
        (sum, vehicle) => sum + calculateVehicleTotalExpenses(vehicle),
        0
      );

      // Ganancias estimadas solo de vehículos en stock
      // Fórmula: Precio Venta - Precio Compra - Gastos Totales
      gananciasEstimadas = vehiculosEnStock.reduce(
        (sum, vehicle) => {
          const precioVenta = vehicle.precioVenta || 0;
          const precioCompra = vehicle.precioCompra || 0;
          const gastosTotal = calculateVehicleTotalExpenses(vehicle);
          const utilidad = precioVenta - precioCompra - gastosTotal;
          return sum + utilidad;
        },
        0
      );

      // Ganancias reales de vehículos vendidos
      gananciasReales = vehiculosVendidosData.reduce(
        (sum, vehicle) => {
          const precioVenta = vehicle.precioVenta || 0;
          const precioCompra = vehicle.precioCompra || 0;
          const gastosTotal = calculateVehicleTotalExpenses(vehicle);
          const utilidad = precioVenta - precioCompra - gastosTotal;
          return sum + utilidad;
        },
        0
      );
    } else {
      // Para inversionistas, calcular solo SUS utilidades
      // Vehículos en stock donde el usuario es inversionista
      vehiculosEnStock.forEach(vehicle => {
        const inversionista = vehicle.inversionistas?.find(
          inv => inv.usuario?.toString() === userId
        );
        
        if (inversionista) {
          // Sumar solo la parte proporcional del inversionista
          const totalInversion = vehicle.inversionistas.reduce((sum, inv) => sum + inv.montoInversion, 0);
          const porcentaje = totalInversion > 0 ? (inversionista.montoInversion / totalInversion) : 0;
          
          const gastosInv = inversionista.gastos?.reduce((sum, g) => sum + (g.monto || 0), 0) || 0;
          valorInventario += inversionista.montoInversion + gastosInv;
          totalGastos += gastosInv;
          
          const utilidadTotal = vehicle.precioVenta - vehicle.precioCompra - calculateVehicleTotalExpenses(vehicle);
          gananciasEstimadas += utilidadTotal * porcentaje;
        }
      });

      // Vehículos vendidos donde el usuario es inversionista
      vehiculosVendidosData.forEach(vehicle => {
        const inversionista = vehicle.inversionistas?.find(
          inv => inv.usuario?.toString() === userId
        );
        
        if (inversionista) {
          gananciasReales += inversionista.utilidadCorrespondiente || 0;
        }
      });
    }

    res.json({
      totalVehiculos,
      vehiculosListos,
      vehiculosPendientes,
      vehiculosVendidos,
      valorInventario,
      totalGastos,
      gananciasEstimadas,
      gananciasReales,
      vehiculosEnStock: vehiculosEnStock.length,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al obtener estadísticas', error: error.message });
  }
};

// Exportar a Excel
export const exportToExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { estado } = req.query;
    
    const filter: any = {};
    if (estado) filter.estado = estado;

    const vehicles = await Vehicle.find(filter)
      .populate('registradoPor', 'nombre email')
      .sort({ fechaIngreso: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventario de Vehículos');

    // Definir columnas
    worksheet.columns = [
      { header: 'Placa', key: 'placa', width: 12 },
      { header: 'Marca', key: 'marca', width: 15 },
      { header: 'Modelo', key: 'modelo', width: 15 },
      { header: 'Año', key: 'año', width: 10 },
      { header: 'Color', key: 'color', width: 12 },
      { header: 'VIN', key: 'vin', width: 20 },
      { header: 'Kilometraje', key: 'kilometraje', width: 12 },
      { header: 'Precio Compra', key: 'precioCompra', width: 15 },
      { header: 'Precio Venta', key: 'precioVenta', width: 15 },
      { header: 'Ganancia', key: 'ganancia', width: 15 },
      { header: 'Estado', key: 'estado', width: 15 },
      { header: 'SOAT', key: 'soat', width: 12 },
      { header: 'Tecnomecánica', key: 'tecnomecanica', width: 15 },
      { header: 'Prenda', key: 'prenda', width: 10 },
      { header: 'Fecha Ingreso', key: 'fechaIngreso', width: 15 },
      { header: 'Registrado Por', key: 'registradoPor', width: 20 },
    ];

    // Estilo del encabezado
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Agregar datos
    vehicles.forEach((vehicle) => {
      worksheet.addRow({
        placa: vehicle.placa,
        marca: vehicle.marca,
        modelo: vehicle.modelo,
        año: vehicle.año,
        color: vehicle.color,
        vin: vehicle.vin,
        kilometraje: vehicle.kilometraje,
        precioCompra: vehicle.precioCompra,
        precioVenta: vehicle.precioVenta,
        ganancia: vehicle.precioVenta - vehicle.precioCompra,
        estado: vehicle.estado.replace('_', ' ').toUpperCase(),
        soat: vehicle.documentacion.soat.tiene ? 'Sí' : 'No',
        tecnomecanica: vehicle.documentacion.tecnomecanica.tiene ? 'Sí' : 'No',
        prenda: vehicle.documentacion.prenda.tiene ? 'Sí' : 'No',
        fechaIngreso: vehicle.fechaIngreso.toLocaleDateString('es-CO'),
        registradoPor: (vehicle.registradoPor as any).nombre || 'N/A',
      });
    });

    // Formato de moneda
    worksheet.getColumn('precioCompra').numFmt = '"$"#,##0.00';
    worksheet.getColumn('precioVenta').numFmt = '"$"#,##0.00';
    worksheet.getColumn('ganancia').numFmt = '"$"#,##0.00';

    // Generar archivo
    const fileName = `inventario-vehiculos-${Date.now()}.xlsx`;
    const filePath = path.join(ensureUploadsDir(), fileName);

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error al descargar archivo:', err);
      }
      // Eliminar archivo después de descarga
      fs.unlinkSync(filePath);
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al exportar a Excel', error: error.message });
  }
};

// Subir fotos
export const uploadPhotos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { tipo } = req.body; // 'exteriores', 'interiores', 'detalles', 'documentos'

    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      res.status(404).json({ message: 'Vehículo no encontrado' });
      return;
    }

    const files = (req.files || []) as Array<{ filename: string }>;
    const fileNames = files.map((file) => file.filename);

    if (tipo === 'exteriores') {
      vehicle.fotos.exteriores.push(...fileNames);
    } else if (tipo === 'interiores') {
      vehicle.fotos.interiores.push(...fileNames);
    } else if (tipo === 'detalles') {
      vehicle.fotos.detalles.push(...fileNames);
    } else if (tipo === 'documentos') {
      vehicle.fotos.documentos.push(...fileNames);
    }

    await vehicle.save();

    res.json({
      message: 'Fotos subidas exitosamente',
      fotos: fileNames,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al subir fotos', error: error.message });
  }
};

// Obtener vehículos con documentos próximos a vencer
export const getVehiclesWithExpiringDocuments = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const diasAlerta = 30; // Alertar 30 días antes
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + diasAlerta);

    const vehicles = await Vehicle.find({
      $or: [
        {
          'documentacion.soat.fechaVencimiento': {
            $lte: fechaLimite,
            $gte: new Date(),
          },
        },
        {
          'documentacion.tecnomecanica.fechaVencimiento': {
            $lte: fechaLimite,
            $gte: new Date(),
          },
        },
      ],
    }).populate('registradoPor', 'nombre email');

    res.json(vehicles);
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al obtener vehículos con documentos por vencer',
      error: error.message,
    });
  }
};

// Exportar reporte individual de vehículo a Excel
export const exportVehicleReport = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id).populate('registradoPor', 'nombre email');

    if (!vehicle) {
      res.status(404).json({ message: 'Vehículo no encontrado' });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Detalle del Vehículo');

    // Configurar ancho de columnas
    worksheet.columns = [
      { width: 25 },
      { width: 30 },
    ];

    // Título
    worksheet.mergeCells('A1:B1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'REPORTE DETALLADO DE VEHÍCULO';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    let currentRow = 3;

    // Función helper para agregar sección
    const addSection = (title: string) => {
      worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
      const cell = worksheet.getCell(`A${currentRow}`);
      cell.value = title;
      cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF5B9BD5' },
      };
      currentRow++;
    };

    // Función helper para agregar fila de datos
    const addDataRow = (label: string, value: any) => {
      worksheet.getCell(`A${currentRow}`).value = label;
      worksheet.getCell(`A${currentRow}`).font = { bold: true };
      worksheet.getCell(`B${currentRow}`).value = value;
      currentRow++;
    };

    // Información Básica
    addSection('INFORMACIÓN BÁSICA');
    addDataRow('Marca', vehicle.marca);
    addDataRow('Modelo', vehicle.modelo);
    addDataRow('Año', vehicle.año);
    addDataRow('Placa', vehicle.placa);
    addDataRow('Color', vehicle.color);
    addDataRow('Kilometraje', vehicle.kilometraje.toLocaleString('es-CO'));
    currentRow++;

    // Información Financiera
    addSection('INFORMACIÓN FINANCIERA');
    addDataRow('Precio de Compra', `$${vehicle.precioCompra.toLocaleString('es-CO')}`);
    addDataRow('Precio de Venta', `$${vehicle.precioVenta.toLocaleString('es-CO')}`);
    currentRow++;

    // Gastos
    addSection('GASTOS');
    addDataRow('Gastos en Pintura', `$${vehicle.gastos.pintura.toLocaleString('es-CO')}`);
    addDataRow('Gastos en Mecánica', `$${vehicle.gastos.mecanica.toLocaleString('es-CO')}`);
    addDataRow('Gastos de Traspaso', `$${vehicle.gastos.traspaso.toLocaleString('es-CO')}`);
    addDataRow('Gastos de Alistamiento', `$${vehicle.gastos.alistamiento.toLocaleString('es-CO')}`);
    addDataRow('Gastos de Tapicería', `$${vehicle.gastos.tapiceria.toLocaleString('es-CO')}`);
    addDataRow('Gastos de Transporte', `$${vehicle.gastos.transporte.toLocaleString('es-CO')}`);
    addDataRow('Gastos Varios', `$${vehicle.gastos.varios.toLocaleString('es-CO')}`);
    addDataRow('TOTAL GASTOS', `$${vehicle.gastos.total.toLocaleString('es-CO')}`);
    worksheet.getCell(`A${currentRow - 1}`).font = { bold: true, color: { argb: 'FFFF0000' } };
    worksheet.getCell(`B${currentRow - 1}`).font = { bold: true, color: { argb: 'FFFF0000' } };
    currentRow++;

    // Resumen Financiero
    addSection('RESUMEN FINANCIERO');
    const costoTotal = vehicle.precioCompra + vehicle.gastos.total;
    const utilidad = vehicle.precioVenta - costoTotal;
    const margen = costoTotal > 0 ? ((utilidad / costoTotal) * 100).toFixed(2) : '0';

    addDataRow('Costo Total (Compra + Gastos)', `$${costoTotal.toLocaleString('es-CO')}`);
    addDataRow('Precio de Venta', `$${vehicle.precioVenta.toLocaleString('es-CO')}`);
    addDataRow('UTILIDAD', `$${utilidad.toLocaleString('es-CO')}`);
    addDataRow('Margen de Ganancia', `${margen}%`);
    
    worksheet.getCell(`A${currentRow - 2}`).font = { bold: true, size: 12, color: { argb: utilidad >= 0 ? 'FF00B050' : 'FFFF0000' } };
    worksheet.getCell(`B${currentRow - 2}`).font = { bold: true, size: 12, color: { argb: utilidad >= 0 ? 'FF00B050' : 'FFFF0000' } };
    currentRow++;

    // Estado y Fechas
    addSection('ESTADO Y FECHAS');
    addDataRow('Estado', vehicle.estado.replace('_', ' ').toUpperCase());
    addDataRow('Fecha de Ingreso', vehicle.fechaIngreso.toLocaleDateString('es-CO'));
    if (vehicle.fechaVenta) {
      addDataRow('Fecha de Venta', new Date(vehicle.fechaVenta).toLocaleDateString('es-CO'));
    }
    currentRow++;

    // Documentación
    addSection('DOCUMENTACIÓN');
    addDataRow('Prenda', vehicle.documentacion.prenda.tiene ? 'SÍ' : 'NO');
    if (vehicle.documentacion.prenda.tiene && vehicle.documentacion.prenda.detalles) {
      addDataRow('Detalles Prenda', vehicle.documentacion.prenda.detalles);
    }
    addDataRow('SOAT', vehicle.documentacion.soat.tiene ? 'SÍ' : 'NO');
    if (vehicle.documentacion.soat.fechaVencimiento) {
      addDataRow('Vencimiento SOAT', new Date(vehicle.documentacion.soat.fechaVencimiento).toLocaleDateString('es-CO'));
    }
    addDataRow('Tecnomecánica', vehicle.documentacion.tecnomecanica.tiene ? 'SÍ' : 'NO');
    if (vehicle.documentacion.tecnomecanica.fechaVencimiento) {
      addDataRow('Vencimiento Tecnomecánica', new Date(vehicle.documentacion.tecnomecanica.fechaVencimiento).toLocaleDateString('es-CO'));
    }
    addDataRow('Tarjeta de Propiedad', vehicle.documentacion.tarjetaPropiedad.tiene ? 'SÍ' : 'NO');
    currentRow++;

    // Inversionistas
    if (vehicle.inversionistas && vehicle.inversionistas.length > 0) {
      addSection('INVERSIONISTAS Y DISTRIBUCIÓN DE UTILIDADES');
      
      // Encabezados de la tabla de inversionistas
      worksheet.getCell(`A${currentRow}`).value = 'Nombre';
      worksheet.getCell(`A${currentRow}`).font = { bold: true };
      worksheet.getCell(`A${currentRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE7E6E6' },
      };
      
      worksheet.getCell(`B${currentRow}`).value = 'Monto Inversión';
      worksheet.getCell(`B${currentRow}`).font = { bold: true };
      worksheet.getCell(`B${currentRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE7E6E6' },
      };
      currentRow++;

      worksheet.getCell(`A${currentRow}`).value = '';
      worksheet.getCell(`B${currentRow}`).value = 'Retorno de Gastos';
      worksheet.getCell(`B${currentRow}`).font = { bold: true };
      worksheet.getCell(`B${currentRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC000' }, // Naranja
      };
      currentRow++;

      worksheet.getCell(`A${currentRow}`).value = '';
      worksheet.getCell(`B${currentRow}`).value = 'Participación %';
      worksheet.getCell(`B${currentRow}`).font = { bold: true };
      worksheet.getCell(`B${currentRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE7E6E6' },
      };
      currentRow++;

      worksheet.getCell(`A${currentRow}`).value = '';
      worksheet.getCell(`B${currentRow}`).value = 'Utilidad Neta';
      worksheet.getCell(`B${currentRow}`).font = { bold: true };
      worksheet.getCell(`B${currentRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF92D050' }, // Verde
      };
      currentRow++;

      worksheet.getCell(`A${currentRow}`).value = '';
      worksheet.getCell(`B${currentRow}`).value = 'Total a Recibir';
      worksheet.getCell(`B${currentRow}`).font = { bold: true };
      worksheet.getCell(`B${currentRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFB4A7D6' }, // Morado
      };
      currentRow++;

      // Calcular totales
      const totalInversion = vehicle.inversionistas.reduce((sum, inv) => sum + inv.montoInversion, 0);
      const totalGastosInv = vehicle.inversionistas.reduce((sum, inv) => {
        const gastosInv = inv.gastos?.reduce((s, g) => s + (g.monto || 0), 0) || 0;
        return sum + gastosInv;
      }, 0);
      
      // Gastos generales (sin gastos de inversionistas)
      const gastosGenerales = vehicle.gastos.pintura + vehicle.gastos.mecanica + vehicle.gastos.traspaso + 
                             vehicle.gastos.alistamiento + vehicle.gastos.tapiceria + vehicle.gastos.transporte + 
                             vehicle.gastos.varios;
      
      // Utilidad bruta (sin considerar gastos de inversionistas)
      const utilidadBruta = vehicle.precioVenta - vehicle.precioCompra - gastosGenerales;
      
      // Utilidad neta a distribuir (después de restar gastos de inversionistas)
      const utilidadNeta = utilidadBruta - totalGastosInv;

      // Datos de cada inversionista
      vehicle.inversionistas.forEach((inv, index) => {
        const porcentaje = totalInversion > 0 ? (inv.montoInversion / totalInversion) * 100 : 0;
        const gastosInv = inv.gastos?.reduce((s, g) => s + (g.monto || 0), 0) || 0;
        
        // Utilidad neta del inversionista (sin incluir gastos)
        const utilidadNetaInv = (porcentaje / 100) * utilidadNeta;
        
        // Total a recibir (utilidad neta + retorno de gastos)
        const totalARecibir = utilidadNetaInv + gastosInv;

        // Nombre
        worksheet.getCell(`A${currentRow}`).value = inv.nombre;
        worksheet.getCell(`B${currentRow}`).value = inv.montoInversion;
        worksheet.getCell(`B${currentRow}`).numFmt = '"$"#,##0';
        currentRow++;

        // Retorno de Gastos
        worksheet.getCell(`A${currentRow}`).value = '';
        worksheet.getCell(`B${currentRow}`).value = gastosInv;
        worksheet.getCell(`B${currentRow}`).numFmt = '"$"#,##0';
        worksheet.getCell(`B${currentRow}`).font = { bold: true, color: { argb: 'FFFF6600' } };
        currentRow++;

        // Detalles de gastos (si existen)
        if (inv.gastos && inv.gastos.length > 0) {
          worksheet.getCell(`A${currentRow}`).value = '  Detalles:';
          worksheet.getCell(`A${currentRow}`).font = { italic: true, size: 9 };
          const detallesGastos = inv.gastos.map(g => `${g.categoria}: $${g.monto.toLocaleString('es-CO')}${g.descripcion ? ` (${g.descripcion})` : ''}`).join(', ');
          worksheet.getCell(`B${currentRow}`).value = detallesGastos;
          worksheet.getCell(`B${currentRow}`).font = { italic: true, size: 9 };
          currentRow++;
        }

        currentRow++;
      });
    }

    // Generar archivo
    const fileName = `reporte-vehiculo-${vehicle.placa}-${Date.now()}.xlsx`;
    const filePath = path.join(ensureUploadsDir(), fileName);

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error al descargar archivo:', err);
      }
      fs.unlinkSync(filePath);
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al exportar reporte', error: error.message });
  }
};

// Generar formulario de traspaso en PDF (Formato Oficial Ministerio de Transporte - RUNT)
export const generateTransferForm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      res.status(404).json({ message: 'Vehículo no encontrado' });
      return;
    }

    // Validar que existan datos de venta
    if (!vehicle.datosVenta || 
        !vehicle.datosVenta.comprador?.nombre || 
        !vehicle.datosVenta.comprador?.identificacion ||
        !vehicle.datosVenta.vendedor?.nombre) {
      res.status(400).json({ 
        message: 'El vehículo no tiene datos de venta completos. Por favor, completa los datos de venta antes de generar el formulario.' 
      });
      return;
    }

    // Crear documento PDF
    const doc = new PDFDocument({ 
      size: 'LETTER',
      margins: { top: 30, bottom: 30, left: 40, right: 40 }
    });

    // Configurar respuesta
    const fileName = `formulario-traspaso-${vehicle.placa}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Pipe el PDF directamente a la respuesta
    doc.pipe(res);

    // Función helper para dibujar rectángulos
    const drawBox = (x: number, y: number, width: number, height: number) => {
      doc.rect(x, y, width, height).stroke();
    };

    // Función helper para dibujar línea divisoria
    const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
      doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
    };

    let y = 30;
    const pageWidth = 612; // Letter width
    const margin = 40;
    const usableWidth = pageWidth - (margin * 2);

    // ENCABEZADO PRINCIPAL
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('MINISTERIO DE TRANSPORTE', margin, y, { align: 'center', width: usableWidth });
    y += 12;
    doc.fontSize(10);
    doc.text('FORMULARIO DE SOLICITUD DE TRAMITES DEL REGISTRO NACIONAL AUTOMOTOR', margin, y, { align: 'center', width: usableWidth });
    y += 20;

    // SECCIÓN 1: ORGANISMO DE TRÁNSITO Y PLACA
    const col1Width = usableWidth * 0.65;
    const col2Width = usableWidth * 0.35;

    // Caja 1: Organismo de tránsito
    drawBox(margin, y, col1Width, 50);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('1. ORGANISMO DE TRÁNSITO', margin + 2, y + 2);
    doc.fontSize(8).font('Helvetica');
    doc.text(vehicle.datosVenta?.vehiculoAdicional?.sitioMatricula || '', margin + 2, y + 18);
    drawLine(margin, y + 30, margin + col1Width, y + 30);
    doc.fontSize(7);
    doc.text('NOMBRE', margin + 2, y + 32);
    doc.text('CIUDAD', margin + 150, y + 32);
    doc.text('CODIGO', margin + 280, y + 32);

    // Caja 2: Placa
    drawBox(margin + col1Width, y, col2Width, 50);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('2. PLACA', margin + col1Width + 2, y + 2);
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(vehicle.placa || '', margin + col1Width + 10, y + 20);
    drawLine(margin + col1Width, y + 35, margin + usableWidth, y + 35);
    doc.fontSize(7);
    doc.text('LETRAS', margin + col1Width + 10, y + 37);
    doc.text('NÚMEROS', margin + col1Width + col2Width/2 + 10, y + 37);

    y += 55;

    // SECCIÓN 3: TRÁMITE SOLICITADO
    drawBox(margin, y, usableWidth, 90);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('3. TRAMITE SOLICITADO', margin + 2, y + 2);

    // Opciones de trámite en grid
    const tramites = [
      ['1', 'MATRICULA/REGISTRO'], ['2', 'TRASPASO'], ['3', 'TRANSLADO MATRICULA/REGISTRO'],
      ['4', 'RADICADO MATRICULA/REGISTRO'], ['5', 'CAMBIO DE COLOR'], ['6', 'CAMBIO DE SERVICIO'],
      ['7', 'REGRABAR MOTOR'], ['8', 'REGRABAR CHASIS'], ['9', 'TRANSFORMACION'],
      ['10', 'DUPLICADO LICENCIA TRANSITO'], ['11', 'INSCRIPC. PRENDA'], ['12', 'LEVANTA. PRENDA'],
      ['13', 'CANCELACION MATRICULA/REGISTRO'], ['14', 'CAMBIO DE PLACAS'], ['15', 'DUPLICADO DE PLACAS'],
      ['16', 'REMATRICULA'], ['17', 'CAMBIO DE CARROCERIA'], ['18', 'OTROS']
    ];

    let tramiteX = margin + 5;
    let tramiteY = y + 18;
    tramites.forEach((tramite, index) => {
      if (index === 6) { tramiteX = margin + 5; tramiteY += 15; }
      if (index === 12) { tramiteX = margin + 5; tramiteY += 15; }
      
      doc.fontSize(7).font('Helvetica');
      const isSelected = tramite[1].includes('TRASPASO') ? '☑' : '☐';
      doc.text(`${isSelected} ${tramite[0]}. ${tramite[1]}`, tramiteX, tramiteY);
      tramiteX += 140;
    });

    y += 95;

    // SECCIÓN 4-7: Datos del vehículo en una fila
    const secWidth = usableWidth / 4;

    // 4. Marca
    drawBox(margin, y, secWidth, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('4. MARCA', margin + 2, y + 2);
    doc.fontSize(8).font('Helvetica');
    doc.text(vehicle.marca || '', margin + 2, y + 12);

    // 5. Línea
    drawBox(margin + secWidth, y, secWidth, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('5. LINEA', margin + secWidth + 2, y + 2);
    doc.fontSize(8).font('Helvetica');
    doc.text(vehicle.datosVenta?.vehiculoAdicional?.linea || vehicle.modelo || '', margin + secWidth + 2, y + 12);

    // 6. Combustible
    drawBox(margin + secWidth * 2, y, secWidth, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('6. COMBUSTIBLE', margin + secWidth * 2 + 2, y + 2);
    const combustibles = ['GASOLINA', 'DIESEL', 'GAS', 'MIXTO', 'ELECTRICO', 'HIDROGEN', 'ETANOL', 'BIODIESEL'];
    doc.fontSize(6);
    combustibles.forEach((comb, i) => {
      const selected = comb === 'GASOLINA' ? '☑' : '☐';
      doc.text(`${selected}${i+1}`, margin + secWidth * 2 + 5 + (i * 22), y + 12);
    });

    // 7. Colores
    drawBox(margin + secWidth * 3, y, secWidth, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('7. COLORES', margin + secWidth * 3 + 2, y + 2);
    doc.fontSize(8).font('Helvetica');
    doc.text(vehicle.color || '', margin + secWidth * 3 + 2, y + 12);

    y += 30;

    // SECCIÓN 8-14: Más datos del vehículo
    const sec8Width = usableWidth * 0.15;
    const sec9Width = usableWidth * 0.15;
    const sec10Width = usableWidth * 0.20;
    const sec11Width = usableWidth * 0.25;
    const sec12Width = usableWidth * 0.25;

    // 8. Modelo
    drawBox(margin, y, sec8Width, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('8. MODELO', margin + 2, y + 2);
    doc.fontSize(8).font('Helvetica');
    doc.text(vehicle.año?.toString() || '', margin + 2, y + 12);

    // 9. Cilindrada
    drawBox(margin + sec8Width, y, sec9Width, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('9. CILINDRADA', margin + sec8Width + 2, y + 2);

    // 10. Capacidad
    drawBox(margin + sec8Width + sec9Width, y, sec10Width, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('10. CAPACIDAD Kg/Psj', margin + sec8Width + sec9Width + 2, y + 2);
    doc.fontSize(8);
    doc.text(vehicle.datosVenta?.vehiculoAdicional?.capacidad || '5', margin + sec8Width + sec9Width + 2, y + 12);

    // 11. Blindaje
    drawBox(margin + sec8Width + sec9Width + sec10Width, y, sec11Width, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('11. BLINDAJE', margin + sec8Width + sec9Width + sec10Width + 2, y + 2);
    doc.fontSize(7);
    doc.text('SI        NO', margin + sec8Width + sec9Width + sec10Width + 2, y + 12);

    // 12. Desmonte Blind
    drawBox(margin + sec8Width + sec9Width + sec10Width + sec11Width, y, sec12Width, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('12. DESMONTE BLIND.', margin + sec8Width + sec9Width + sec10Width + sec11Width + 2, y + 2);
    doc.fontSize(7);
    doc.text('SI        NO', margin + sec8Width + sec9Width + sec10Width + sec11Width + 2, y + 12);

    y += 30;

    // 13. Potencia
    drawBox(margin, y, usableWidth * 0.25, 25);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('13. POTENCIA/HP', margin + 2, y + 2);

    // Resoluciones
    drawBox(margin + usableWidth * 0.25, y, usableWidth * 0.375, 25);
    doc.fontSize(6);
    doc.text('Resolución No (DD/MM/AÑO)', margin + usableWidth * 0.25 + 2, y + 2);

    drawBox(margin + usableWidth * 0.625, y, usableWidth * 0.375, 25);
    doc.fontSize(6);
    doc.text('Resolución No (DD/MM/AÑO)', margin + usableWidth * 0.625 + 2, y + 2);

    y += 30;

    // SECCIÓN 14: Clase de vehículo
    drawBox(margin, y, usableWidth * 0.60, 60);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('14. CLASE DE VEHICULO', margin + 2, y + 2);

    const clases = [
      ['AUTOMOVIL', 'BUS', 'BUSETA', 'CAMIÓN'],
      ['CAMIONETA', 'CAMPERO', 'MICROBUS', 'TRACTOCAMIÓN'],
      ['MOTOCICLETA', 'MOTOCARRO', 'MOTOTRICICLO', 'CUATRIMOTO'],
      ['VOLQUETA', 'OTRO']
    ];

    let claseY = y + 15;
    clases.forEach((fila) => {
      let claseX = margin + 5;
      fila.forEach((clase) => {
        const isSelected = clase === 'AUTOMOVIL' ? '☑' : '☐';
        doc.fontSize(7).font('Helvetica');
        doc.text(`${isSelected} ${clase}`, claseX, claseY);
        claseX += 90;
      });
      claseY += 12;
    });

    // SECCIÓN 15: Carrocería
    drawBox(margin + usableWidth * 0.60, y, usableWidth * 0.40, 30);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('15. CARROCERIA', margin + usableWidth * 0.60 + 2, y + 2);
    doc.fontSize(8).font('Helvetica');
    doc.text(vehicle.datosVenta?.vehiculoAdicional?.tipoCarroceria || '', margin + usableWidth * 0.60 + 2, y + 15);

    // SECCIÓN 16: Identificación interna
    drawBox(margin + usableWidth * 0.60, y + 30, usableWidth * 0.40, 30);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('16. IDENTIFICACION INTERNA DEL VEHICULO', margin + usableWidth * 0.60 + 2, y + 32);

    y += 65;

    // SECCIÓN 17: Importación o Remate
    drawBox(margin, y, usableWidth * 0.60, 40);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('17. IMPORTACION O REMATE', margin + 2, y + 2);
    doc.fontSize(7);
    doc.text('SI        NO', margin + 150, y + 3);

    // Tabla de importación
    const impHeaders = ['MANIF. O ACTA', 'DEC. DE IMPOR.', 'ACTA', 'ENTIDAD', 'LUGAR (CIUDAD)', 'CODIGO'];
    const impWidth = (usableWidth * 0.60) / 6;
    let impX = margin;
    impHeaders.forEach((header, i) => {
      drawBox(impX, y + 15, impWidth, 25);
      doc.fontSize(6).font('Helvetica');
      doc.text(header, impX + 2, y + 17, { width: impWidth - 4, align: 'center' });
      impX += impWidth;
    });

    // SECCIÓN 18: Tipo de servicio
    drawBox(margin + usableWidth * 0.60, y, usableWidth * 0.40, 40);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('18. TIPO DE SERVICIO', margin + usableWidth * 0.60 + 2, y + 2);

    const servicios = ['PARTICULAR', 'PUBLICO', 'DIPLOMATICO', 'OFICIAL', 'ESPECIAL', 'OTROS'];
    let servX = margin + usableWidth * 0.60 + 5;
    servicios.forEach((serv, i) => {
      const isSelected = serv === 'PARTICULAR' ? '☑' : '☐';
      doc.fontSize(6);
      doc.text(`${isSelected} ${i+1}`, servX, y + 15);
      doc.text(serv, servX, y + 22);
      servX += 45;
    });

    y += 45;

    // SECCIÓN 19: Números de motor, chasis, serie, VIN
    const idWidth = usableWidth / 4;

    // No. Motor
    drawBox(margin, y, idWidth, 35);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('No. DE MOTOR', margin + 2, y + 2);
    doc.fontSize(8).font('Helvetica');
    doc.text(vehicle.datosVenta?.vehiculoAdicional?.numeroMotor || '', margin + 2, y + 15);
    drawLine(margin, y + 25, margin + idWidth, y + 25);
    doc.fontSize(6);
    doc.text('REGRABADO  SI     NO', margin + 2, y + 27);

    // No. Chasis
    drawBox(margin + idWidth, y, idWidth, 35);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('No. DE CHASIS', margin + idWidth + 2, y + 2);
    doc.fontSize(8);
    doc.text(vehicle.vin || '', margin + idWidth + 2, y + 15);
    drawLine(margin + idWidth, y + 25, margin + idWidth * 2, y + 25);
    doc.fontSize(6);
    doc.text('REGRABADO  SI     NO', margin + idWidth + 2, y + 27);

    // No. Serie
    drawBox(margin + idWidth * 2, y, idWidth, 35);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('No. DE SERIE', margin + idWidth * 2 + 2, y + 2);
    drawLine(margin + idWidth * 2, y + 25, margin + idWidth * 3, y + 25);
    doc.fontSize(6);
    doc.text('REGRABADO  SI     NO', margin + idWidth * 2 + 2, y + 27);

    // No. VIN
    drawBox(margin + idWidth * 3, y, idWidth, 35);
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('No. DE VIN VEHICULOS AUTOMOTORES', margin + idWidth * 3 + 2, y + 2);
    doc.fontSize(8);
    doc.text(vehicle.vin || '', margin + idWidth * 3 + 2, y + 15);

    y += 40;

    // SECCIÓN 20: Datos del propietario
    drawBox(margin, y, usableWidth, 80);
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('20. DATOS DEL PROPIETARIO', margin + 2, y + 2);

    // Nombres y apellidos
    drawBox(margin, y + 15, usableWidth * 0.35, 20);
    doc.fontSize(7);
    doc.text('PRIMER APELLIDO', margin + 2, y + 17);
    doc.fontSize(9).font('Helvetica-Bold');
    const apellidos = vehicle.datosVenta?.vendedor?.nombre?.split(' ') || [''];
    doc.text(apellidos[0] || '', margin + 2, y + 26);

    drawBox(margin + usableWidth * 0.35, y + 15, usableWidth * 0.35, 20);
    doc.fontSize(7).font('Helvetica');
    doc.text('SEGUNDO APELLIDO', margin + usableWidth * 0.35 + 2, y + 17);
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(apellidos[1] || '', margin + usableWidth * 0.35 + 2, y + 26);

    drawBox(margin + usableWidth * 0.70, y + 15, usableWidth * 0.30, 20);
    doc.fontSize(7).font('Helvetica');
    doc.text('NOMBRES', margin + usableWidth * 0.70 + 2, y + 17);
    doc.fontSize(9).font('Helvetica-Bold');
    const nombres = apellidos.slice(2).join(' ') || vehicle.datosVenta?.vendedor?.nombre || '';
    doc.text(nombres, margin + usableWidth * 0.70 + 2, y + 26);

    // Tipo de documento
    const docTypes = ['C.C', 'NIT', 'N.N', 'PASAPORTE', 'C.EXTRANJ.', 'T.IDENTI.', 'NUIP', 'C. DIPLOMATICO'];
    const docCodes = ['C', 'N', 'N.N', 'P', 'E', 'T', 'U', 'D'];
    let docX = margin;
    const docWidth = usableWidth / 8;

    docTypes.forEach((type, i) => {
      drawBox(docX, y + 35, docWidth, 25);
      doc.fontSize(6).font('Helvetica');
      doc.text(type, docX + 2, y + 37, { width: docWidth - 4, align: 'center' });
      doc.fontSize(8).font('Helvetica-Bold');
      const isSelected = type === 'C.C' ? 'X' : '';
      doc.text(isSelected, docX + docWidth/2 - 3, y + 47);
      doc.fontSize(6);
      doc.text(docCodes[i], docX + 2, y + 55);
      docX += docWidth;
    });

    // Número de documento
    drawBox(margin, y + 60, usableWidth * 0.40, 20);
    doc.fontSize(7).font('Helvetica');
    doc.text('No. DOCUMENTO', margin + 2, y + 62);
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(vehicle.datosVenta?.vendedor?.identificacion || '', margin + 2, y + 71);

    // Fecha
    drawBox(margin + usableWidth * 0.40, y + 60, usableWidth * 0.20, 20);
    doc.fontSize(7);
    doc.text('FECHA', margin + usableWidth * 0.40 + 2, y + 62);
    drawLine(margin + usableWidth * 0.40, y + 70, margin + usableWidth * 0.60, y + 70);
    doc.fontSize(6);
    doc.text('DIA    MES    AÑO', margin + usableWidth * 0.40 + 5, y + 72);

    // Dirección, ciudad, teléfono
    drawBox(margin + usableWidth * 0.60, y + 35, usableWidth * 0.40, 15);
    doc.fontSize(7);
    doc.text('DIRECCION', margin + usableWidth * 0.60 + 2, y + 37);

    drawBox(margin + usableWidth * 0.60, y + 50, usableWidth * 0.20, 15);
    doc.fontSize(7);
    doc.text('CIUDAD', margin + usableWidth * 0.60 + 2, y + 52);

    drawBox(margin + usableWidth * 0.80, y + 50, usableWidth * 0.20, 15);
    doc.fontSize(7);
    doc.text('TELEFONO', margin + usableWidth * 0.80 + 2, y + 52);

    drawBox(margin + usableWidth * 0.60, y + 65, usableWidth * 0.40, 15);
    doc.fontSize(7);
    doc.text('FIRMA DEL PROPIETARIO', margin + usableWidth * 0.60 + 2, y + 67);

    y += 85;

    // SECCIÓN 21: Datos del comprador (similar estructura)
    drawBox(margin, y, usableWidth, 80);
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('21. DATOS DEL COMPRADOR (NUEVO PROPIETARIO)', margin + 2, y + 2);

    // Nombres y apellidos del comprador
    const apellidosComp = vehicle.datosVenta?.comprador?.nombre?.split(' ') || [''];
    
    drawBox(margin, y + 15, usableWidth * 0.35, 20);
    doc.fontSize(7).font('Helvetica');
    doc.text('PRIMER APELLIDO', margin + 2, y + 17);
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(apellidosComp[0] || '', margin + 2, y + 26);

    drawBox(margin + usableWidth * 0.35, y + 15, usableWidth * 0.35, 20);
    doc.fontSize(7);
    doc.text('SEGUNDO APELLIDO', margin + usableWidth * 0.35 + 2, y + 17);
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(apellidosComp[1] || '', margin + usableWidth * 0.35 + 2, y + 26);

    drawBox(margin + usableWidth * 0.70, y + 15, usableWidth * 0.30, 20);
    doc.fontSize(7);
    doc.text('NOMBRES', margin + usableWidth * 0.70 + 2, y + 17);
    doc.fontSize(9).font('Helvetica-Bold');
    const nombresComp = apellidosComp.slice(2).join(' ') || vehicle.datosVenta?.comprador?.nombre || '';
    doc.text(nombresComp, margin + usableWidth * 0.70 + 2, y + 26);

    // Tipo de documento (misma estructura)
    docX = margin;
    docTypes.forEach((type, i) => {
      drawBox(docX, y + 35, docWidth, 25);
      doc.fontSize(6).font('Helvetica');
      doc.text(type, docX + 2, y + 37, { width: docWidth - 4, align: 'center' });
      doc.fontSize(8).font('Helvetica-Bold');
      const isSelected = type === 'C.C' ? 'X' : '';
      doc.text(isSelected, docX + docWidth/2 - 3, y + 47);
      doc.fontSize(6);
      doc.text(docCodes[i], docX + 2, y + 55);
      docX += docWidth;
    });

    // Número de documento del comprador
    drawBox(margin, y + 60, usableWidth * 0.40, 20);
    doc.fontSize(7).font('Helvetica');
    doc.text('No. DOCUMENTO', margin + 2, y + 62);
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(vehicle.datosVenta?.comprador?.identificacion || '', margin + 2, y + 71);

    // Fecha
    drawBox(margin + usableWidth * 0.40, y + 60, usableWidth * 0.20, 20);
    doc.fontSize(7);
    doc.text('FECHA', margin + usableWidth * 0.40 + 2, y + 62);
    drawLine(margin + usableWidth * 0.40, y + 70, margin + usableWidth * 0.60, y + 70);
    doc.fontSize(6);
    doc.text('DIA    MES    AÑO', margin + usableWidth * 0.40 + 5, y + 72);

    // Dirección, ciudad, teléfono del comprador
    drawBox(margin + usableWidth * 0.60, y + 35, usableWidth * 0.40, 15);
    doc.fontSize(7);
    doc.text('DIRECCION', margin + usableWidth * 0.60 + 2, y + 37);

    drawBox(margin + usableWidth * 0.60, y + 50, usableWidth * 0.20, 15);
    doc.fontSize(7);
    doc.text('CIUDAD', margin + usableWidth * 0.60 + 2, y + 52);

    drawBox(margin + usableWidth * 0.80, y + 50, usableWidth * 0.20, 15);
    doc.fontSize(7);
    doc.text('TELEFONO', margin + usableWidth * 0.80 + 2, y + 52);

    drawBox(margin + usableWidth * 0.60, y + 65, usableWidth * 0.40, 15);
    doc.fontSize(7);
    doc.text('FIRMA DEL COMPRADOR', margin + usableWidth * 0.60 + 2, y + 67);

    // Finalizar documento
    doc.end();

  } catch (error: any) {
    console.error('Error al generar formulario de traspaso:', error);
    res.status(500).json({ 
      message: 'Error al generar formulario de traspaso', 
      error: error.message 
    });
  }
};
