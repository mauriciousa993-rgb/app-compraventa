import { Request, Response } from 'express';
import Vehicle from '../models/Vehicle';
import FixedExpense from '../models/FixedExpense';
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

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const resolveMonthIndex = (monthValue: any): number | null => {
  if (!monthValue && monthValue !== 0) return null;

  const raw = `${monthValue}`.trim();
  if (!raw) return null;

  const maybeNumber = parseInt(raw, 10);
  if (!Number.isNaN(maybeNumber) && maybeNumber >= 1 && maybeNumber <= 12) {
    return maybeNumber - 1;
  }

  const normalizedMonth = normalizeText(raw);
  const monthIndex = MONTH_NAMES.findIndex((month) => normalizeText(month) === normalizedMonth);
  return monthIndex >= 0 ? monthIndex : null;
};

const getFixedExpenseAmountForMonth = (
  expense: any,
  year: number,
  monthIndex: number
): number => {
  if (!expense) return 0;

  const amount = Number(expense.monto || 0);
  if (amount <= 0) return 0;

  const startDate = expense.fechaInicio ? new Date(expense.fechaInicio) : new Date(year, 0, 1);
  const endDate = expense.fechaFin ? new Date(expense.fechaFin) : null;

  const maxDay = new Date(year, monthIndex + 1, 0).getDate();
  const paymentDay = Math.max(1, Math.min(31, Number(expense.diaPago || 1)));
  const dueDate = new Date(year, monthIndex, Math.min(paymentDay, maxDay));

  if (dueDate < startDate) return 0;
  if (endDate && dueDate > endDate) return 0;

  return amount;
};

const buildFixedExpenseMonthlyMap = (expenses: any[], year: number): number[] => {
  const monthlyMap = Array.from({ length: 12 }, () => 0);

  expenses.forEach((expense) => {
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      monthlyMap[monthIndex] += getFixedExpenseAmountForMonth(expense, year, monthIndex);
    }
  });

  return monthlyMap;
};

const YEAR_FIELD = 'a\u00f1o';

const getVehicleYear = (vehicle: any): number | string =>
  vehicle?.[YEAR_FIELD] ?? vehicle?.anio ?? '';

// Crear nuevo vehÃ­culo
export const createVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const vehicleData = req.body;
    
    // Asignar el usuario que registra
    vehicleData.registradoPor = req.user?.userId;

    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();

    res.status(201).json({
      message: 'VehÃ­culo creado exitosamente',
      vehicle,
    });
  } catch (error: any) {
    console.error('Error al crear vehÃ­culo:', error);
    
    // Manejar errores de validaciÃ³n de Mongoose
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({ 
        message: 'Error de validaciÃ³n', 
        errors: errors,
        details: error.message 
      });
      return;
    }
    
    // Manejar errores de duplicados (placa o VIN)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(400).json({ 
        message: `Ya existe un vehÃ­culo con ${field === 'placa' ? 'esta placa' : 'este VIN'}`,
        field: field
      });
      return;
    }
    
    res.status(500).json({ 
      message: 'Error al crear vehÃ­culo', 
      error: error.message 
    });
  }
};


// Obtener todos los vehÃ­culos
export const getAllVehicles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { estado, marca, modelo } = req.query;
    const yearQuery =
      (req.query as Record<string, unknown>)[YEAR_FIELD] ?? (req.query as Record<string, unknown>).anio;
    const userRole = req.user?.rol;
    
    const filter: any = {};
    
    if (estado) filter.estado = estado;
    if (marca) filter.marca = new RegExp(marca as string, 'i');
    if (modelo) filter.modelo = new RegExp(modelo as string, 'i');
    if (yearQuery !== undefined && yearQuery !== null && `${yearQuery}`.trim()) {
      const parsedYear = parseInt(`${yearQuery}`, 10);
      if (!Number.isNaN(parsedYear)) {
        filter[YEAR_FIELD] = parsedYear;
      }
    }

    const vehicles = await Vehicle.find(filter)
      .populate('registradoPor', 'nombre email')
      .sort({ fechaIngreso: -1 });

    // Si el usuario es visualizador, ocultar informaciÃ³n financiera
    // Los vendedores SÃ pueden ver precio de venta
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
    
    // Si el usuario es vendedor, ocultar solo informaciÃ³n sensible (costos e inversionistas)
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
    res.status(500).json({ message: 'Error al obtener vehÃ­culos', error: error.message });
  }
};

// Obtener vehÃ­culo por ID
export const getVehicleById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userRole = req.user?.rol;

    const vehicle = await Vehicle.findById(id).populate('registradoPor', 'nombre email');

    if (!vehicle) {
      res.status(404).json({ message: 'VehÃ­culo no encontrado' });
      return;
    }

    // Si el usuario es visualizador, ocultar informaciÃ³n financiera
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
    
    // Si el usuario es vendedor, ocultar solo informaciÃ³n sensible (costos e inversionistas)
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
    res.status(500).json({ message: 'Error al obtener vehÃ­culo', error: error.message });
  }
};

// Actualizar vehÃ­culo
export const updateVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      res.status(404).json({ message: 'VehÃ­culo no encontrado' });
      return;
    }

    // Usar save() para disparar hooks de mongoose (recalcula gastos.total e inversionistas)
    vehicle.set(req.body);
    await vehicle.save();
    await vehicle.populate('registradoPor', 'nombre email');

    res.json({
      message: 'VehÃ­culo actualizado exitosamente',
      vehicle,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al actualizar vehÃ­culo', error: error.message });
  }
};

