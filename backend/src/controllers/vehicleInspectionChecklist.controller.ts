import { Response } from 'express';
import ExcelJS from 'exceljs';
import Vehicle from '../models/Vehicle';
import VehicleInspectionChecklist from '../models/VehicleInspectionChecklist';
import { AuthRequest } from '../types';

type InspectionStatus = 'bien' | 'mal';

interface ChecklistInputRow {
  key?: string;
  label?: string;
  category?: string;
  status?: InspectionStatus;
  observaciones?: string;
  responsable?: string;
  porcentajeEstado?: number | string | null;
  tipoTransmision?: string;
}

interface DamageZoneInputRow {
  key?: string;
  label?: string;
  status?: InspectionStatus;
  observaciones?: string;
  responsable?: string;
}

const normalizeStatus = (value: any): InspectionStatus => (value === 'mal' ? 'mal' : 'bien');
const normalizeTransmissionType = (value: any): '' | 'mecanica' | 'automatica' =>
  value === 'mecanica' || value === 'automatica' ? value : '';

const normalizePercentage = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
};

const sanitizeChecklistItem = (row: ChecklistInputRow) => ({
  key: (row.key || '').toString().trim(),
  label: (row.label || '').toString().trim(),
  category: (row.category || 'General').toString().trim(),
  status: normalizeStatus(row.status),
  observaciones: (row.observaciones || '').toString().trim(),
  responsable: (row.responsable || '').toString().trim(),
  porcentajeEstado: normalizePercentage(row.porcentajeEstado),
  tipoTransmision: normalizeTransmissionType(row.tipoTransmision),
});

const sanitizeDamageZone = (row: DamageZoneInputRow) => ({
  key: (row.key || '').toString().trim(),
  label: (row.label || '').toString().trim(),
  status: normalizeStatus(row.status),
  observaciones: (row.observaciones || '').toString().trim(),
  responsable: (row.responsable || '').toString().trim(),
});

const formatStatus = (status: InspectionStatus): string => (status === 'mal' ? 'MAL' : 'BIEN');
const formatDecision = (status: InspectionStatus): string => (status === 'mal' ? 'SI' : 'NO');
const formatTransmission = (value: string): string => {
  if (value === 'mecanica') return 'Mecanica';
  if (value === 'automatica') return 'Automatica';
  return '';
};
const formatItemExtra = (item: any): string => {
  if (typeof item.porcentajeEstado === 'number') {
    return `${item.porcentajeEstado}%`;
  }
  if (item.tipoTransmision) {
    return formatTransmission(item.tipoTransmision);
  }
  return '';
};

export const getVehicleInspectionChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id).select('_id');

    if (!vehicle) {
      res.status(404).json({ message: 'Vehiculo no encontrado' });
      return;
    }

    const checklist = await VehicleInspectionChecklist.findOne({ vehicle: id }).lean();
    if (!checklist) {
      res.status(404).json({ message: 'Checklist no encontrado para este vehiculo' });
      return;
    }

    res.json(checklist);
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al obtener checklist del vehiculo',
      error: error.message,
    });
  }
};

export const upsertVehicleInspectionChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const vehicle = await Vehicle.findById(id).select('_id');
    if (!vehicle) {
      res.status(404).json({ message: 'Vehiculo no encontrado' });
      return;
    }

    const items = Array.isArray(req.body.items)
      ? req.body.items
          .map((row: ChecklistInputRow) => sanitizeChecklistItem(row))
          .filter((row: any) => row.key && row.label)
      : [];

    const damageZones = Array.isArray(req.body.damageZones)
      ? req.body.damageZones
          .map((row: DamageZoneInputRow) => sanitizeDamageZone(row))
          .filter((row: any) => row.key && row.label)
      : [];

    const payload: any = {
      inspectorName: (req.body.inspectorName || '').toString().trim(),
      inspectionDate: req.body.inspectionDate ? new Date(req.body.inspectionDate) : new Date(),
      items,
      damageZones,
      generalObservations: (req.body.generalObservations || '').toString().trim(),
      updatedBy: userId,
    };

    const checklist = await VehicleInspectionChecklist.findOneAndUpdate(
      { vehicle: id },
      {
        $set: payload,
        $setOnInsert: {
          vehicle: id,
          createdBy: userId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: 'Checklist de inspeccion guardado exitosamente',
      checklist,
    });
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al guardar checklist del vehiculo',
      error: error.message,
    });
  }
};

