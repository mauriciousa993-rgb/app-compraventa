import { Response } from 'express';
import Vehicle from '../models/Vehicle';
import { AuthRequest } from '../types';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';

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

    const vehicle = await Vehicle.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    ).populate('registradoPor', 'nombre email');

    if (!vehicle) {
      res.status(404).json({ message: 'Vehículo no encontrado' });
      return;
    }

    res.json({
      message: 'Vehículo actualizado exitosamente',
      vehicle,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al actualizar vehículo', error: error.message });
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
      const photoPath = path.join(__dirname, '../../uploads', photo);
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    });

    res.json({ message: 'Vehículo eliminado exitosamente' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al eliminar vehículo', error: error.message });
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
      // gastos.total ya incluye gastos detallados + gastos de inversionistas
      valorInventario = vehiculosEnStock.reduce(
        (sum, vehicle) => {
          const precioCompra = vehicle.precioCompra || 0;
          const gastosTotal = vehicle.gastos?.total || 0;
          return sum + precioCompra + gastosTotal;
        },
        0
      );

      // Total de gastos solo de vehículos en stock
      // gastos.total ya incluye todos los gastos (detallados + inversionistas)
      totalGastos = vehiculosEnStock.reduce(
        (sum, vehicle) => sum + (vehicle.gastos?.total || 0),
        0
      );

      // Ganancias estimadas solo de vehículos en stock
      // Fórmula: Precio Venta - Precio Compra - Gastos Totales
      gananciasEstimadas = vehiculosEnStock.reduce(
        (sum, vehicle) => {
          const precioVenta = vehicle.precioVenta || 0;
          const precioCompra = vehicle.precioCompra || 0;
          const gastosTotal = vehicle.gastos?.total || 0;
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
          const gastosTotal = vehicle.gastos?.total || 0;
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
          
          const utilidadTotal = vehicle.precioVenta - vehicle.precioCompra - (vehicle.gastos?.total || 0);
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
    const filePath = path.join(__dirname, '../../uploads', fileName);

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

    const files = req.files as Express.Multer.File[];
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
          worksheet.getCell(`B${currentRow}`).alignment = { wrapText: true };
          currentRow++;
        }

        // Participación
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
      addDataRow('Número de Socios', vehicle.inversionistas.length);
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
    const filePath = path.join(__dirname, '../../uploads', fileName);

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
    const filePath = path.join(__dirname, '../../uploads', fileName);

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
    const filePath = path.join(__dirname, '../../uploads', fileName);

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
