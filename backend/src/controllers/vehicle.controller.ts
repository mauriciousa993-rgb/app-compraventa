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

    // Detectar cambio de estado a 'listo_venta' y establecer fechaListoVenta
    const nuevoEstado = req.body.estado;
    const estadoAnterior = vehicle.estado;
    
    if (nuevoEstado === 'listo_venta' && estadoAnterior !== 'listo_venta') {
      req.body.fechaListoVenta = new Date();
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

    // Configurar ancho de columnas - 4 columnas para mejor organización
    worksheet.columns = [
      { width: 30 }, // A: Concepto/Descripción
      { width: 40 }, // B: Detalle/Descripción adicional
      { width: 20 }, // C: Valor/Monto
      { width: 15 }, // D: Fecha/Extra
    ];

    // Título
    worksheet.mergeCells('A1:D1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `REPORTE DETALLADO - ${vehicle.marca} ${vehicle.modelo} (${vehicle.placa})`;
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
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
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

    // Función helper para agregar fila de datos simple
    const addDataRow = (label: string, value: any, extra: string = '') => {
      worksheet.getCell(`A${currentRow}`).value = label;
      worksheet.getCell(`A${currentRow}`).font = { bold: true };
      worksheet.getCell(`B${currentRow}`).value = extra;
      worksheet.getCell(`C${currentRow}`).value = value;
      currentRow++;
    };

    // Información Básica
    addSection('INFORMACIÓN BÁSICA');
    addDataRow('Marca', vehicle.marca);
    addDataRow('Modelo', vehicle.modelo);
    addDataRow('Año', vehicle.año);
    addDataRow('Placa', vehicle.placa);
    addDataRow('Color', vehicle.color);
    addDataRow('Kilometraje', vehicle.kilometraje.toLocaleString('es-CO') + ' km');
    addDataRow('Estado', vehicle.estado.replace('_', ' ').toUpperCase());
    addDataRow('Fecha de Ingreso', vehicle.fechaIngreso.toLocaleDateString('es-CO'));
    if (vehicle.fechaVenta) {
      addDataRow('Fecha de Venta', new Date(vehicle.fechaVenta).toLocaleDateString('es-CO'));
    }
    currentRow++;

    // Información Financiera - Resumen
    addSection('RESUMEN FINANCIERO');
    const costoTotal = vehicle.precioCompra + vehicle.gastos.total;
    const utilidad = vehicle.precioVenta - costoTotal;
    const margen = costoTotal > 0 ? ((utilidad / costoTotal) * 100).toFixed(2) : '0';

    addDataRow('Precio de Compra', `$${vehicle.precioCompra.toLocaleString('es-CO')}`);
    addDataRow('Total de Gastos', `$${vehicle.gastos.total.toLocaleString('es-CO')}`);
    addDataRow('COSTO TOTAL', `$${costoTotal.toLocaleString('es-CO')}`, 'Compra + Gastos');
    worksheet.getCell(`A${currentRow - 1}`).font = { bold: true, color: { argb: 'FF0070C0' } };
    worksheet.getCell(`C${currentRow - 1}`).font = { bold: true, color: { argb: 'FF0070C0' } };
    
    addDataRow('Precio de Venta', `$${vehicle.precioVenta.toLocaleString('es-CO')}`);
    addDataRow('UTILIDAD', `$${utilidad.toLocaleString('es-CO')}`, `${margen}% margen`);
    worksheet.getCell(`A${currentRow - 1}`).font = { bold: true, size: 12, color: { argb: utilidad >= 0 ? 'FF00B050' : 'FFFF0000' } };
    worksheet.getCell(`C${currentRow - 1}`).font = { bold: true, size: 12, color: { argb: utilidad >= 0 ? 'FF00B050' : 'FFFF0000' } };
    currentRow++;

    // Tabla de Gastos Detallados
    addSection('DETALLE DE GASTOS');
    
    // Encabezados de tabla
    const headers = ['Categoría', 'Descripción', 'Monto', 'Fecha'];
    headers.forEach((header, index) => {
      const col = String.fromCharCode(65 + index); // A, B, C, D
      const cell = worksheet.getCell(`${col}${currentRow}`);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      cell.alignment = { horizontal: 'center' };
    });
    currentRow++;

    // Función para agregar gastos de una categoría
    const addGastoRows = (categoria: string, gastos: any[]) => {
      if (!gastos || gastos.length === 0) return;
      
      gastos.forEach((gasto, index) => {
        worksheet.getCell(`A${currentRow}`).value = index === 0 ? categoria : '';
        worksheet.getCell(`B${currentRow}`).value = gasto.descripcion || 'Sin descripción';
        worksheet.getCell(`C${currentRow}`).value = gasto.monto || 0;
        worksheet.getCell(`C${currentRow}`).numFmt = '"$"#,##0';
        worksheet.getCell(`D${currentRow}`).value = gasto.fecha ? new Date(gasto.fecha).toLocaleDateString('es-CO') : '';
        
        // Color alternado para mejor lectura
        if (index % 2 === 1) {
          ['A', 'B', 'C', 'D'].forEach(col => {
            worksheet.getCell(`${col}${currentRow}`).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' },
            };
          });
        }
        currentRow++;
      });
    };

    // Agregar todos los gastos detallados
    if (vehicle.gastosDetallados) {
      addGastoRows('Pintura', vehicle.gastosDetallados.pintura);
      addGastoRows('Mecánica', vehicle.gastosDetallados.mecanica);
      addGastoRows('Traspaso', vehicle.gastosDetallados.traspaso);
      addGastoRows('Alistamiento', vehicle.gastosDetallados.alistamiento);
      addGastoRows('Tapicería', vehicle.gastosDetallados.tapiceria);
      addGastoRows('Transporte', vehicle.gastosDetallados.transporte);
      addGastoRows('Varios', vehicle.gastosDetallados.varios);
    }

    // Fila de total de gastos
    worksheet.getCell(`A${currentRow}`).value = 'TOTAL GASTOS';
    worksheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FFFF0000' } };
    worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
    worksheet.getCell(`C${currentRow}`).value = vehicle.gastos.total;
    worksheet.getCell(`C${currentRow}`).numFmt = '"$"#,##0';
    worksheet.getCell(`C${currentRow}`).font = { bold: true, color: { argb: 'FFFF0000' } };
    currentRow += 2;


    // Inversionistas - Tabla mejorada
    if (vehicle.inversionistas && vehicle.inversionistas.length > 0) {
      addSection('INVERSIONISTAS Y DISTRIBUCIÓN DE UTILIDADES');
      
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

      // Encabezados de tabla de inversionistas
      const invHeaders = ['Inversionista', 'Inversión', 'Gastos', 'Participación', 'Utilidad', 'Total a Recibir'];
      invHeaders.forEach((header, index) => {
        const col = String.fromCharCode(65 + index);
        const cell = worksheet.getCell(`${col}${currentRow}`);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF7030A0' },
        };
        cell.alignment = { horizontal: 'center' };
      });
      currentRow++;

      // Datos de cada inversionista
      vehicle.inversionistas.forEach((inv, index) => {
        const porcentaje = totalInversion > 0 ? (inv.montoInversion / totalInversion) * 100 : 0;
        const gastosInv = inv.gastos?.reduce((s, g) => s + (g.monto || 0), 0) || 0;
        const utilidadNetaInv = (porcentaje / 100) * utilidadNeta;
        const totalARecibir = utilidadNetaInv + gastosInv;

        worksheet.getCell(`A${currentRow}`).value = inv.nombre;
        worksheet.getCell(`B${currentRow}`).value = inv.montoInversion;
        worksheet.getCell(`B${currentRow}`).numFmt = '"$"#,##0';
        worksheet.getCell(`C${currentRow}`).value = gastosInv;
        worksheet.getCell(`C${currentRow}`).numFmt = '"$"#,##0';
        worksheet.getCell(`D${currentRow}`).value = porcentaje / 100;
        worksheet.getCell(`D${currentRow}`).numFmt = '0.00"%"';
        worksheet.getCell(`E${currentRow}`).value = utilidadNetaInv;
        worksheet.getCell(`E${currentRow}`).numFmt = '"$"#,##0';
        worksheet.getCell(`F${currentRow}`).value = totalARecibir;
        worksheet.getCell(`F${currentRow}`).numFmt = '"$"#,##0';
        worksheet.getCell(`F${currentRow}`).font = { bold: true };

        // Color alternado
        if (index % 2 === 1) {
          ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
            worksheet.getCell(`${col}${currentRow}`).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' },
            };
          });
        }
        currentRow++;
      });

      // Fila de totales
      worksheet.getCell(`A${currentRow}`).value = 'TOTALES';
      worksheet.getCell(`A${currentRow}`).font = { bold: true };
      worksheet.getCell(`B${currentRow}`).value = totalInversion;
      worksheet.getCell(`B${currentRow}`).numFmt = '"$"#,##0';
      worksheet.getCell(`B${currentRow}`).font = { bold: true };
      worksheet.getCell(`C${currentRow}`).value = totalGastosInv;
      worksheet.getCell(`C${currentRow}`).numFmt = '"$"#,##0';
      worksheet.getCell(`C${currentRow}`).font = { bold: true };
      worksheet.getCell(`D${currentRow}`).value = 1;
      worksheet.getCell(`D${currentRow}`).numFmt = '0.00"%"';
      worksheet.getCell(`E${currentRow}`).value = utilidadNeta;
      worksheet.getCell(`E${currentRow}`).numFmt = '"$"#,##0';
      worksheet.getCell(`E${currentRow}`).font = { bold: true, color: { argb: utilidadNeta >= 0 ? 'FF00B050' : 'FFFF0000' } };
      currentRow += 2;

      // Detalle de gastos por inversionista
      addSection('DETALLE DE GASTOS POR INVERSIONISTA');
      
      const gastoHeaders = ['Inversionista', 'Categoría', 'Descripción', 'Monto', 'Fecha'];
      gastoHeaders.forEach((header, index) => {
        const col = String.fromCharCode(65 + index);
        const cell = worksheet.getCell(`${col}${currentRow}`);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF6600' },
        };
      });
      currentRow++;

      vehicle.inversionistas.forEach((inv) => {
        if (inv.gastos && inv.gastos.length > 0) {
          inv.gastos.forEach((gasto, gIndex) => {
            worksheet.getCell(`A${currentRow}`).value = inv.nombre;
            worksheet.getCell(`B${currentRow}`).value = gasto.categoria;
            worksheet.getCell(`C${currentRow}`).value = gasto.descripcion || 'Sin descripción';
            worksheet.getCell(`D${currentRow}`).value = gasto.monto;
            worksheet.getCell(`D${currentRow}`).numFmt = '"$"#,##0';
            worksheet.getCell(`E${currentRow}`).value = gasto.fecha ? new Date(gasto.fecha).toLocaleDateString('es-CO') : '';
            
            if (gIndex % 2 === 1) {
              ['A', 'B', 'C', 'D', 'E'].forEach(col => {
                worksheet.getCell(`${col}${currentRow}`).fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'FFF2F2F2' },
                };
              });
            }
            currentRow++;
          });
        }
      });
      currentRow++;
    }


    // Documentación
    addSection('DOCUMENTACIÓN');
    addDataRow('Prenda', vehicle.documentacion.prenda.tiene ? 'SÍ' : 'NO', vehicle.documentacion.prenda.detalles || '');
    addDataRow('SOAT', vehicle.documentacion.soat.tiene ? 'SÍ' : 'NO', vehicle.documentacion.soat.fechaVencimiento ? 'Vence: ' + new Date(vehicle.documentacion.soat.fechaVencimiento).toLocaleDateString('es-CO') : '');
    addDataRow('Tecnomecánica', vehicle.documentacion.tecnomecanica.tiene ? 'SÍ' : 'NO', vehicle.documentacion.tecnomecanica.fechaVencimiento ? 'Vence: ' + new Date(vehicle.documentacion.tecnomecanica.fechaVencimiento).toLocaleDateString('es-CO') : '');
    addDataRow('Tarjeta de Propiedad', vehicle.documentacion.tarjetaPropiedad.tiene ? 'SÍ' : 'NO', '');
    currentRow++;

    // Observaciones
    if (vehicle.observaciones) {
      addSection('OBSERVACIONES');
      worksheet.mergeCells(`A${currentRow}:D${currentRow + 2}`);
      const obsCell = worksheet.getCell(`A${currentRow}`);
      obsCell.value = vehicle.observaciones;
      obsCell.alignment = { wrapText: true, vertical: 'top' };
      currentRow += 3;
    }


    // Generar archivo
    const fileName = `vehiculo-${vehicle.placa}-${Date.now()}.xlsx`;
    const filePath = path.join(ensureUploadsDir(), fileName);

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error al descargar archivo:', err);
      }
      fs.unlinkSync(filePath);
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al exportar reporte del vehículo', error: error.message });
  }
};