export const exportVehicleInspectionChecklist = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id).lean();

    if (!vehicle) {
      res.status(404).json({ message: 'Vehiculo no encontrado' });
      return;
    }

    const checklist = await VehicleInspectionChecklist.findOne({ vehicle: id }).lean();
    if (!checklist) {
      res.status(404).json({ message: 'Checklist no encontrado para este vehiculo' });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoTech';
    workbook.created = new Date();

    const resumenSheet = workbook.addWorksheet('Resumen');
    resumenSheet.columns = [
      { header: 'Categoria', key: 'category', width: 20 },
      { header: 'Item', key: 'label', width: 30 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Valor', key: 'value', width: 18 },
      { header: 'Requiere Accion', key: 'needsAction', width: 18 },
      { header: 'Responsable', key: 'responsable', width: 24 },
      { header: 'Observaciones', key: 'observaciones', width: 50 },
    ];

    resumenSheet.mergeCells('A1:G1');
    const titleCell = resumenSheet.getCell('A1');
    titleCell.value = `CHECKLIST DE INGRESO - ${vehicle.marca} ${vehicle.modelo} (${vehicle.placa})`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    resumenSheet.getRow(1).height = 24;

    const inspectionDate = checklist.inspectionDate ? new Date(checklist.inspectionDate) : new Date();
    resumenSheet.getCell('A3').value = 'Fecha inspeccion';
    resumenSheet.getCell('B3').value = inspectionDate.toLocaleDateString('es-CO');
    resumenSheet.getCell('A4').value = 'Inspector';
    resumenSheet.getCell('B4').value = checklist.inspectorName || 'No especificado';
    resumenSheet.getCell('A5').value = 'Observaciones generales';
    resumenSheet.getCell('B5').value = checklist.generalObservations || '';

    const headerRow = resumenSheet.getRow(7);
    headerRow.values = ['Categoria', 'Item', 'Estado', 'Valor', 'Requiere Accion', 'Responsable', 'Observaciones'];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };

    let currentRow = 8;
    (checklist.items || []).forEach((item: any) => {
      const row = resumenSheet.getRow(currentRow);
      row.values = [
        item.category,
        item.label,
        formatStatus(item.status),
        formatItemExtra(item),
        formatDecision(item.status),
        item.responsable || '',
        item.observaciones || '',
      ];
      if (item.status === 'mal') {
        row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        row.getCell(3).font = { color: { argb: 'FFB91C1C' }, bold: true };
      } else {
        row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        row.getCell(3).font = { color: { argb: 'FF166534' }, bold: true };
      }
      currentRow += 1;
    });

    const damageSheet = workbook.addWorksheet('Danos');
    damageSheet.columns = [
      { header: 'Zona', key: 'label', width: 25 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Requiere Reparacion', key: 'needsRepair', width: 22 },
      { header: 'Responsable', key: 'responsable', width: 24 },
      { header: 'Observaciones', key: 'observaciones', width: 50 },
    ];
    damageSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    damageSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } };

    (checklist.damageZones || []).forEach((zone: any) => {
      damageSheet.addRow({
        label: zone.label,
        status: formatStatus(zone.status),
        needsRepair: formatDecision(zone.status),
        responsable: zone.responsable || '',
        observaciones: zone.observaciones || '',
      });
    });

    const actionSheet = workbook.addWorksheet('Plan de accion');
    actionSheet.columns = [
      { header: 'Tipo', key: 'type', width: 18 },
      { header: 'Elemento', key: 'element', width: 35 },
      { header: 'Responsable', key: 'responsable', width: 24 },
      { header: 'Detalle', key: 'details', width: 60 },
    ];
    actionSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    actionSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C2D12' } };

    (checklist.items || [])
      .filter((item: any) => item.status === 'mal')
      .forEach((item: any) => {
        actionSheet.addRow({
          type: 'Mecanico / estetico',
          element: item.label,
          responsable: item.responsable || '',
          details: item.observaciones || 'Revisar y reparar este componente',
        });
      });

    (checklist.damageZones || [])
      .filter((zone: any) => zone.status === 'mal')
      .forEach((zone: any) => {
        actionSheet.addRow({
          type: 'Dano visual',
          element: zone.label,
          responsable: zone.responsable || '',
          details: zone.observaciones || 'Reparar dano en zona de carroceria',
        });
      });

    if (actionSheet.rowCount === 1) {
      actionSheet.addRow({
        type: 'General',
        element: 'Sin pendientes',
        responsable: '',
        details: 'No se registraron reparaciones pendientes',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `checklist-ingreso-${vehicle.placa}-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer as ArrayBuffer));
  } catch (error: any) {
    res.status(500).json({
      message: 'Error al exportar checklist del vehiculo',
      error: error.message,
    });
  }
};