// Eliminar vehÃ­culo
export const deleteVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findByIdAndDelete(id);

    if (!vehicle) {
      res.status(404).json({ message: 'VehÃ­culo no encontrado' });
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

    res.json({ message: 'VehÃ­culo eliminado exitosamente' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al eliminar vehÃ­culo', error: error.message });
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

// Obtener estadÃ­sticas
export const getStatistics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.rol;

    const totalVehiculos = await Vehicle.countDocuments();
    const vehiculosListos = await Vehicle.countDocuments({ estado: 'listo_venta' });
    const vehiculosPendientes = await Vehicle.countDocuments({ estado: 'en_proceso' });
    const vehiculosVendidos = await Vehicle.countDocuments({ estado: 'vendido' });

    // Obtener solo vehÃ­culos que NO estÃ¡n vendidos (inventario actual)
    const vehiculosEnStock = await Vehicle.find({
      estado: { $in: ['en_proceso', 'listo_venta', 'en_negociacion'] },
    });

    // Obtener vehÃ­culos vendidos
    const vehiculosVendidosData = await Vehicle.find({ estado: 'vendido' });

    let valorInventario = 0;
    let totalGastos = 0;
    let gananciasEstimadas = 0;
    let gananciasReales = 0;

    // Si es admin, calcular totales completos
    if (userRole === 'admin') {
      // Valor del inventario = suma de (Precio Compra + Gastos TOTALES) de vehÃ­culos en stock
      valorInventario = vehiculosEnStock.reduce(
        (sum, vehicle) => {
          const precioCompra = vehicle.precioCompra || 0;
          const gastosTotal = calculateVehicleTotalExpenses(vehicle);
          return sum + precioCompra + gastosTotal;
        },
        0
      );

      // Total de gastos solo de vehÃ­culos en stock
      totalGastos = vehiculosEnStock.reduce(
        (sum, vehicle) => sum + calculateVehicleTotalExpenses(vehicle),
        0
      );

      // Ganancias estimadas solo de vehÃ­culos en stock
      // FÃ³rmula: Precio Venta - Precio Compra - Gastos Totales
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

      // Ganancias reales de vehÃ­culos vendidos
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
      // VehÃ­culos en stock donde el usuario es inversionista
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

      // VehÃ­culos vendidos donde el usuario es inversionista
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
    res.status(500).json({ message: 'Error al obtener estadÃ­sticas', error: error.message });
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
    const worksheet = workbook.addWorksheet('Inventario de VehÃ­culos');

    // Definir columnas
    worksheet.columns = [
      { header: 'Placa', key: 'placa', width: 12 },
      { header: 'Marca', key: 'marca', width: 15 },
      { header: 'Modelo', key: 'modelo', width: 15 },
      { header: 'AÃ±o', key: 'aÃ±o', width: 10 },
      { header: 'Color', key: 'color', width: 12 },
      { header: 'VIN', key: 'vin', width: 20 },
      { header: 'Kilometraje', key: 'kilometraje', width: 12 },
      { header: 'Precio Compra', key: 'precioCompra', width: 15 },
      { header: 'Precio Venta', key: 'precioVenta', width: 15 },
      { header: 'Ganancia', key: 'ganancia', width: 15 },
      { header: 'Estado', key: 'estado', width: 15 },
      { header: 'SOAT', key: 'soat', width: 12 },
      { header: 'TecnomecÃ¡nica', key: 'tecnomecanica', width: 15 },
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
        aÃ±o: vehicle.aÃ±o,
        color: vehicle.color,
        vin: vehicle.vin,
        kilometraje: vehicle.kilometraje,
        precioCompra: vehicle.precioCompra,
        precioVenta: vehicle.precioVenta,
        ganancia: vehicle.precioVenta - vehicle.precioCompra,
        estado: vehicle.estado.replace('_', ' ').toUpperCase(),
        soat: vehicle.documentacion.soat.tiene ? 'SÃ­' : 'No',
        tecnomecanica: vehicle.documentacion.tecnomecanica.tiene ? 'SÃ­' : 'No',
        prenda: vehicle.documentacion.prenda.tiene ? 'SÃ­' : 'No',
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
      // Eliminar archivo despuÃ©s de descarga
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
      res.status(404).json({ message: 'VehÃ­culo no encontrado' });
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

// Obtener vehÃ­culos con documentos prÃ³ximos a vencer
export const getVehiclesWithExpiringDocuments = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const diasAlerta = 30; // Alertar 30 dÃ­as antes
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
      message: 'Error al obtener vehÃ­culos con documentos por vencer',
      error: error.message,
    });
  }
};

// Exportar reporte individual de vehÃ­culo a Excel
export const exportVehicleReport = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id).populate('registradoPor', 'nombre email');

    if (!vehicle) {
      res.status(404).json({ message: 'VehÃ­culo no encontrado' });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Detalle del VehÃ­culo');

    // Configurar ancho de columnas
    worksheet.columns = [
      { width: 25 },
      { width: 30 },
    ];

    // TÃ­tulo
    worksheet.mergeCells('A1:B1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'REPORTE DETALLADO DE VEHÃCULO';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(1).height = 30;

    let currentRow = 3;

    // FunciÃ³n helper para agregar secciÃ³n
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

    // FunciÃ³n helper para agregar fila de datos
    const addDataRow = (label: string, value: any) => {
      worksheet.getCell(`A${currentRow}`).value = label;
      worksheet.getCell(`A${currentRow}`).font = { bold: true };
      worksheet.getCell(`B${currentRow}`).value = value;
      currentRow++;
    };

    // InformaciÃ³n BÃ¡sica
    addSection('INFORMACIÃ“N BÃSICA');
    addDataRow('Marca', vehicle.marca);
    addDataRow('Modelo', vehicle.modelo);
    addDataRow('AÃ±o', vehicle.aÃ±o);
    addDataRow('Placa', vehicle.placa);
    addDataRow('Color', vehicle.color);
    addDataRow('Kilometraje', vehicle.kilometraje.toLocaleString('es-CO'));
    currentRow++;

    // InformaciÃ³n Financiera
    addSection('INFORMACIÃ“N FINANCIERA');
    addDataRow('Precio de Compra', `$${vehicle.precioCompra.toLocaleString('es-CO')}`);
    addDataRow('Precio de Venta', `$${vehicle.precioVenta.toLocaleString('es-CO')}`);
    currentRow++;

    // Gastos
    addSection('GASTOS');
    addDataRow('Gastos en Pintura', `$${vehicle.gastos.pintura.toLocaleString('es-CO')}`);
    addDataRow('Gastos en MecÃ¡nica', `$${vehicle.gastos.mecanica.toLocaleString('es-CO')}`);
    addDataRow('Gastos de Traspaso', `$${vehicle.gastos.traspaso.toLocaleString('es-CO')}`);
    addDataRow('Gastos de Alistamiento', `$${vehicle.gastos.alistamiento.toLocaleString('es-CO')}`);
    addDataRow('Gastos de TapicerÃ­a', `$${vehicle.gastos.tapiceria.toLocaleString('es-CO')}`);
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

    // DocumentaciÃ³n
    addSection('DOCUMENTACIÃ“N');
    addDataRow('Prenda', vehicle.documentacion.prenda.tiene ? 'SÃ' : 'NO');
    if (vehicle.documentacion.prenda.tiene && vehicle.documentacion.prenda.detalles) {
      addDataRow('Detalles Prenda', vehicle.documentacion.prenda.detalles);
    }
    addDataRow('SOAT', vehicle.documentacion.soat.tiene ? 'SÃ' : 'NO');
    if (vehicle.documentacion.soat.fechaVencimiento) {
      addDataRow('Vencimiento SOAT', new Date(vehicle.documentacion.soat.fechaVencimiento).toLocaleDateString('es-CO'));
    }
    addDataRow('TecnomecÃ¡nica', vehicle.documentacion.tecnomecanica.tiene ? 'SÃ' : 'NO');
    if (vehicle.documentacion.tecnomecanica.fechaVencimiento) {
      addDataRow('Vencimiento TecnomecÃ¡nica', new Date(vehicle.documentacion.tecnomecanica.fechaVencimiento).toLocaleDateString('es-CO'));
    }
    addDataRow('Tarjeta de Propiedad', vehicle.documentacion.tarjetaPropiedad.tiene ? 'SÃ' : 'NO');
    currentRow++;

    // Inversionistas
    if (vehicle.inversionistas && vehicle.inversionistas.length > 0) {
      addSection('INVERSIONISTAS Y DISTRIBUCIÃ“N DE UTILIDADES');
      
      // Encabezados de la tabla de inversionistas
      worksheet.getCell(`A${currentRow}`).value = 'Nombre';
      worksheet.getCell(`A${currentRow}`).font = { bold: true };
      worksheet.getCell(`A${currentRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE7E6E6' },
      };
      
      worksheet.getCell(`B${currentRow}`).value = 'Monto InversiÃ³n';
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
      worksheet.getCell(`B${currentRow}`).value = 'ParticipaciÃ³n %';
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
      
      // Utilidad neta a distribuir (despuÃ©s de restar gastos de inversionistas)
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
          worksheet.getCell(`B${currentRow}`).alignment = { wrapText: true };
          currentRow++;
        }

        // ParticipaciÃ³n
        worksheet.getCell(`A${currentRow}`).value = '';
        worksheet.getCell(`B${currentRow}`).value = porcentaje;
        worksheet.getCell(`B${currentRow}`).numFmt = '0.00"%"';
        worksheet.getCell(`B${currentRow}`).font = { color: { argb: 'FF0070C0' } };
        currentRow++;

        // Utilidad Neta (sin incluir gastos)
        worksheet.getCell(`A${currentRow}`).value = '';
        worksheet.getCell(`B${currentRow}`).value = utilidadNetaInv;
        worksheet.getCell(`B${currentRow}`).numFmt = '"$"#,##0';
        worksheet.getCell(`B${currentRow}`).font = { bold: true, color: { argb: utilidadNetaInv >= 0 ? 'FF00B050' : 'FFFF0000' } };
        currentRow++;

        // Total a Recibir (Utilidad Neta + Retorno de Gastos)
        worksheet.getCell(`A${currentRow}`).value = '';
        worksheet.getCell(`B${currentRow}`).value = totalARecibir;
        worksheet.getCell(`B${currentRow}`).numFmt = '"$"#,##0';
        worksheet.getCell(`B${currentRow}`).font = { bold: true, size: 11, color: { argb: 'FF7030A0' } };
        currentRow++;

        if (index < vehicle.inversionistas.length - 1) {
          currentRow++; // Espacio entre inversionistas
        }
      });

      currentRow++;

      // Resumen de inversiones
      worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
      const resumenCell = worksheet.getCell(`A${currentRow}`);
      resumenCell.value = 'RESUMEN DE INVERSIONES';
      resumenCell.font = { bold: true, size: 11 };
      resumenCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9D9D9' },
      };
      currentRow++;

      addDataRow('Total Invertido', `$${totalInversion.toLocaleString('es-CO')}`);
      addDataRow('Total Gastos Inversionistas', `$${totalGastosInv.toLocaleString('es-CO')}`);
      addDataRow('NÃºmero de Socios', vehicle.inversionistas.length);
      addDataRow('Utilidad Bruta', `$${utilidadBruta.toLocaleString('es-CO')}`);
      addDataRow('Utilidad Neta a Distribuir', `$${utilidadNeta.toLocaleString('es-CO')}`);
      
      worksheet.getCell(`B${currentRow - 1}`).font = { bold: true, color: { argb: utilidadNeta >= 0 ? 'FF00B050' : 'FFFF0000' } };
      currentRow++;
    }

    // Observaciones
    if (vehicle.observaciones) {
      addSection('OBSERVACIONES');
      worksheet.mergeCells(`A${currentRow}:B${currentRow + 2}`);
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
    res.status(500).json({ message: 'Error al exportar reporte del vehÃ­culo', error: error.message });
  }
};

// Exportar reporte ejecutivo mensual/anual a Excel
export const exportMonthlyReport = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { year, month } = req.query;
    const selectedYear = year ? parseInt(year as string, 10) : new Date().getFullYear();
    const selectedMonthIndex = resolveMonthIndex(month);

    const startDate = selectedMonthIndex !== null
      ? new Date(selectedYear, selectedMonthIndex, 1)
      : new Date(selectedYear, 0, 1);
    const endDate = selectedMonthIndex !== null
      ? new Date(selectedYear, selectedMonthIndex + 1, 0, 23, 59, 59, 999)
      : new Date(selectedYear, 11, 31, 23, 59, 59, 999);

    const vehiculosVendidos = await Vehicle.find({
      estado: 'vendido',
      fechaVenta: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({ fechaVenta: 1 });

    const fixedExpenses = await FixedExpense.find({
      fechaInicio: { $lte: endDate },
      $or: [
        { activo: true },
        { fechaFin: { $gte: startDate } },
      ],
    }).lean();

    const monthlyFixedExpenses = buildFixedExpenseMonthlyMap(fixedExpenses, selectedYear);
    const monthsToInclude = selectedMonthIndex !== null
      ? [selectedMonthIndex]
      : Array.from({ length: 12 }, (_, index) => index);

    const monthlySummary = new Map<number, any>();
    monthsToInclude.forEach((monthIndex) => {
      monthlySummary.set(monthIndex, {
        monthIndex,
        month: MONTH_NAMES[monthIndex],
        soldUnits: 0,
        totalSales: 0,
        totalSalesCost: 0,
        fixedExpenses: monthlyFixedExpenses[monthIndex] || 0,
      });
    });

    vehiculosVendidos.forEach((vehicle) => {
      if (!vehicle.fechaVenta) return;

      const soldDate = new Date(vehicle.fechaVenta);
      const monthIndex = soldDate.getMonth();
      if (!monthlySummary.has(monthIndex)) return;

      const vehicleExpense = calculateVehicleTotalExpenses(vehicle);
      const totalSalesCost = (vehicle.precioCompra || 0) + vehicleExpense;

      const monthData = monthlySummary.get(monthIndex)!;
      monthData.soldUnits += 1;
      monthData.totalSales += vehicle.precioVenta || 0;
      monthData.totalSalesCost += totalSalesCost;
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoTech';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Resumen Ejecutivo');
    summarySheet.mergeCells('A1:H1');
    summarySheet.getCell('A1').value = selectedMonthIndex !== null
      ? `REPORTE EJECUTIVO - ${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}`
      : `REPORTE EJECUTIVO ANUAL - ${selectedYear}`;
    summarySheet.getCell('A1').font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    summarySheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    summarySheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    summarySheet.getRow(1).height = 26;

    summarySheet.columns = [
      { header: 'Mes', key: 'month', width: 14 },
      { header: 'Vehiculos Vendidos', key: 'soldUnits', width: 18 },
      { header: 'Ventas', key: 'totalSales', width: 16 },
      { header: 'Costos de Venta', key: 'totalSalesCost', width: 16 },
      { header: 'Gastos Fijos', key: 'fixedExpenses', width: 14 },
      { header: 'Utilidad Bruta', key: 'grossProfit', width: 16 },
      { header: 'Utilidad Neta', key: 'netProfit', width: 16 },
      { header: 'Margen Neto %', key: 'netMargin', width: 14 },
    ];

    const summaryHeader = summarySheet.getRow(3);
    summaryHeader.values = summarySheet.columns.map((column: any) => column.header);
    summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC2626' },
    };

    let totalSoldUnits = 0;
    let totalSales = 0;
    let totalSalesCost = 0;
    let totalFixed = 0;

    const sortedSummary = Array.from(monthlySummary.values()).sort((a, b) => a.monthIndex - b.monthIndex);
    sortedSummary.forEach((item) => {
      const grossProfit = item.totalSales - item.totalSalesCost;
      const netProfit = grossProfit - item.fixedExpenses;
      const netMargin = item.totalSales > 0 ? netProfit / item.totalSales : 0;

      summarySheet.addRow({
        month: item.month,
        soldUnits: item.soldUnits,
        totalSales: item.totalSales,
        totalSalesCost: item.totalSalesCost,
        fixedExpenses: item.fixedExpenses,
        grossProfit,
        netProfit,
        netMargin,
      });

      totalSoldUnits += item.soldUnits;
      totalSales += item.totalSales;
      totalSalesCost += item.totalSalesCost;
      totalFixed += item.fixedExpenses;
    });

    const summaryTotalRowIndex = summarySheet.lastRow ? summarySheet.lastRow.number + 2 : 5;
    summarySheet.getCell(`A${summaryTotalRowIndex}`).value = 'TOTAL';
    summarySheet.getCell(`A${summaryTotalRowIndex}`).font = { bold: true };
    summarySheet.getCell(`B${summaryTotalRowIndex}`).value = totalSoldUnits;
    summarySheet.getCell(`B${summaryTotalRowIndex}`).font = { bold: true };
    summarySheet.getCell(`C${summaryTotalRowIndex}`).value = totalSales;
    summarySheet.getCell(`D${summaryTotalRowIndex}`).value = totalSalesCost;
    summarySheet.getCell(`E${summaryTotalRowIndex}`).value = totalFixed;
    summarySheet.getCell(`F${summaryTotalRowIndex}`).value = totalSales - totalSalesCost;
    summarySheet.getCell(`G${summaryTotalRowIndex}`).value = totalSales - totalSalesCost - totalFixed;
    summarySheet.getCell(`H${summaryTotalRowIndex}`).value =
      totalSales > 0 ? (totalSales - totalSalesCost - totalFixed) / totalSales : 0;

    ['C', 'D', 'E', 'F', 'G'].forEach((column) => {
      summarySheet.getCell(`${column}${summaryTotalRowIndex}`).font = { bold: true };
    });
    summarySheet.getCell(`H${summaryTotalRowIndex}`).font = { bold: true };

    ['totalSales', 'totalSalesCost', 'fixedExpenses', 'grossProfit', 'netProfit'].forEach((key) => {
      summarySheet.getColumn(key).numFmt = '"$"#,##0';
    });
    summarySheet.getColumn('netMargin').numFmt = '0.00%';
    summarySheet.getCell(`C${summaryTotalRowIndex}`).numFmt = '"$"#,##0';
    summarySheet.getCell(`D${summaryTotalRowIndex}`).numFmt = '"$"#,##0';
    summarySheet.getCell(`E${summaryTotalRowIndex}`).numFmt = '"$"#,##0';
    summarySheet.getCell(`F${summaryTotalRowIndex}`).numFmt = '"$"#,##0';
    summarySheet.getCell(`G${summaryTotalRowIndex}`).numFmt = '"$"#,##0';
    summarySheet.getCell(`H${summaryTotalRowIndex}`).numFmt = '0.00%';

    const detailSheet = workbook.addWorksheet('Detalle Ventas');
    detailSheet.columns = [
      { header: 'Fecha Venta', key: 'saleDate', width: 15 },
      { header: 'Mes', key: 'month', width: 12 },
      { header: 'Placa', key: 'plate', width: 12 },
      { header: 'Marca', key: 'brand', width: 15 },
      { header: 'Modelo', key: 'model', width: 15 },
      { header: 'AÃ±o', key: 'year', width: 10 },
      { header: 'Precio Compra', key: 'purchasePrice', width: 15 },
      { header: 'Gastos Variable', key: 'variableExpense', width: 15 },
      { header: 'Costo Venta', key: 'saleCost', width: 15 },
      { header: 'Precio Venta', key: 'salePrice', width: 15 },
      { header: 'Utilidad Bruta', key: 'grossProfit', width: 15 },
      { header: 'Margen %', key: 'margin', width: 12 },
    ];

    const detailHeader = detailSheet.getRow(1);
    detailHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    detailHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5B9BD5' },
    };

    let detailTotalSales = 0;
    let detailTotalCost = 0;
    let detailTotalGross = 0;

    vehiculosVendidos.forEach((vehicle) => {
      if (!vehicle.fechaVenta) return;

      const saleDate = new Date(vehicle.fechaVenta);
      const monthIndex = saleDate.getMonth();
      if (!monthsToInclude.includes(monthIndex)) return;

      const variableExpense = calculateVehicleTotalExpenses(vehicle);
      const saleCost = (vehicle.precioCompra || 0) + variableExpense;
      const grossProfit = (vehicle.precioVenta || 0) - saleCost;
      const margin = saleCost > 0 ? grossProfit / saleCost : 0;

      detailSheet.addRow({
        saleDate: saleDate.toLocaleDateString('es-CO'),
        month: MONTH_NAMES[monthIndex],
        plate: vehicle.placa,
        brand: vehicle.marca,
        model: vehicle.modelo,
        year: vehicle.aÃ±o,
        purchasePrice: vehicle.precioCompra || 0,
        variableExpense,
        saleCost,
        salePrice: vehicle.precioVenta || 0,
        grossProfit,
        margin,
      });

      detailTotalSales += vehicle.precioVenta || 0;
      detailTotalCost += saleCost;
      detailTotalGross += grossProfit;
    });

    if (detailSheet.rowCount === 1) {
      detailSheet.addRow({
        saleDate: 'Sin ventas registradas para el periodo seleccionado',
      });
    } else {
      const detailTotalRow = detailSheet.lastRow!.number + 2;
      detailSheet.getCell(`A${detailTotalRow}`).value = 'TOTALES';
      detailSheet.getCell(`A${detailTotalRow}`).font = { bold: true };
      detailSheet.getCell(`I${detailTotalRow}`).value = detailTotalCost;
      detailSheet.getCell(`J${detailTotalRow}`).value = detailTotalSales;
      detailSheet.getCell(`K${detailTotalRow}`).value = detailTotalGross;
      detailSheet.getCell(`L${detailTotalRow}`).value = detailTotalCost > 0 ? detailTotalGross / detailTotalCost : 0;
      ['I', 'J', 'K', 'L'].forEach((column) => {
        detailSheet.getCell(`${column}${detailTotalRow}`).font = { bold: true };
      });
      detailSheet.getCell(`I${detailTotalRow}`).numFmt = '"$"#,##0';
      detailSheet.getCell(`J${detailTotalRow}`).numFmt = '"$"#,##0';
      detailSheet.getCell(`K${detailTotalRow}`).numFmt = '"$"#,##0';
      detailSheet.getCell(`L${detailTotalRow}`).numFmt = '0.00%';
    }

    ['purchasePrice', 'variableExpense', 'saleCost', 'salePrice', 'grossProfit'].forEach((key) => {
      detailSheet.getColumn(key).numFmt = '"$"#,##0';
    });
    detailSheet.getColumn('margin').numFmt = '0.00%';

    const monthSuffix = selectedMonthIndex !== null ? `-${MONTH_NAMES[selectedMonthIndex].toLowerCase()}` : '';
    const fileName = `reporte-ejecutivo-${selectedYear}${monthSuffix}-${Date.now()}.xlsx`;
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
      res.status(404).json({ message: 'VehÃ­culo no encontrado' });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Control de Gastos');

    // Configurar ancho de columnas
    worksheet.columns = [
      { width: 40 }, // DescripciÃ³n
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

    // FunciÃ³n para crear secciÃ³n con datos
    const createSection = (title: string, color: string, gastos: any[]) => {
      // TÃ­tulo de secciÃ³n
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

      // Agregar datos reales o filas vacÃ­as
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
    const selectedYear = year ? parseInt(year as string, 10) : new Date().getFullYear();

    // Obtener vehÃ­culos vendidos en el aÃ±o seleccionado
    const startDate = new Date(selectedYear, 0, 1);
    const endDate = new Date(selectedYear, 11, 31, 23, 59, 59);

    const vehiculosVendidos = await Vehicle.find({
      estado: 'vendido',
      fechaVenta: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({ fechaVenta: 1 });

    const fixedExpenses = await FixedExpense.find({
      fechaInicio: { $lte: endDate },
      $or: [
        { activo: true },
        { fechaFin: { $gte: startDate } },
      ],
    }).lean();

    const monthlyFixedExpenses = buildFixedExpenseMonthlyMap(fixedExpenses, selectedYear);
    const reportes = MONTH_NAMES.map((mes, monthIndex) => ({
      mes,
      aÃ±o: selectedYear,
      totalVentas: 0,
      totalCostosVenta: 0,
      totalGastosFijos: monthlyFixedExpenses[monthIndex] || 0,
      totalGastos: monthlyFixedExpenses[monthIndex] || 0,
      utilidadBruta: 0,
      utilidad: 0,
      cantidadVehiculos: 0,
      ticketPromedio: 0,
      margenNeto: 0,
      vehiculos: [] as any[],
    }));

    vehiculosVendidos.forEach((vehiculo) => {
      if (!vehiculo.fechaVenta) return;

      const fecha = new Date(vehiculo.fechaVenta);
      const monthIndex = fecha.getMonth();
      const vehicleExpense = calculateVehicleTotalExpenses(vehiculo);
      const costoVenta = (vehiculo.precioCompra || 0) + vehicleExpense;
      const utilidadBruta = (vehiculo.precioVenta || 0) - costoVenta;
      const report = reportes[monthIndex];

      report.totalVentas += vehiculo.precioVenta || 0;
      report.totalCostosVenta += costoVenta;
      report.utilidadBruta += utilidadBruta;
      report.cantidadVehiculos += 1;
      report.vehiculos.push({
        marca: vehiculo.marca,
        modelo: vehiculo.modelo,
        aÃ±o: vehiculo.aÃ±o,
        placa: vehiculo.placa,
        precioVenta: vehiculo.precioVenta,
        precioCompra: vehiculo.precioCompra,
        gastosTotal: vehicleExpense,
        costoTotal: costoVenta,
        utilidad: utilidadBruta,
        fechaVenta: vehiculo.fechaVenta,
      });
    });

    reportes.forEach((report) => {
      report.totalGastos = report.totalCostosVenta + report.totalGastosFijos;
      report.utilidad = report.totalVentas - report.totalGastos;
      report.ticketPromedio = report.cantidadVehiculos > 0 ? report.totalVentas / report.cantidadVehiculos : 0;
      report.margenNeto = report.totalVentas > 0 ? report.utilidad / report.totalVentas : 0;
    });

    const reportesConActividad = reportes.filter(
      (report) => report.cantidadVehiculos > 0 || report.totalGastosFijos > 0
    );

    res.json(reportesConActividad);
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
      res.status(404).json({ message: 'VehÃ­culo no encontrado' });
      return;
    }

    // Actualizar datos de venta
    vehicle.datosVenta = datosVenta;
    vehicle.estado = 'vendido';
    vehicle.fechaVenta = new Date();

    await vehicle.save();

    res.json({
      message: 'Datos de venta guardados exitosamente',
      vehicle,
    });
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Error al guardar datos de venta', 
      error: error.message 
    });
  }
};

const validateSaleDataForDocuments = (vehicle: any): string | null => {
  if (!vehicle?.datosVenta) {
    return 'El vehiculo no tiene datos de venta registrados.';
  }

  if (!vehicle.datosVenta.comprador?.nombre || !vehicle.datosVenta.comprador?.identificacion) {
    return 'Faltan datos del comprador para generar documentos.';
  }

  if (!vehicle.datosVenta.vendedor?.nombre || !vehicle.datosVenta.vendedor?.identificacion) {
    return 'Faltan datos del vendedor para generar documentos.';
  }

  if (!vehicle.datosVenta.transaccion?.lugarCelebracion) {
    return 'Falta lugar de celebracion en los datos de venta.';
  }

  return null;
};

// Generar contrato de compraventa en PDF
export const generateContract = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      res.status(404).json({ message: 'VehÃ­culo no encontrado' });
      return;
    }

    const validationError = validateSaleDataForDocuments(vehicle);
    if (validationError) {
      res.status(400).json({
        message: `${validationError} Por favor, completa los datos requeridos antes de generar el contrato.`,
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

    // TÃTULO
    doc.fontSize(14).font('Helvetica-Bold')
       .text('CONTRATO DE COMPRAVENTA DE VEHICULO AUTOMOTOR', { align: 'center' });
    doc.moveDown(2);

    // LUGAR Y FECHA DE CELEBRACIÃ“N
    doc.fontSize(11).font('Helvetica-Bold').text('LUGAR Y FECHA DE CELEBRACION DEL CONTRATO:');
    doc.fontSize(10).font('Helvetica')
       .text(`${vehicle.datosVenta.transaccion.lugarCelebracion}, ${fechaCelebracion.getDate()} de ${mesNombre} de ${fechaCelebracion.getFullYear()}`);
    doc.moveDown();

    // VENDEDOR
    doc.fontSize(11).font('Helvetica-Bold').text('VENDEDOR(ES):');
    doc.fontSize(10).font('Helvetica')
       .text(`Nombre e IdentificaciÃ³n: ${vehicle.datosVenta.vendedor.nombre} - ${vehicle.datosVenta.vendedor.identificacion}`)
       .text(`DirecciÃ³n: ${vehicle.datosVenta.vendedor.direccion}`)
       .text(`TelÃ©fono: ${vehicle.datosVenta.vendedor.telefono}`);
    doc.moveDown();

    // COMPRADOR
    doc.fontSize(11).font('Helvetica-Bold').text('COMPRADOR(ES):');
    doc.fontSize(10).font('Helvetica')
       .text(`Nombre e IdentificaciÃ³n: ${vehicle.datosVenta.comprador.nombre} - ${vehicle.datosVenta.comprador.identificacion}`)
       .text(`DirecciÃ³n: ${vehicle.datosVenta.comprador.direccion}`)
       .text(`TelÃ©fono: ${vehicle.datosVenta.comprador.telefono}`)
       .text(`Correo electrÃ³nico: ${vehicle.datosVenta.comprador.email}`);
    doc.moveDown();

    // DOMICILIO CONTRACTUAL
    doc.fontSize(11).font('Helvetica-Bold').text('DOMICILIO CONTRACTUAL:');
    doc.fontSize(10).font('Helvetica')
       .text(vehicle.datosVenta.transaccion.domicilioContractual);
    doc.moveDown();

    // INTRODUCCIÃ“N A LAS CLÃUSULAS
    doc.fontSize(10).font('Helvetica')
       .text('Las partes convienen celebrar el presente contrato de compraventa, que se regirÃ¡ por las anteriores estipulaciones, las normas legales aplicables a la materia y en especial por las siguientes clÃ¡usulas:', { align: 'justify' });
    doc.moveDown();

    // CLÃUSULA PRIMERA
    doc.fontSize(10).font('Helvetica-Bold').text('PRIMERA.-OBJETO DEL CONTRATO: ', { continued: true })
       .font('Helvetica').text('mediante el presente contrato EL VENDEDOR transfiere a tÃ­tulo de venta y EL COMPRADOR adquiere la propiedad del vehÃ­culo automotor que a continuaciÃ³n se identifica:', { align: 'justify' });
    doc.moveDown(0.5);
    
    doc.fontSize(10).font('Helvetica')
       .text(`CLASE: AUTOMÃ“VIL                    MARCA: ${vehicle.marca}                    MODELO: ${vehicle.aÃ±o}`)
       .text(`TIPO DE CARROCERIA: ${vehicle.datosVenta.vehiculoAdicional.tipoCarroceria || 'N/A'}        COLOR: ${vehicle.color}        CAPACIDAD: ${vehicle.datosVenta.vehiculoAdicional.capacidad || 'N/A'}`)
       .text(`CHASIS No.: ${vehicle.vin}`)
       .text(`MOTOR No.: ${vehicle.datosVenta.vehiculoAdicional.numeroMotor || 'N/A'}        LINEA: ${vehicle.datosVenta.vehiculoAdicional.linea || vehicle.modelo}        PUERTAS: ${vehicle.datosVenta.vehiculoAdicional.numeroPuertas || 4}`)
       .text(`SITIO DE MATRICULA: ${vehicle.datosVenta.vehiculoAdicional.sitioMatricula || 'N/A'}        PLACA No.: ${vehicle.placa}        SERVICIO: ${vehicle.datosVenta.vehiculoAdicional.tipoServicio || 'PARTICULAR'}`);
    doc.moveDown();

    // CLÃUSULA SEGUNDA
    doc.fontSize(10).font('Helvetica-Bold').text('SEGUNDA.- PRECIO: ', { continued: true })
       .font('Helvetica').text(`como precio del automotor descrito las partes acuerdan la suma de ${vehicle.datosVenta.transaccion.precioLetras} ($${vehicle.precioVenta.toLocaleString('es-CO')}), suma que deberÃ¡ ser pagada en su totalidad, libre de descuentos por concepto de costos bancarios tales como 4xmil, cambio de plaza, entre otros.`, { align: 'justify' });
    doc.moveDown();

    // CLÃUSULA TERCERA
    doc.fontSize(10).font('Helvetica-Bold').text('TERCERA.- FORMA DE PAGO: ', { continued: true })
       .font('Helvetica').text(`EL COMPRADOR se compromete a pagar el precio a que se refiere la clÃ¡usula anterior de la siguiente forma: ${vehicle.datosVenta.transaccion.formaPago}`, { align: 'justify' });
    doc.moveDown();

    // CLÃUSULA CUARTA
    const vendedorAnterior = vehicle.datosVenta.transaccion.vendedorAnterior || '[NOMBRE DEL VENDEDOR ANTERIOR]';
    const cedulaVendedorAnterior = vehicle.datosVenta.transaccion.cedulaVendedorAnterior || '[CÃ‰DULA]';
    
    doc.fontSize(10).font('Helvetica-Bold').text('CUARTA.- ', { continued: true })
       .font('Helvetica').text(`EL VENDEDOR manifiesta que adquiriÃ³ el vehÃ­culo antes descrito por compra a ${vendedorAnterior} identificado con CC ${cedulaVendedorAnterior}. Y declara que estÃ¡ libre de toda clase de gravÃ¡menes, embargos, multas, comparendos, pactos de reserva de dominio y cualquier otra circunstancia que afecte el libre comercio del bien objeto del presente contrato.`, { align: 'justify' });
    doc.moveDown();

    // CLÃUSULA QUINTA
    doc.fontSize(10).font('Helvetica-Bold').text('QUINTA.- ', { continued: true })
       .font('Helvetica').text('EL COMPRADOR declara que conoce el estado jurÃ­dico y factico en que se encuentra el vehÃ­culo y asÃ­ lo acepta. Y que por tratarse de un vehÃ­culo usado EL VENDEDOR no garantiza el estado de sus partes, condiciones tÃ©cnicas, fÃ­sicos o de funcionamiento, que lo afecten total o parcialmente, o por defectos de fabricaciÃ³n o vicios ocultos, habida cuenta que este fue elegido por EL COMPRADOR, quien a su elecciÃ³n ha realizado o no peritaje y revisiÃ³n de antecedentes, y por lo tanto asume la responsabilidad por su elecciÃ³n, y como consecuencia renuncia a cualquier reclamaciÃ³n futura, exonerando a EL VENDEDOR de toda responsabilidad.', { align: 'justify' });
    doc.moveDown();

    // CLÃUSULA SEXTA
    const diasTraspaso = vehicle.datosVenta.transaccion.diasTraspaso || 30;
    doc.fontSize(10).font('Helvetica-Bold').text('SEXTA.- TRASPASO Y GASTOS: ', { continued: true })
       .font('Helvetica').text(`Las partes se obligan a realizar las gestiones de traspaso ante las autoridades de trÃ¡nsito dentro de los ${diasTraspaso} (${diasTraspaso === 30 ? 'treinta' : diasTraspaso}) dÃ­as posteriores a la firma del presente contrato. El vehÃ­culo se entrega al dÃ­a a la fecha de la firma del presente contrato, y por lo tanto valores tales como, los correspondientes a Impuestos se liquidarÃ¡n proporcionalmente segÃºn le corresponda a cada una de las partes, entre otros. EL COMPRADOR declara que, en caso de requerir de la prestaciÃ³n de los servicios de un asesor de trÃ¡mites ante las autoridades de trÃ¡nsito, asumirÃ¡ la totalidad del valor de los respectivos honorarios.`, { align: 'justify' });
    doc.moveDown();

    // CLÃUSULA SÃ‰PTIMA
    const horaEntrega = vehicle.datosVenta.transaccion.horaEntrega || '[HORA]';
    doc.fontSize(10).font('Helvetica-Bold').text('SEPTIMA.- ENTREGA: ', { continued: true })
       .font('Helvetica').text(`En la fecha ${fechaEntrega.toLocaleDateString('es-CO')} y hora ${horaEntrega} EL VENDEDOR hace entrega real y material del vehÃ­culo objeto del presente contrato a EL COMPRADOR, y Ã©ste declara conocer y aceptar el estado en que se encuentra, y recibirlo a entera satisfacciÃ³n. Por lo tanto, a partir de este momento EL COMPRADOR asume los riesgos mecÃ¡nicos y las responsabilidades jurÃ­dicas relativos al vehÃ­culo.`, { align: 'justify' });
    doc.moveDown();

    // CLÃUSULA OCTAVA
    doc.fontSize(10).font('Helvetica-Bold').text('OCTAVA.- RESERVA DEL DOMINIO: ', { continued: true })
       .font('Helvetica').text('EL VENDEDOR se reserva la propiedad del vehÃ­culo identificado en la clÃ¡usula primera del presente contrato, hasta el momento en que se pague la totalidad del precio estipulado, de conformidad con el Art. 952 del CÃ³digo de Comercio, y por lo tanto, no se encuentra obligado a realizar la entrega fÃ­sica del mismo hasta tanto se realice la cancelaciÃ³n total. Se entiende por cancelaciÃ³n total el que la transferencia o el cheque se haya hecho efectiva/o.', { align: 'justify' });
    doc.moveDown();

    // CLÃUSULA NOVENA
    doc.fontSize(10).font('Helvetica-Bold').text('NOVENA.- CLAUSULA PENAL: ', { continued: true })
       .font('Helvetica').text('Las partes establecen como sanciÃ³n pecuniaria a cargo de quien incumpla una cualquiera de las estipulaciones derivadas de este contrato, la suma correspondiente al diez por ciento (10%) del precio pactado en el presente contrato.', { align: 'justify' });
    doc.moveDown();

    // CLÃUSULAS ADICIONALES
    if (vehicle.datosVenta.transaccion.clausulasAdicionales && vehicle.datosVenta.transaccion.clausulasAdicionales !== 'Ninguna') {
      doc.fontSize(10).font('Helvetica-Bold').text('CLAUSULAS ADICIONALES:');
      doc.fontSize(10).font('Helvetica')
         .text(vehicle.datosVenta.transaccion.clausulasAdicionales, { align: 'justify' });
      doc.moveDown();
    }

    // Verificar si necesitamos nueva pÃ¡gina para firmas
    if (doc.y > 600) {
      doc.addPage();
    }

    // CONSTANCIA Y FIRMAS
    doc.moveDown();
    doc.fontSize(10).font('Helvetica')
       .text(`En constancia de lo anterior, los contratantes suscriben el presente documento en la ciudad de ${vehicle.datosVenta.transaccion.lugarCelebracion}, el dÃ­a ${fechaCelebracion.getDate()} (${fechaCelebracion.getDate()}), del mes de ${mesNombre}, del aÃ±o ${fechaCelebracion.getFullYear()} (${fechaCelebracion.getFullYear()}).`, { align: 'justify' });
    doc.moveDown(3);

    // LÃ­neas de firma
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

// Generar formulario de traspaso en PDF
export const generateTransferForm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      res.status(404).json({ message: 'Vehiculo no encontrado' });
      return;
    }

    const validationError = validateSaleDataForDocuments(vehicle);
    if (validationError) {
      res.status(400).json({
        message: `${validationError} Por favor, completa los datos requeridos antes de generar el formulario de traspaso.`,
      });
      return;
    }

    const saleData = vehicle.datosVenta!;
    const celebrationDate = saleData.transaccion?.fechaCelebracion
      ? new Date(saleData.transaccion.fechaCelebracion)
      : new Date();
    const deliveryDate = saleData.transaccion?.fechaEntrega
      ? new Date(saleData.transaccion.fechaEntrega)
      : new Date();
    const generatedDate = new Date().toLocaleDateString('es-CO');

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 55, right: 55 },
    });

    const fileName = `formulario-traspaso-${vehicle.placa}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    doc.pipe(res);

    doc.fontSize(14).font('Helvetica-Bold').text('FORMULARIO DE TRASPASO DE VEHICULO', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Generado por AutoTech - ${generatedDate}`, { align: 'center' });
    doc.moveDown(1.2);

    doc.fontSize(11).font('Helvetica-Bold').text('1. INFORMACION GENERAL DEL TRASPASO');
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica')
      .text(`Ciudad/Lugar: ${saleData.transaccion?.lugarCelebracion || 'N/A'}`)
      .text(`Fecha de celebracion: ${celebrationDate.toLocaleDateString('es-CO')}`)
      .text(`Fecha de entrega: ${deliveryDate.toLocaleDateString('es-CO')}`)
      .text(`Hora de entrega: ${saleData.transaccion?.horaEntrega || 'N/A'}`)
      .text(`Plazo para traspaso (dias): ${saleData.transaccion?.diasTraspaso || 30}`);
    doc.moveDown(0.9);

    doc.fontSize(11).font('Helvetica-Bold').text('2. DATOS DEL VEHICULO');
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica')
      .text(`Placa: ${vehicle.placa || 'N/A'}`)
      .text(`Marca: ${vehicle.marca || 'N/A'}`)
      .text(`Modelo: ${vehicle.modelo || 'N/A'}`)
      .text(`Ano: ${vehicle.año || 'N/A'}`)
      .text(`VIN/Chasis: ${vehicle.vin || 'N/A'}`)
      .text(`Color: ${vehicle.color || 'N/A'}`)
      .text(`Kilometraje: ${vehicle.kilometraje?.toLocaleString('es-CO') || 'N/A'} km`)
      .text(`No. motor: ${saleData.vehiculoAdicional?.numeroMotor || 'N/A'}`)
      .text(`Linea: ${saleData.vehiculoAdicional?.linea || vehicle.modelo || 'N/A'}`)
      .text(`Tipo de servicio: ${saleData.vehiculoAdicional?.tipoServicio || 'N/A'}`)
      .text(`Sitio matricula: ${saleData.vehiculoAdicional?.sitioMatricula || 'N/A'}`);
    doc.moveDown(0.9);

    doc.fontSize(11).font('Helvetica-Bold').text('3. DATOS DEL VENDEDOR ACTUAL');
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica')
      .text(`Nombre: ${saleData.vendedor?.nombre || 'N/A'}`)
      .text(`Identificacion: ${saleData.vendedor?.identificacion || 'N/A'}`)
      .text(`Direccion: ${saleData.vendedor?.direccion || 'N/A'}`)
      .text(`Telefono: ${saleData.vendedor?.telefono || 'N/A'}`);
    doc.moveDown(0.9);

    doc.fontSize(11).font('Helvetica-Bold').text('4. DATOS DEL COMPRADOR (NUEVO PROPIETARIO)');
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica')
      .text(`Nombre: ${saleData.comprador?.nombre || 'N/A'}`)
      .text(`Identificacion: ${saleData.comprador?.identificacion || 'N/A'}`)
      .text(`Direccion: ${saleData.comprador?.direccion || 'N/A'}`)
      .text(`Telefono: ${saleData.comprador?.telefono || 'N/A'}`)
      .text(`Email: ${saleData.comprador?.email || 'N/A'}`);
    doc.moveDown(0.9);

    doc.fontSize(11).font('Helvetica-Bold').text('5. DATOS ECONOMICOS DE LA TRANSACCION');
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica')
      .text(`Precio pactado: $${vehicle.precioVenta?.toLocaleString('es-CO') || '0'}`)
      .text(`Precio en letras: ${saleData.transaccion?.precioLetras || 'N/A'}`)
      .text(`Forma de pago: ${saleData.transaccion?.formaPago || 'N/A'}`);
    doc.moveDown(0.8);

    const hasPrenda = vehicle.documentacion?.prenda?.tiene ? 'SI' : 'NO';
    const hasSoat = vehicle.documentacion?.soat?.tiene ? 'SI' : 'NO';
    const hasTecno = vehicle.documentacion?.tecnomecanica?.tiene ? 'SI' : 'NO';
    const hasCard = vehicle.documentacion?.tarjetaPropiedad?.tiene ? 'SI' : 'NO';

    doc.fontSize(11).font('Helvetica-Bold').text('6. DOCUMENTACION SOPORTE');
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica')
      .text(`SOAT: ${hasSoat}`)
      .text(`Tecnomecanica: ${hasTecno}`)
      .text(`Tarjeta de propiedad: ${hasCard}`)
      .text(`Vehiculo con prenda: ${hasPrenda}`)
      .text('Adjuntar cedulas, improntas y paz y salvo de comparendos segun corresponda.');
    doc.moveDown(1.4);

    if (doc.y > 610) {
      doc.addPage();
    }

    doc.fontSize(10).font('Helvetica').text(
      'Declaracion: Las partes autorizan el tramite de traspaso y manifiestan que la informacion ' +
      'aqui registrada corresponde a los datos entregados durante la venta del vehiculo.',
      { align: 'justify' }
    );
    doc.moveDown(2.3);

    const signatureWidth = 220;
    const leftX = 55;
    const rightX = doc.page.width - signatureWidth - 55;
    const signY = doc.y;

    doc.fontSize(10).font('Helvetica-Bold').text('FIRMA VENDEDOR', leftX, signY, { width: signatureWidth, align: 'center' });
    doc.moveTo(leftX, signY + 35).lineTo(leftX + signatureWidth, signY + 35).stroke();
    doc.fontSize(9).font('Helvetica').text(
      `C.C. ${saleData.vendedor?.identificacion || 'N/A'}`,
      leftX,
      signY + 40,
      { width: signatureWidth, align: 'center' }
    );

    doc.fontSize(10).font('Helvetica-Bold').text('FIRMA COMPRADOR', rightX, signY, { width: signatureWidth, align: 'center' });
    doc.moveTo(rightX, signY + 35).lineTo(rightX + signatureWidth, signY + 35).stroke();
    doc.fontSize(9).font('Helvetica').text(
      `C.C. ${saleData.comprador?.identificacion || 'N/A'}`,
      rightX,
      signY + 40,
      { width: signatureWidth, align: 'center' }
    );

    doc.end();
  } catch (error: any) {
    console.error('Error al generar formulario de traspaso:', error);
    res.status(500).json({
      message: 'Error al generar formulario de traspaso',
      error: error.message,
    });
  }
};