// Exportar reporte mensual de ventas a Excel
export const exportMonthlyReport = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { year, month } = req.query;
    const selectedYear = year ? parseInt(year as string) : new Date().getFullYear();

    const startDate = new Date(selectedYear, 0, 1);
    const endDate = new Date(selectedYear, 11, 31, 23, 59, 59);

    const vehiculosVendidos = await Vehicle.find({
      estado: 'vendido',
      fechaVenta: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({ fechaVenta: 1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Ventas ${selectedYear}`);

    // Título
    worksheet.mergeCells('A1:I1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `REPORTE DE VENTAS - AÑO ${selectedYear}`;
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    // Encabezados
    worksheet.columns = [
      { header: 'Fecha Venta', key: 'fechaVenta', width: 15 },
      { header: 'Mes', key: 'mes', width: 12 },
      { header: 'Placa', key: 'placa', width: 12 },
      { header: 'Marca', key: 'marca', width: 15 },
      { header: 'Modelo', key: 'modelo', width: 15 },
      { header: 'Año', key: 'año', width: 10 },
      { header: 'Precio Compra', key: 'precioCompra', width: 15 },
      { header: 'Gastos Totales', key: 'gastos', width: 15 },
      { header: 'Costo Total', key: 'costoTotal', width: 15 },
      { header: 'Precio Venta', key: 'precioVenta', width: 15 },
      { header: 'Utilidad', key: 'utilidad', width: 15 },
      { header: 'Margen %', key: 'margen', width: 12 },
    ];

    const headerRow = worksheet.getRow(3);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5B9BD5' },
    };

    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    let totalVentas = 0;
    let totalGastos = 0;
    let totalUtilidad = 0;

    // Agregar datos
    vehiculosVendidos.forEach((vehiculo) => {
      if (!vehiculo.fechaVenta) return;

      const fecha = new Date(vehiculo.fechaVenta);
      const mesNombre = meses[fecha.getMonth()];
      const costoTotal = vehiculo.precioCompra + vehiculo.gastos.total;
      const utilidad = vehiculo.precioVenta - costoTotal;
      const margen = costoTotal > 0 ? ((utilidad / costoTotal) * 100).toFixed(2) : '0';

      totalVentas += vehiculo.precioVenta;
      totalGastos += costoTotal;
      totalUtilidad += utilidad;

      worksheet.addRow({
        fechaVenta: fecha.toLocaleDateString('es-CO'),
        mes: mesNombre,
        placa: vehiculo.placa,
        marca: vehiculo.marca,
        modelo: vehiculo.modelo,
        año: vehiculo.año,
        precioCompra: vehiculo.precioCompra,
        gastos: vehiculo.gastos.total,
        costoTotal: costoTotal,
        precioVenta: vehiculo.precioVenta,
        utilidad: utilidad,
        margen: `${margen}%`,
      });
    });

    // Formato de moneda
    worksheet.getColumn('precioCompra').numFmt = '"$"#,##0';
    worksheet.getColumn('gastos').numFmt = '"$"#,##0';
    worksheet.getColumn('costoTotal').numFmt = '"$"#,##0';
    worksheet.getColumn('precioVenta').numFmt = '"$"#,##0';
    worksheet.getColumn('utilidad').numFmt = '"$"#,##0';

    // Fila de totales
    const lastRow = worksheet.lastRow!.number + 2;
    worksheet.mergeCells(`A${lastRow}:F${lastRow}`);
    const totalLabelCell = worksheet.getCell(`A${lastRow}`);
    totalLabelCell.value = 'TOTALES';
    totalLabelCell.font = { bold: true, size: 12 };
    totalLabelCell.alignment = { horizontal: 'right' };

    worksheet.getCell(`G${lastRow}`).value = totalGastos;
    worksheet.getCell(`G${lastRow}`).numFmt = '"$"#,##0';
    worksheet.getCell(`G${lastRow}`).font = { bold: true };

    worksheet.getCell(`I${lastRow}`).value = totalVentas;
    worksheet.getCell(`I${lastRow}`).numFmt = '"$"#,##0';
    worksheet.getCell(`I${lastRow}`).font = { bold: true };

    worksheet.getCell(`J${lastRow}`).value = totalUtilidad;
    worksheet.getCell(`J${lastRow}`).numFmt = '"$"#,##0';
    worksheet.getCell(`J${lastRow}`).font = { bold: true, color: { argb: totalUtilidad >= 0 ? 'FF00B050' : 'FFFF0000' } };

    // Generar archivo
    const fileName = `reporte-ventas-${selectedYear}-${Date.now()}.xlsx`;
    const filePath = path.join(ensureUploadsDir(), fileName);

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error al descargar archivo:', err);
      }
      fs.unlinkSync(filePath);
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al exportar reporte mensual', error: error.message });
  }
};

// Exportar plantilla de gastos detallados
export const exportExpensesTemplate = async (
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
    const worksheet = workbook.addWorksheet('Control de Gastos');

    // Configurar ancho de columnas
    worksheet.columns = [
      { width: 40 }, // Descripción
      { width: 20 }, // Encargado
      { width: 15 }, // Fecha
    ];

    // Encabezado principal
    worksheet.mergeCells('A1:C1');
    const headerCell = worksheet.getCell('A1');
    headerCell.value = `CONTROL DE GASTOS - ${vehicle.marca} ${vehicle.modelo} (${vehicle.placa})`;
    headerCell.font = { size: 14, bold: true };
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).height = 25;

    let currentRow = 3;

    // Función para crear sección con datos
    const createSection = (title: string, color: string, gastos: any[]) => {
      // Título de sección
      worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
      const titleCell = worksheet.getCell(`A${currentRow}`);
      titleCell.value = title;
      titleCell.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      };
      worksheet.getRow(currentRow).height = 20;
      currentRow++;

      // Encabezados de columnas
      worksheet.getCell(`A${currentRow}`).value = 'DESCRIPCION';
      worksheet.getCell(`B${currentRow}`).value = 'ENCARGADO';
      worksheet.getCell(`C${currentRow}`).value = 'FECHA';
      
      ['A', 'B', 'C'].forEach(col => {
        const cell = worksheet.getCell(`${col}${currentRow}`);
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE7E6E6' },
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
      currentRow++;

      // Agregar datos reales o filas vacías
      const minRows = 6;
      const rowsToAdd = Math.max(minRows, gastos.length);
      
      for (let i = 0; i < rowsToAdd; i++) {
        const gasto = gastos[i];
        
        if (gasto) {
          // Llenar con datos reales
          worksheet.getCell(`A${currentRow}`).value = gasto.descripcion || '';
          worksheet.getCell(`B${currentRow}`).value = gasto.encargado || '';
          worksheet.getCell(`C${currentRow}`).value = gasto.fecha 
            ? new Date(gasto.fecha).toLocaleDateString('es-CO')
            : '';
        }
        
        // Aplicar bordes
        ['A', 'B', 'C'].forEach(col => {
          const cell = worksheet.getCell(`${col}${currentRow}`);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
        currentRow++;
      }

      currentRow++; // Espacio entre secciones
    };

    // Crear todas las secciones con datos reales
    createSection('LAMINA Y PINTURA', 'FF92D050', vehicle.gastosDetallados?.pintura || []);
    createSection('MECANICA', 'FFFFC000', vehicle.gastosDetallados?.mecanica || []);
    createSection('ALISTAMIENTO', 'FF00B050', vehicle.gastosDetallados?.alistamiento || []);
    createSection('TAPICERIA', 'FFFF6B9D', vehicle.gastosDetallados?.tapiceria || []);
    createSection('TRANSPORTE', 'FF00B0F0', vehicle.gastosDetallados?.transporte || []);
    createSection('TRASPASO', 'FF7030A0', vehicle.gastosDetallados?.traspaso || []);
    createSection('VARIOS', 'FFC0C0C0', vehicle.gastosDetallados?.varios || []);

    // Generar archivo
    const fileName = `gastos-${vehicle.placa}-${Date.now()}.xlsx`;
    const filePath = path.join(ensureUploadsDir(), fileName);

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error al descargar archivo:', err);
      }
      fs.unlinkSync(filePath);
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al exportar plantilla de gastos', error: error.message });
  }
};


// Obtener reportes mensuales de ventas y gastos
export const getMonthlyReports = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { year } = req.query;
    const selectedYear = year ? parseInt(year as string) : new Date().getFullYear();

    // Obtener vehículos vendidos en el año seleccionado
    const startDate = new Date(selectedYear, 0, 1);
    const endDate = new Date(selectedYear, 11, 31, 23, 59, 59);

    const vehiculosVendidos = await Vehicle.find({
      estado: 'vendido',
      fechaVenta: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({ fechaVenta: 1 });

    // Agrupar por mes
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const reportesPorMes: any = {};

    vehiculosVendidos.forEach((vehiculo) => {
      if (!vehiculo.fechaVenta) return;

      const fecha = new Date(vehiculo.fechaVenta);
      const mesIndex = fecha.getMonth();
      const mesNombre = meses[mesIndex];

      if (!reportesPorMes[mesNombre]) {
        reportesPorMes[mesNombre] = {
          mes: mesNombre,
          año: selectedYear,
          totalVentas: 0,
          totalGastos: 0,
          utilidad: 0,
          cantidadVehiculos: 0,
          vehiculos: [],
        };
      }

      const costoTotal = vehiculo.precioCompra + vehiculo.gastos.total;
      const utilidad = vehiculo.precioVenta - costoTotal;

      reportesPorMes[mesNombre].totalVentas += vehiculo.precioVenta;
      reportesPorMes[mesNombre].totalGastos += costoTotal;
      reportesPorMes[mesNombre].utilidad += utilidad;
      reportesPorMes[mesNombre].cantidadVehiculos += 1;
      reportesPorMes[mesNombre].vehiculos.push({
        marca: vehiculo.marca,
        modelo: vehiculo.modelo,
        año: vehiculo.año,
        placa: vehiculo.placa,
        precioVenta: vehiculo.precioVenta,
        precioCompra: vehiculo.precioCompra,
        gastosTotal: vehiculo.gastos.total,
        utilidad: utilidad,
        fechaVenta: vehiculo.fechaVenta,
      });
    });

    // Convertir a array y ordenar por mes
    const reportes = meses
      .map((mes) => reportesPorMes[mes])
      .filter((reporte) => reporte !== undefined);

    res.json(reportes);
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al generar reportes mensuales',
      error: error.message,
    });
  }
};

// Guardar datos de venta
export const saveSaleData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const datosVenta = req.body;

    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      res.status(404).json({ message: 'Vehículo no encontrado' });
      return;
    }

    const normalizeNumber = (value: unknown, fallback: number): number => {
      if (value === undefined || value === null) return fallback;
      const numeric = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(numeric as number) ? (numeric as number) : fallback;
    };

    const normalizeDate = (value: unknown, fallback: Date = new Date()): Date => {
      if (!value) return fallback;
      // Handle string dates from frontend (e.g., "2024-01-15")
      if (typeof value === 'string') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? fallback : date;
      }
      // Handle Date objects
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? fallback : value;
      }
      return fallback;
    };

    const sanitizeText = (value: unknown): string => {
      if (value === undefined || value === null) return '';
      return typeof value === 'string' ? value.trim() : String(value);
    };

    // Limpiar estadoTramite inválido si quedó como string vacío
    if ((vehicle as any).estadoTramite === '') {
      (vehicle as any).estadoTramite = undefined;
    }

    // Obtener datos de venta existentes para merge (si estamos actualizando)
    const existingDatosVenta = (vehicle.datosVenta || {}) as IDatosVenta;

    // Función helper para merge profundo de objetos
    const mergeObject = (newData: any, existingData: any, defaults: any) => {
      const result = { ...defaults };
      if (existingData) {
        Object.keys(existingData).forEach(key => {
          if (existingData[key] !== undefined && existingData[key] !== null && existingData[key] !== '') {
            result[key] = existingData[key];
          }
        });
      }
      if (newData) {
        Object.keys(newData).forEach(key => {
          if (newData[key] !== undefined && newData[key] !== null && newData[key] !== '') {
            result[key] = newData[key];
          }
        });
      }
      return result;
    };

    // Merge de vendedor
    const vendedorDefaults = {
      nombre: '',
      identificacion: '',
      direccion: '',
      telefono: '',
    };

    // Merge de comprador
    const compradorDefaults = {
      nombre: '',
      identificacion: '',
      direccion: '',
      telefono: '',
      email: '',
    };

    // Merge de vehiculoAdicional
    const vehiculoAdicionalDefaults = {
      tipoCarroceria: '',
      capacidad: '',
      numeroPuertas: 4,
      numeroMotor: '',
      linea: '',
      actaManifiesto: '',
      sitioMatricula: '',
      tipoServicio: 'PARTICULAR',
    };

    // Merge de transaccion
    const transaccionDefaults = {
      lugarCelebracion: '',
      fechaCelebracion: new Date(),
      precioLetras: '',
      formaPago: '',
      vendedorAnterior: '',
      cedulaVendedorAnterior: '',
      diasTraspaso: 30,
      fechaEntrega: new Date(),
      horaEntrega: '',
      domicilioContractual: '',
      clausulasAdicionales: '',
    };

    // Helper to safely get string value
    const safeString = (value: unknown): string => {
      if (value === undefined || value === null) return '';
      return String(value).trim();
    };

    const sanitizedDatosVenta = {
      vendedor: mergeObject(
        datosVenta?.vendedor,
        existingDatosVenta?.vendedor,
        vendedorDefaults
      ),
      comprador: mergeObject(
        datosVenta?.comprador,
        existingDatosVenta?.comprador,
        compradorDefaults
      ),
      vehiculoAdicional: {
        ...mergeObject(
          datosVenta?.vehiculoAdicional,
          existingDatosVenta?.vehiculoAdicional,
          vehiculoAdicionalDefaults
        ),
        numeroPuertas: normalizeNumber(
          datosVenta?.vehiculoAdicional?.numeroPuertas,
          existingDatosVenta?.vehiculoAdicional?.numeroPuertas || 4
        ),
      },
      transaccion: {
        ...mergeObject(
          datosVenta?.transaccion,
          existingDatosVenta?.transaccion,
          transaccionDefaults
        ),
        diasTraspaso: normalizeNumber(
          datosVenta?.transaccion?.diasTraspaso,
          existingDatosVenta?.transaccion?.diasTraspaso || 30
        ),
        fechaCelebracion: normalizeDate(
          datosVenta?.transaccion?.fechaCelebracion,
          existingDatosVenta?.transaccion?.fechaCelebracion || new Date()
        ),
        fechaEntrega: normalizeDate(
          datosVenta?.transaccion?.fechaEntrega,
          existingDatosVenta?.transaccion?.fechaEntrega || new Date()
        ),
      },
    };

    // Aplicar sanitize a todos los campos de texto
    sanitizedDatosVenta.vendedor.nombre = sanitizeText(sanitizedDatosVenta.vendedor.nombre);
    sanitizedDatosVenta.vendedor.identificacion = sanitizeText(sanitizedDatosVenta.vendedor.identificacion);
    sanitizedDatosVenta.vendedor.direccion = sanitizeText(sanitizedDatosVenta.vendedor.direccion);
    sanitizedDatosVenta.vendedor.telefono = sanitizeText(sanitizedDatosVenta.vendedor.telefono);

    sanitizedDatosVenta.comprador.nombre = sanitizeText(sanitizedDatosVenta.comprador.nombre);
    sanitizedDatosVenta.comprador.identificacion = sanitizeText(sanitizedDatosVenta.comprador.identificacion);
    sanitizedDatosVenta.comprador.direccion = sanitizeText(sanitizedDatosVenta.comprador.direccion);
    sanitizedDatosVenta.comprador.telefono = sanitizeText(sanitizedDatosVenta.comprador.telefono);
    sanitizedDatosVenta.comprador.email = sanitizeText(sanitizedDatosVenta.comprador.email);

    sanitizedDatosVenta.vehiculoAdicional.tipoCarroceria = sanitizeText(sanitizedDatosVenta.vehiculoAdicional.tipoCarroceria);
    sanitizedDatosVenta.vehiculoAdicional.capacidad = sanitizeText(sanitizedDatosVenta.vehiculoAdicional.capacidad);
    sanitizedDatosVenta.vehiculoAdicional.numeroMotor = sanitizeText(sanitizedDatosVenta.vehiculoAdicional.numeroMotor);
    sanitizedDatosVenta.vehiculoAdicional.linea = sanitizeText(sanitizedDatosVenta.vehiculoAdicional.linea);
    sanitizedDatosVenta.vehiculoAdicional.actaManifiesto = sanitizeText(sanitizedDatosVenta.vehiculoAdicional.actaManifiesto);
    sanitizedDatosVenta.vehiculoAdicional.sitioMatricula = sanitizeText(sanitizedDatosVenta.vehiculoAdicional.sitioMatricula);
    sanitizedDatosVenta.vehiculoAdicional.tipoServicio = sanitizeText(sanitizedDatosVenta.vehiculoAdicional.tipoServicio) || 'PARTICULAR';

    sanitizedDatosVenta.transaccion.lugarCelebracion = sanitizeText(sanitizedDatosVenta.transaccion.lugarCelebracion);
    sanitizedDatosVenta.transaccion.precioLetras = sanitizeText(sanitizedDatosVenta.transaccion.precioLetras);
    sanitizedDatosVenta.transaccion.formaPago = sanitizeText(sanitizedDatosVenta.transaccion.formaPago);
    sanitizedDatosVenta.transaccion.vendedorAnterior = sanitizeText(sanitizedDatosVenta.transaccion.vendedorAnterior);
    sanitizedDatosVenta.transaccion.cedulaVendedorAnterior = sanitizeText(sanitizedDatosVenta.transaccion.cedulaVendedorAnterior);
    sanitizedDatosVenta.transaccion.horaEntrega = sanitizeText(sanitizedDatosVenta.transaccion.horaEntrega);
    sanitizedDatosVenta.transaccion.domicilioContractual = sanitizeText(sanitizedDatosVenta.transaccion.domicilioContractual);
    sanitizedDatosVenta.transaccion.clausulasAdicionales = sanitizeText(sanitizedDatosVenta.transaccion.clausulasAdicionales);

    // Actualizar datos de venta
    vehicle.datosVenta = sanitizedDatosVenta as any;
    vehicle.estado = 'vendido';
    
    // Solo establecer fechaVenta si no existe (nueva venta), no al actualizar
    if (!vehicle.fechaVenta) {
      vehicle.fechaVenta = new Date();
    }

    await vehicle.save();

    res.json({
      message: 'Datos de venta guardados exitosamente',
      vehicle,
    });
  } catch (error: any) {
    console.error('Error en saveSaleData:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => ({
        field: err.path,
        message: err.message,
        value: err.value,
      }));
      res.status(400).json({
        message: 'Error de validación',
        errors,
        details: error.message,
      });
      return;
    }

    if (error.name === 'CastError') {
      res.status(400).json({
        message: 'Error de tipo de dato',
        error: `El campo ${error.path} tiene un valor inválido: ${error.value}`,
        details: error.message,
      });
      return;
    }

    res.status(500).json({
      message: 'Error al guardar datos de venta',
      error: error.message,
    });
  }
};

// Generar contrato de compraventa en PDF
export const generateContract = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      res.status(404).json({ message: 'Vehículo no encontrado' });
      return;
    }

    // Validar que existan datos de venta Y que tengan contenido real
    if (!vehicle.datosVenta || 
        !vehicle.datosVenta.comprador?.nombre || 
        !vehicle.datosVenta.comprador?.identificacion ||
        !vehicle.datosVenta.vendedor?.nombre ||
        !vehicle.datosVenta.transaccion?.lugarCelebracion) {
      res.status(400).json({ 
        message: 'El vehículo no tiene datos de venta completos. Por favor, completa todos los campos requeridos antes de generar el contrato.' 
      });
      return;
    }

    // Preparar datos
    const fechaCelebracion = vehicle.datosVenta.transaccion.fechaCelebracion 
      ? new Date(vehicle.datosVenta.transaccion.fechaCelebracion)
      : new Date();
    
    const fechaEntrega = vehicle.datosVenta.transaccion.fechaEntrega
      ? new Date(vehicle.datosVenta.transaccion.fechaEntrega)
      : new Date();

    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mesNombre = meses[fechaCelebracion.getMonth()];

    // Crear documento PDF
    const doc = new PDFDocument({ 
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 60, right: 60 }
    });

    // Configurar respuesta
    const fileName = `contrato-${vehicle.placa}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Pipe el PDF directamente a la respuesta
    doc.pipe(res);

    // TÍTULO
    doc.fontSize(14).font('Helvetica-Bold')
       .text('CONTRATO DE COMPRAVENTA DE VEHICULO AUTOMOTOR', { align: 'center' });
    doc.moveDown(2);

    // LUGAR Y FECHA DE CELEBRACIÓN
    doc.fontSize(11).font('Helvetica-Bold').text('LUGAR Y FECHA DE CELEBRACION DEL CONTRATO:');
    doc.fontSize(10).font('Helvetica')
       .text(`${vehicle.datosVenta.transaccion.lugarCelebracion}, ${fechaCelebracion.getDate()} de ${mesNombre} de ${fechaCelebracion.getFullYear()}`);
    doc.moveDown();

    // VENDEDOR
    doc.fontSize(11).font('Helvetica-Bold').text('VENDEDOR(ES):');
    doc.fontSize(10).font('Helvetica')
       .text(`Nombre e Identificación: ${vehicle.datosVenta.vendedor.nombre} - ${vehicle.datosVenta.vendedor.identificacion}`)
       .text(`Dirección: ${vehicle.datosVenta.vendedor.direccion}`)
       .text(`Teléfono: ${vehicle.datosVenta.vendedor.telefono}`);
    doc.moveDown();

    // COMPRADOR
    doc.fontSize(11).font('Helvetica-Bold').text('COMPRADOR(ES):');
    doc.fontSize(10).font('Helvetica')
       .text(`Nombre e Identificación: ${vehicle.datosVenta.comprador.nombre} - ${vehicle.datosVenta.comprador.identificacion}`)
       .text(`Dirección: ${vehicle.datosVenta.comprador.direccion}`)
       .text(`Teléfono: ${vehicle.datosVenta.comprador.telefono}`)
       .text(`Correo electrónico: ${vehicle.datosVenta.comprador.email}`);
    doc.moveDown();

    // DOMICILIO CONTRACTUAL
    doc.fontSize(11).font('Helvetica-Bold').text('DOMICILIO CONTRACTUAL:');
    doc.fontSize(10).font('Helvetica')
       .text(vehicle.datosVenta.transaccion.domicilioContractual);
    doc.moveDown();

    // INTRODUCCIÓN A LAS CLÁUSULAS
    doc.fontSize(10).font('Helvetica')
       .text('Las partes convienen celebrar el presente contrato de compraventa, que se regirá por las anteriores estipulaciones, las normas legales aplicables a la materia y en especial por las siguientes cláusulas:', { align: 'justify' });
    doc.moveDown();

    // CLÁUSULA PRIMERA
    doc.fontSize(10).font('Helvetica-Bold').text('PRIMERA.-OBJETO DEL CONTRATO: ', { continued: true })
       .font('Helvetica').text('mediante el presente contrato EL VENDEDOR transfiere a título de venta y EL COMPRADOR adquiere la propiedad del vehículo automotor que a continuación se identifica:', { align: 'justify' });
    doc.moveDown(0.5);
    
    doc.fontSize(10).font('Helvetica')
       .text(`CLASE: AUTOMÓVIL                    MARCA: ${vehicle.marca}                    MODELO: ${vehicle.año}`)
       .text(`TIPO DE CARROCERIA: ${vehicle.datosVenta.vehiculoAdicional.tipoCarroceria || 'N/A'}        COLOR: ${vehicle.color}        CAPACIDAD: ${vehicle.datosVenta.vehiculoAdicional.capacidad || 'N/A'}`)
       .text(`CHASIS No.: ${vehicle.vin}`)
       .text(`MOTOR No.: ${vehicle.datosVenta.vehiculoAdicional.numeroMotor || 'N/A'}        LINEA: ${vehicle.datosVenta.vehiculoAdicional.linea || vehicle.modelo}        PUERTAS: ${vehicle.datosVenta.vehiculoAdicional.numeroPuertas || 4}`)
       .text(`SITIO DE MATRICULA: ${vehicle.datosVenta.vehiculoAdicional.sitioMatricula || 'N/A'}        PLACA No.: ${vehicle.placa}        SERVICIO: ${vehicle.datosVenta.vehiculoAdicional.tipoServicio || 'PARTICULAR'}`);
    doc.moveDown();

    // CLÁUSULA SEGUNDA
    doc.fontSize(10).font('Helvetica-Bold').text('SEGUNDA.- PRECIO: ', { continued: true })
       .font('Helvetica').text(`como precio del automotor descrito las partes acuerdan la suma de ${vehicle.datosVenta.transaccion.precioLetras} ($${vehicle.precioVenta.toLocaleString('es-CO')}), suma que deberá ser pagada en su totalidad, libre de descuentos por concepto de costos bancarios tales como 4xmil, cambio de plaza, entre otros.`, { align: 'justify' });
    doc.moveDown();

    // CLÁUSULA TERCERA
    doc.fontSize(10).font('Helvetica-Bold').text('TERCERA.- FORMA DE PAGO: ', { continued: true })
       .font('Helvetica').text(`EL COMPRADOR se compromete a pagar el precio a que se refiere la cláusula anterior de la siguiente forma: ${vehicle.datosVenta.transaccion.formaPago}`, { align: 'justify' });
    doc.moveDown();

    // CLÁUSULA CUARTA
    const vendedorAnterior = vehicle.datosVenta.transaccion.vendedorAnterior || '[NOMBRE DEL VENDEDOR ANTERIOR]';
    const cedulaVendedorAnterior = vehicle.datosVenta.transaccion.cedulaVendedorAnterior || '[CÉDULA]';
    
    doc.fontSize(10).font('Helvetica-Bold').text('CUARTA.- ', { continued: true })
       .font('Helvetica').text(`EL VENDEDOR manifiesta que adquirió el vehículo antes descrito por compra a ${vendedorAnterior} identificado con CC ${cedulaVendedorAnterior}. Y declara que está libre de toda clase de gravámenes, embargos, multas, comparendos, pactos de reserva de dominio y cualquier otra circunstancia que afecte el libre comercio del bien objeto del presente contrato.`, { align: 'justify' });
    doc.moveDown();

    // CLÁUSULA QUINTA
    doc.fontSize(10).font('Helvetica-Bold').text('QUINTA.- ', { continued: true })
       .font('Helvetica').text('EL COMPRADOR declara que conoce el estado jurídico y factico en que se encuentra el vehículo y así lo acepta. Y que por tratarse de un vehículo usado EL VENDEDOR no garantiza el estado de sus partes, condiciones técnicas, físicos o de funcionamiento, que lo afecten total o parcialmente, o por defectos de fabricación o vicios ocultos, habida cuenta que este fue elegido por EL COMPRADOR, quien a su elección ha realizado o no peritaje y revisión de antecedentes, y por lo tanto asume la responsabilidad por su elección, y como consecuencia renuncia a cualquier reclamación futura, exonerando a EL VENDEDOR de toda responsabilidad.', { align: 'justify' });
    doc.moveDown();

    // CLÁUSULA SEXTA
    const diasTraspaso = vehicle.datosVenta.transaccion.diasTraspaso || 30;
    doc.fontSize(10).font('Helvetica-Bold').text('SEXTA.- TRASPASO Y GASTOS: ', { continued: true })
       .font('Helvetica').text(`Las partes se obligan a realizar las gestiones de traspaso ante las autoridades de tránsito dentro de los ${diasTraspaso} (${diasTraspaso === 30 ? 'treinta' : diasTraspaso}) días posteriores a la firma del presente contrato. El vehículo se entrega al día a la fecha de la firma del presente contrato, y por lo tanto valores tales como, los correspondientes a Impuestos se liquidarán proporcionalmente según le corresponda a cada una de las partes, entre otros. EL COMPRADOR declara que, en caso de requerir de la prestación de los servicios de un asesor de trámites ante las autoridades de tránsito, asumirá la totalidad del valor de los respectivos honorarios.`, { align: 'justify' });
    doc.moveDown();

    // CLÁUSULA SÉPTIMA
    const horaEntrega = vehicle.datosVenta.transaccion.horaEntrega || '[HORA]';
    doc.fontSize(10).font('Helvetica-Bold').text('SEPTIMA.- ENTREGA: ', { continued: true })
       .font('Helvetica').text(`En la fecha ${fechaEntrega.toLocaleDateString('es-CO')} y hora ${horaEntrega} EL VENDEDOR hace entrega real y material del vehículo objeto del presente contrato a EL COMPRADOR, y éste declara conocer y aceptar el estado en que se encuentra, y recibirlo a entera satisfacción. Por lo tanto, a partir de este momento EL COMPRADOR asume los riesgos mecánicos y las responsabilidades jurídicas relativos al vehículo.`, { align: 'justify' });
    doc.moveDown();

    // CLÁUSULA OCTAVA
    doc.fontSize(10).font('Helvetica-Bold').text('OCTAVA.- RESERVA DEL DOMINIO: ', { continued: true })
       .font('Helvetica').text('EL VENDEDOR se reserva la propiedad del vehículo identificado en la cláusula primera del presente contrato, hasta el momento en que se pague la totalidad del precio estipulado, de conformidad con el Art. 952 del Código de Comercio, y por lo tanto, no se encuentra obligado a realizar la entrega física del mismo hasta tanto se realice la cancelación total. Se entiende por cancelación total el que la transferencia o el cheque se haya hecho efectiva/o.', { align: 'justify' });
    doc.moveDown();

    // CLÁUSULA NOVENA
    doc.fontSize(10).font('Helvetica-Bold').text('NOVENA.- CLAUSULA PENAL: ', { continued: true })
       .font('Helvetica').text('Las partes establecen como sanción pecuniaria a cargo de quien incumpla una cualquiera de las estipulaciones derivadas de este contrato, la suma correspondiente al diez por ciento (10%) del precio pactado en el presente contrato.', { align: 'justify' });
    doc.moveDown();

    // CLÁUSULAS ADICIONALES
    if (vehicle.datosVenta.transaccion.clausulasAdicionales && vehicle.datosVenta.transaccion.clausulasAdicionales !== 'Ninguna') {
      doc.fontSize(10).font('Helvetica-Bold').text('CLAUSULAS ADICIONALES:');
      doc.fontSize(10).font('Helvetica')
         .text(vehicle.datosVenta.transaccion.clausulasAdicionales, { align: 'justify' });
      doc.moveDown();
    }

    // Verificar si necesitamos nueva página para firmas
    if (doc.y > 600) {
      doc.addPage();
    }

    // CONSTANCIA Y FIRMAS
    doc.moveDown();
    doc.fontSize(10).font('Helvetica')
       .text(`En constancia de lo anterior, los contratantes suscriben el presente documento en la ciudad de ${vehicle.datosVenta.transaccion.lugarCelebracion}, el día ${fechaCelebracion.getDate()} (${fechaCelebracion.getDate()}), del mes de ${mesNombre}, del año ${fechaCelebracion.getFullYear()} (${fechaCelebracion.getFullYear()}).`, { align: 'justify' });
    doc.moveDown(3);

    // Líneas de firma
    const signatureY = doc.y;
    const pageWidth = doc.page.width - 120;
    const signatureWidth = 220;
    const leftX = 60;
    const rightX = pageWidth - signatureWidth + 60;

    // VENDEDOR
    doc.fontSize(10).font('Helvetica-Bold')
       .text('VENDEDOR', leftX, signatureY, { width: signatureWidth, align: 'center' });
    doc.moveDown(2);
    const vendedorLineY = doc.y;
    doc.moveTo(leftX, vendedorLineY).lineTo(leftX + signatureWidth, vendedorLineY).stroke();
    doc.fontSize(9).font('Helvetica')
       .text(`C.C. No. ${vehicle.datosVenta.vendedor.identificacion}`, leftX, vendedorLineY + 5, { width: signatureWidth, align: 'center' });

    // COMPRADOR
    doc.fontSize(10).font('Helvetica-Bold')
       .text('COMPRADOR', rightX, signatureY, { width: signatureWidth, align: 'center' });
    doc.moveTo(rightX, vendedorLineY).lineTo(rightX + signatureWidth, vendedorLineY).stroke();
    doc.fontSize(9).font('Helvetica')
       .text(`C.C. No. ${vehicle.datosVenta.comprador.identificacion}`, rightX, vendedorLineY + 5, { width: signatureWidth, align: 'center' });

    // Finalizar el documento
    doc.end();

  } catch (error: any) {
    console.error('Error al generar contrato:', error);
    res.status(500).json({ 
      message: 'Error al generar contrato', 
      error: error.message 
    });
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

    const fechaCelebracion = vehicle.datosVenta.transaccion.fechaCelebracion 
      ? new Date(vehicle.datosVenta.transaccion.fechaCelebracion)
      : new Date();

    // Crear documento PDF en tamaño legal (8.5x14") para más espacio
    const doc = new PDFDocument({ 
      size: 'LEGAL',
      margins: { top: 30, bottom: 30, left: 40, right: 40 }
    });

    // Configurar respuesta
    const fileName = `formulario-traspaso-${vehicle.placa}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Pipe el PDF directamente a la respuesta
    doc.pipe(res);

    // Helper functions para dibujar cajas y checkboxes
    const drawBox = (x: number, y: number, width: number, height: number, label: string, value: string) => {
      doc.rect(x, y, width, height).stroke();
      if (label) {
        doc.fontSize(6).font('Helvetica');
        doc.text(label, x + 2, y + 2, { width: width - 4 });
      }
      if (value) {
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text(value, x + 2, y + (label ? 10 : 8), { width: width - 4 });
      }
    };

    const drawCheckbox = (x: number, y: number, label: string, checked: boolean = false) => {
      doc.rect(x, y, 8, 8).stroke();
      if (checked) {
        doc.fontSize(6).font('Helvetica-Bold');
        doc.text('X', x + 2, y + 1);
      }
      if (label) {
        doc.fontSize(7).font('Helvetica');
        doc.text(label, x + 12, y + 1);
      }
    };

    // === PÁGINA 1: FORMULARIO OFICIAL RUNT ===
    
    // Encabezado principal
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('MINISTERIO DE TRANSPORTE', 40, 30);
    doc.text('FORMULARIO ÚNICO DE SOLICITUD DE TRÁMITES', 200, 30, { align: 'center' });
    doc.text('RUNT', 520, 30, { align: 'right' });
    
    doc.moveTo(40, 42).lineTo(560, 42).stroke();
    
    // SECCIÓN 1: ORGANISMO DE TRÁNSITO
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('1. ORGANISMO DE TRÁNSITO', 40, 50);
    
    drawBox(40, 58, 200, 20, 'Nombre', vehicle.datosVenta.vehiculoAdicional.sitioMatricula || '');
    drawBox(245, 58, 150, 20, 'Ciudad', vehicle.datosVenta.transaccion.lugarCelebracion || '');
    drawBox(400, 58, 80, 20, 'Código', '');
    drawBox(485, 58, 75, 20, 'Fecha', fechaCelebracion.toLocaleDateString('es-CO'));

    // SECCIÓN 2: PLACA
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('2. PLACA', 40, 85);
    
    const placaLetras = vehicle.placa.match(/[A-Z]+/)?.[0] || '';
    const placaNumeros = vehicle.placa.match(/[0-9]+/)?.[0] || '';
    
    drawBox(40, 93, 80, 20, 'Letras', placaLetras);
    drawBox(125, 93, 80, 20, 'Números', placaNumeros);

    // SECCIÓN 3: TRÁMITE SOLICITADO
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('3. TRÁMITE SOLICITADO', 250, 85);
    
    const tramites = [
      { x: 250, y: 93, label: 'Matrícula inicial' },
      { x: 330, y: 93, label: 'Renovación matrícula' },
      { x: 430, y: 93, label: 'Traspaso', checked: true },
      { x: 250, y: 105, label: 'Cambio servicio' },
      { x: 330, y: 105, label: 'Regrabar motor' },
      { x: 430, y: 105, label: 'Regrabar chasis' },
      { x: 250, y: 117, label: 'Duplicado tarjeta' },
      { x: 330, y: 117, label: 'Inscripción prenda' },
      { x: 430, y: 117, label: 'Levantamiento prenda' },
      { x: 250, y: 129, label: 'Traslado matrícula' },
      { x: 330, y: 129, label: 'Cambio motor' },
      { x: 430, y: 129, label: 'Cambio carrocería' },
      { x: 250, y: 141, label: 'Cambio combustible' },
      { x: 330, y: 141, label: 'Cambio color' },
      { x: 430, y: 141, label: 'Regrabar serie' },
      { x: 250, y: 153, label: 'Otros' },
    ];
    
    tramites.forEach(t => drawCheckbox(t.x, t.y, t.label, t.checked || false));

    // SECCIÓN 4: CLASE DE VEHÍCULO
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('4. CLASE DE VEHÍCULO', 40, 165);
    
    const clases = [
      { x: 40, y: 173, label: 'Automóvil', checked: true },
      { x: 120, y: 173, label: 'Camioneta' },
      { x: 200, y: 173, label: 'Bus/Busetón' },
      { x: 290, y: 173, label: 'Camión' },
      { x: 370, y: 173, label: 'Tractocamión' },
      { x: 460, y: 173, label: 'Volqueta' },
      { x: 40, y: 185, label: 'Motocicleta' },
      { x: 120, y: 185, label: 'Motocarro' },
      { x: 200, y: 185, label: 'Cuatrimoto' },
      { x: 290, y: 185, label: 'Trimoto' },
      { x: 370, y: 185, label: 'Bicicleta' },
      { x: 460, y: 185, label: 'Otros' },
    ];
    
    clases.forEach(c => drawCheckbox(c.x, c.y, c.label, c.checked || false));

    // SECCIÓN 5: MARCA
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('5. MARCA', 40, 200);
    drawBox(40, 208, 150, 18, '', vehicle.marca);

    // SECCIÓN 6: LÍNEA
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('6. LÍNEA', 200, 200);
    drawBox(200, 208, 200, 18, '', vehicle.datosVenta.vehiculoAdicional.linea || vehicle.modelo);

    // SECCIÓN 7: COMBUSTIBLE
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('7. COMBUSTIBLE', 410, 200);
    
    drawCheckbox(410, 208, 'Gasolina', true);
    drawCheckbox(480, 208, 'Diesel');
    drawCheckbox(410, 220, 'Gas');
    drawCheckbox(480, 220, 'Eléctrico');
    drawCheckbox(410, 232, 'Híbrido');
    drawCheckbox(480, 232, 'Otros');

    // SECCIÓN 8: COLOR
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('8. COLOR', 40, 250);
    drawBox(40, 258, 150, 18, '', vehicle.color);

    // SECCIÓN 9: MODELO (AÑO)
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('9. MODELO (AÑO)', 200, 250);
    drawBox(200, 258, 80, 18, '', vehicle.año.toString());

    // SECCIÓN 10: CILINDRADA (CC)
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('10. CILINDRADA (CC)', 290, 250);
    drawBox(290, 258, 100, 18, '', '');

    // SECCIÓN 11: CAPACIDAD (PASAJEROS)
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('11. CAPACIDAD', 400, 250);
    drawBox(400, 258, 80, 18, 'Pasajeros', vehicle.datosVenta.vehiculoAdicional.capacidad || '5');

    // SECCIÓN 12: BLINDAJE
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('12. BLINDAJE', 40, 285);
    drawCheckbox(40, 293, 'Sí');
    drawCheckbox(80, 293, 'No', true);
    drawBox(120, 293, 100, 18, 'Nivel', '');

    // SECCIÓN 13: DESMONTE BLINDAJE
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('13. DESMONTE BLINDAJE', 230, 285);
    drawCheckbox(230, 293, 'Sí');
    drawCheckbox(270, 293, 'No', true);

    // SECCIÓN 14: POTENCIA (HP/KW)
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('14. POTENCIA', 330, 285);
    drawBox(330, 293, 80, 18, 'HP', '');
    drawBox(415, 293, 80, 18, 'KW', '');

    // SECCIÓN 15: CARROCERÍA
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('15. TIPO CARROCERÍA', 40, 320);
    
    const carrocerias = [
      { x: 40, y: 328, label: 'Furgón' },
      { x: 100, y: 328, label: 'Estacas' },
      { x: 160, y: 328, label: 'Tanque' },
      { x: 220, y: 328, label: 'Planchón' },
      { x: 290, y: 328, label: 'Cama baja' },
      { x: 370, y: 328, label: 'Mixta' },
      { x: 430, y: 328, label: 'Otra' },
    ];
    
    carrocerias.forEach(c => drawCheckbox(c.x, c.y, c.label));
    drawBox(40, 340, 200, 18, 'Especifique', vehicle.datosVenta.vehiculoAdicional.tipoCarroceria || '');

    // SECCIÓN 16: IDENTIFICACIÓN INTERNA (MOTOR/CHASIS/VIN)
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('16. IDENTIFICACIÓN INTERNA', 40, 370);
    
    // Motor
    doc.fontSize(6).font('Helvetica');
    doc.text('MOTOR No.', 40, 378);
    drawBox(40, 386, 180, 18, '', vehicle.datosVenta.vehiculoAdicional.numeroMotor || '');
    drawCheckbox(225, 386, 'Regrabado');
    drawCheckbox(280, 386, 'Original', true);
    
    // Chasis
    doc.fontSize(6).font('Helvetica');
    doc.text('CHASIS No.', 40, 408);
    drawBox(40, 416, 180, 18, '', vehicle.vin || '');
    drawCheckbox(225, 416, 'Regrabado');
    drawCheckbox(280, 416, 'Original', true);
    
    // Serie/VIN
    doc.fontSize(6).font('Helvetica');
    doc.text('SERIE/VIN', 330, 378);
    drawBox(330, 386, 180, 18, '', vehicle.vin || '');
    drawCheckbox(515, 386, 'Regrabado');
    drawCheckbox(515, 400, 'Original', true);

    // SECCIÓN 17: IMPORTACIÓN/REMATE
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('17. IMPORTACIÓN/REMATE', 40, 445);
    
    drawCheckbox(40, 453, 'Importación definitiva');
    drawCheckbox(150, 453, 'Remate');
    drawCheckbox(210, 453, 'Abandono');
    drawCheckbox(280, 453, 'Donación');
    drawCheckbox(350, 453, 'Resolución');
    drawCheckbox(430, 453, 'Otra');
    
    drawBox(40, 465, 150, 18, 'No. Acta/Manifiesto', vehicle.datosVenta.vehiculoAdicional.actaManifiesto || '');
    drawBox(200, 465, 150, 18, 'Fecha', '');
    drawBox(360, 465, 200, 18, 'Aduana/Entidad', '');

    // SECCIÓN 18: TIPO DE SERVICIO
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('18. TIPO DE SERVICIO', 40, 495);
    
    drawCheckbox(40, 503, 'Particular', true);
    drawCheckbox(110, 503, 'Público');
    drawCheckbox(170, 503, 'Diplomático');
    drawCheckbox(250, 503, 'Oficial');
    drawCheckbox(320, 503, 'Especial');

    // SECCIÓN 19: DATOS DEL PROPIETARIO (VENDEDOR)
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('19. DATOS DEL PROPIETARIO ACTUAL (VENDEDOR)', 40, 525);
    
    drawBox(40, 533, 200, 18, 'Apellidos', vehicle.datosVenta.vendedor.nombre.split(' ').slice(0, 2).join(' ') || '');
    drawBox(245, 533, 200, 18, 'Nombres', vehicle.datosVenta.vendedor.nombre.split(' ').slice(2).join(' ') || '');
    drawBox(450, 533, 110, 18, 'Documento', vehicle.datosVenta.vendedor.identificacion);
    
    drawBox(40, 555, 300, 18, 'Dirección', vehicle.datosVenta.vendedor.direccion);
    drawBox(345, 555, 100, 18, 'Ciudad', vehicle.datosVenta.transaccion.lugarCelebracion || '');
    drawBox(450, 555, 110, 18, 'Teléfono', vehicle.datosVenta.vendedor.telefono);

    // Línea de firma vendedor
    doc.fontSize(7).font('Helvetica');
    doc.text('Firma del Propietario (Vendedor):', 40, 585);
    doc.moveTo(40, 600).lineTo(280, 600).stroke();
    doc.fontSize(6).font('Helvetica');
    doc.text(`C.C. ${vehicle.datosVenta.vendedor.identificacion}`, 40, 605);

    // SECCIÓN 20: DATOS DEL COMPRADOR (NUEVO PROPIETARIO)
    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('20. DATOS DEL COMPRADOR (NUEVO PROPIETARIO)', 40, 625);
    
    drawBox(40, 633, 200, 18, 'Apellidos', vehicle.datosVenta.comprador.nombre.split(' ').slice(0, 2).join(' ') || '');
    drawBox(245, 633, 200, 18, 'Nombres', vehicle.datosVenta.comprador.nombre.split(' ').slice(2).join(' ') || '');
    drawBox(450, 633, 110, 18, 'Documento', vehicle.datosVenta.comprador.identificacion);
    
    drawBox(40, 655, 300, 18, 'Dirección', vehicle.datosVenta.comprador.direccion);
    drawBox(345, 655, 100, 18, 'Ciudad', vehicle.datosVenta.transaccion.lugarCelebracion || '');
    drawBox(450, 655, 110, 18, 'Teléfono', vehicle.datosVenta.comprador.telefono);

    // Línea de firma comprador
    doc.fontSize(7).font('Helvetica');
    doc.text('Firma del Comprador:', 40, 685);
    doc.moveTo(40, 700).lineTo(280, 700).stroke();
    doc.fontSize(6).font('Helvetica');
    doc.text(`C.C. ${vehicle.datosVenta.comprador.identificacion}`, 40, 705);

    // Nota al pie
    doc.fontSize(6).font('Helvetica-Oblique');
    doc.text('Este formulario es un documento oficial para trámites ante el Registro Nacional Automotor - RUNT.', 40, 720, { align: 'center' });

    // === PÁGINA 2: CHECKLIST DE DOCUMENTOS REQUERIDOS ===
    doc.addPage();
    
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text('DOCUMENTOS REQUERIDOS PARA TRÁMITE DE TRASPASO', 40, 40, { align: 'center' });
    
    doc.moveTo(40, 55).lineTo(560, 55).stroke();
    
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('CHECKLIST DE DOCUMENTOS:', 40, 70);
    
    const documentos = [
      '□ Tarjeta de propiedad del vehículo (original)',
      '□ Certificado de tradición y libertad (vigente)',
      '□ SOAT vigente',
      '□ Revisión técnico-mecánica vigente',
      '□ Certificado de emisiones (si aplica)',
      '□ Fotocopia de la cédula del vendedor (ampliada al 150%)',
      '□ Fotocopia de la cédula del comprador (ampliada al 150%)',
      '□ Poder especial si el trámite lo realiza un tercero',
      '□ Formulario de traspaso debidamente diligenciado',
      '□ Recibo de pago de los derechos de trámite',
      '□ Certificado de gravámenes (si aplica)',
      '□ Paz y salvo de impuestos vehiculares',
      '□ Declaración juramentada de no poseer otro vehículo (si aplica para exenciones)'
    ];

    let yPos = 90;
    documentos.forEach((docItem) => {
      doc.fontSize(10).font('Helvetica');
      doc.text(docItem, 40, yPos);
      yPos += 20;
    });

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('NOTAS IMPORTANTES:', 40, yPos + 10);
    
    const notas = [
      '1. Todos los documentos deben estar vigentes al momento de realizar el trámite.',
      '2. El vendedor debe presentar la tarjeta de propiedad original.',
      '3. Las fotocopias de cédulas deben estar ampliadas al 150% y ser legibles.',
      '4. El traspaso debe realizarse dentro del plazo establecido en el contrato.',
      '5. Para más información, visite www.runt.gov.co',
      '6. El comprador debe verificar que el vehículo no tenga gravámenes ni limitaciones.',
      '7. En caso de fallecimiento del propietario, se requiere certificado de defunción y sucesión.'
    ];

    yPos += 30;
    notas.forEach((nota) => {
      doc.fontSize(9).font('Helvetica');
      doc.text(nota, 40, yPos, { align: 'justify', width: 520 });
      yPos += 18;
    });

    // Finalizar el documento
    doc.end();

  } catch (error: any) {
    console.error('Error al generar formulario de traspaso:', error);
    res.status(500).json({ 
      message: 'Error al generar formulario de traspaso', 
      error: error.message 
    });
  }
};


// Consulta pública del estado de trámite por placa (sin autenticación)
export const consultarEstadoTramite = async (req: Request, res: Response): Promise<void> => {
  try {
    const { placa } = req.params;

    if (!placa) {
      res.status(400).json({ message: 'La placa es requerida' });
      return;
    }

    // Buscar vehículo por placa (solo vendidos)
    const vehicle = await Vehicle.findOne({ 
      placa: placa.toUpperCase(),
      estado: 'vendido'
    }).select('marca modelo año placa color estado estadoTramite fechaVenta datosVenta');

    if (!vehicle) {
      res.status(404).json({ 
        message: 'No se encontró un vehículo vendido con esta placa',
        found: false
      });
      return;
    }

    // Preparar respuesta con información limitada (seguridad)
    const response = {
      found: true,
      vehiculo: {
        marca: vehicle.marca,
        modelo: vehicle.modelo,
        año: vehicle.año,
        placa: vehicle.placa,
        color: vehicle.color,
        fechaVenta: vehicle.fechaVenta,
        estadoTramite: vehicle.estadoTramite || 'firma_documentos',
        comprador: {
          nombre: vehicle.datosVenta?.comprador?.nombre || 'No especificado'
        }
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error al consultar estado de trámite:', error);
    res.status(500).json({ 
      message: 'Error al consultar estado de trámite', 
      error: error.message 
    });
  }
};
