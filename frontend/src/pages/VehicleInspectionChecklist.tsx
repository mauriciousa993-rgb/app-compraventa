import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Car,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Save,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import Layout from '../components/Layout/Layout';
import Vehicle3DModelViewer, { Vehicle3DModelViewerHandle } from '../components/Vehicle3DModelViewer';
import { vehiclesAPI } from '../services/api';
import { Vehicle, VehicleDamageZone, VehicleInspectionItem } from '../types';

type TemplateChecklistItem = Omit<
  VehicleInspectionItem,
  'status' | 'observaciones' | 'responsable' | 'porcentajeEstado' | 'tipoTransmision'
>;
type TemplateDamageZone = Omit<VehicleDamageZone, 'status' | 'observaciones' | 'responsable'>;

const CHECKLIST_TEMPLATE: TemplateChecklistItem[] = [
  { key: 'frenos', label: 'Frenos', category: 'Mecanica' },
  { key: 'suspension', label: 'Suspension', category: 'Mecanica' },
  { key: 'direccion', label: 'Direccion', category: 'Mecanica' },
  { key: 'aceite_motor', label: 'Aceite de motor', category: 'Mecanica' },
  { key: 'refrigerante', label: 'Refrigerante', category: 'Mecanica' },
  { key: 'bateria', label: 'Bateria', category: 'Electrico' },
  { key: 'luces', label: 'Luces', category: 'Electrico' },
  { key: 'transmision_tipo', label: 'Transmision (mecanica o automatica)', category: 'Mecanica' },
  { key: 'llantas_delanteras', label: 'Estado llantas delanteras (%)', category: 'Seguridad' },
  { key: 'llantas_traseras', label: 'Estado llantas traseras (%)', category: 'Seguridad' },
  { key: 'estado_rines', label: 'Estado de rines', category: 'Seguridad' },
  { key: 'estado_placas', label: 'Estado de placas', category: 'Documentacion' },
  { key: 'tarjeta_propiedad', label: 'Tarjeta de propiedad', category: 'Documentacion' },
  { key: 'segunda_llave', label: 'Segunda llave', category: 'Documentacion' },
  { key: 'kit_carrera', label: 'Kit de carrera', category: 'Seguridad' },
  { key: 'estado_timon', label: 'Estado de timon', category: 'Estetica' },
  { key: 'carroceria', label: 'Carroceria', category: 'Estetica' },
  { key: 'pintura', label: 'Pintura', category: 'Estetica' },
  { key: 'interior', label: 'Interior y tapiceria', category: 'Estetica' },
  { key: 'vidrios', label: 'Vidrios y espejos', category: 'Estetica' },
  { key: 'aire_acondicionado', label: 'Aire acondicionado', category: 'Confort' },
];

const PERCENTAGE_ITEM_KEYS = new Set<string>(['llantas_delanteras', 'llantas_traseras']);
const TRANSMISSION_ITEM_KEYS = new Set<string>(['transmision_tipo']);

const DAMAGE_ZONE_TEMPLATE: TemplateDamageZone[] = [
  { key: 'frente', label: 'Frente' },
  { key: 'capo', label: 'Capo' },
  { key: 'techo', label: 'Techo' },
  { key: 'trasera', label: 'Parte trasera' },
  { key: 'lateral_izq', label: 'Lateral izquierdo' },
  { key: 'lateral_der', label: 'Lateral derecho' },
  { key: 'puerta_izq', label: 'Puertas izquierdas' },
  { key: 'puerta_der', label: 'Puertas derechas' },
];

const createDefaultItems = (): VehicleInspectionItem[] =>
  CHECKLIST_TEMPLATE.map((item) => ({
    ...item,
    status: 'bien',
    observaciones: '',
    responsable: '',
    porcentajeEstado: null,
    tipoTransmision: '',
  }));

const createDefaultDamageZones = (): VehicleDamageZone[] =>
  DAMAGE_ZONE_TEMPLATE.map((zone) => ({ ...zone, status: 'bien', observaciones: '', responsable: '' }));

const mergeItems = (savedItems: any[] | undefined): VehicleInspectionItem[] =>
  CHECKLIST_TEMPLATE.map((template) => {
    const saved = savedItems?.find((row) => row.key === template.key);
    return {
      ...template,
      status: saved?.status === 'mal' ? 'mal' : 'bien',
      observaciones: saved?.observaciones || '',
      responsable: saved?.responsable || '',
      porcentajeEstado:
        typeof saved?.porcentajeEstado === 'number' && !Number.isNaN(saved?.porcentajeEstado)
          ? Math.max(0, Math.min(100, saved.porcentajeEstado))
          : null,
      tipoTransmision: saved?.tipoTransmision === 'mecanica' || saved?.tipoTransmision === 'automatica' ? saved.tipoTransmision : '',
    };
  });

const mergeDamageZones = (savedZones: any[] | undefined): VehicleDamageZone[] =>
  DAMAGE_ZONE_TEMPLATE.map((template) => {
    const saved = savedZones?.find((row) => row.key === template.key);
    return {
      ...template,
      status: saved?.status === 'mal' ? 'mal' : 'bien',
      observaciones: saved?.observaciones || '',
      responsable: saved?.responsable || '',
    };
  });

const VehicleInspectionChecklist: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vehicleFromQuery = searchParams.get('vehicle') || '';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicleFromQuery);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const viewerRef = useRef<Vehicle3DModelViewerHandle | null>(null);

  const [inspectorName, setInspectorName] = useState('');
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [generalObservations, setGeneralObservations] = useState('');
  const [items, setItems] = useState<VehicleInspectionItem[]>(createDefaultItems());
  const [damageZones, setDamageZones] = useState<VehicleDamageZone[]>(createDefaultDamageZones());
  const [selectedZone, setSelectedZone] = useState<string>('');

  useEffect(() => {
    loadVehicles();
  }, []);

  useEffect(() => {
    if (!selectedVehicleId) return;
    loadChecklist(selectedVehicleId);
  }, [selectedVehicleId]);

  const loadVehicles = async () => {
    try {
      const data = await vehiclesAPI.getAll();
      setVehicles(data);
      if (data.length > 0) {
        const preferredVehicleId = vehicleFromQuery || selectedVehicleId;
        const exists = preferredVehicleId ? data.some((vehicle) => vehicle._id === preferredVehicleId) : false;
        setSelectedVehicleId(exists ? (preferredVehicleId as string) : data[0]._id);
      }
    } catch (error) {
      console.error('Error al cargar vehiculos:', error);
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  const resetChecklistForm = () => {
    setInspectorName('');
    setInspectionDate(new Date().toISOString().split('T')[0]);
    setGeneralObservations('');
    setItems(createDefaultItems());
    setDamageZones(createDefaultDamageZones());
    setSelectedZone('');
  };

  const loadChecklist = async (vehicleId: string) => {
    setIsLoadingChecklist(true);
    try {
      const checklist = await vehiclesAPI.getInspectionChecklist(vehicleId);
      setInspectorName(checklist.inspectorName || '');
      setInspectionDate(
        checklist.inspectionDate
          ? new Date(checklist.inspectionDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]
      );
      setGeneralObservations(checklist.generalObservations || '');
      setItems(mergeItems(checklist.items));
      setDamageZones(mergeDamageZones(checklist.damageZones));
    } catch (error: any) {
      if (error?.response?.status === 404) {
        resetChecklistForm();
      } else {
        console.error('Error al cargar checklist:', error);
      }
    } finally {
      setIsLoadingChecklist(false);
    }
  };

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle._id === selectedVehicleId),
    [vehicles, selectedVehicleId]
  );

  const groupedItems = useMemo(() => {
    const groups: Record<string, VehicleInspectionItem[]> = {};
    items.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    });
    return groups;
  }, [items]);

  const failingItems = useMemo(() => items.filter((item) => item.status === 'mal'), [items]);
  const damagedZones = useMemo(() => damageZones.filter((zone) => zone.status === 'mal'), [damageZones]);

  const getItemSpecificValue = (item: VehicleInspectionItem): string => {
    if (PERCENTAGE_ITEM_KEYS.has(item.key) && typeof item.porcentajeEstado === 'number') {
      return `${item.porcentajeEstado}%`;
    }
    if (TRANSMISSION_ITEM_KEYS.has(item.key)) {
      if (item.tipoTransmision === 'mecanica') return 'Mecanica';
      if (item.tipoTransmision === 'automatica') return 'Automatica';
    }
    return '';
  };

  const summaryLines = useMemo(() => {
    const rows: string[] = [];
    rows.push(`Vehiculo: ${selectedVehicle?.marca || ''} ${selectedVehicle?.modelo || ''} (${selectedVehicle?.placa || ''})`);
    rows.push(`Inspector: ${inspectorName || 'No especificado'}`);
    rows.push(`Fecha: ${inspectionDate}`);
    rows.push('');
    rows.push(`Pendientes mecanicos/esteticos: ${failingItems.length}`);
    failingItems.forEach((item) => {
      const extras: string[] = [];
      const value = getItemSpecificValue(item);
      if (value) extras.push(value);
      if (item.responsable.trim()) extras.push(`Responsable: ${item.responsable.trim()}`);
      const meta = extras.length > 0 ? ` (${extras.join(' | ')})` : '';
      const detail = item.observaciones ? ` - ${item.observaciones}` : '';
      rows.push(`- ${item.label}${meta}${detail}`);
    });
    rows.push('');
    rows.push(`Zonas con dano visual: ${damagedZones.length}`);
    damagedZones.forEach((zone) => {
      const owner = zone.responsable.trim() ? ` (Responsable: ${zone.responsable.trim()})` : '';
      const detail = zone.observaciones ? ` - ${zone.observaciones}` : '';
      rows.push(`- ${zone.label}${owner}${detail}`);
    });
    if (generalObservations.trim()) {
      rows.push('');
      rows.push('Observaciones generales:');
      rows.push(generalObservations.trim());
    }
    return rows.join('\n');
  }, [selectedVehicle, inspectorName, inspectionDate, failingItems, damagedZones, generalObservations]);

  const updateItemStatus = (key: string, status: 'bien' | 'mal') => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, status } : item)));
  };

  const updateItemObservation = (key: string, observaciones: string) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, observaciones } : item)));
  };

  const updateItemResponsable = (key: string, responsable: string) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, responsable } : item)));
  };

  const updateItemPercentage = (key: string, value: string) => {
    const trimmed = value.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    const normalized =
      parsed === null || Number.isNaN(parsed) ? null : Math.max(0, Math.min(100, Math.round(parsed)));
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, porcentajeEstado: normalized } : item)));
  };

  const updateItemTransmissionType = (key: string, tipoTransmision: '' | 'mecanica' | 'automatica') => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, tipoTransmision } : item))
    );
  };

  const updateZoneStatus = (key: string, status: 'bien' | 'mal') => {
    setDamageZones((prev) => prev.map((zone) => (zone.key === key ? { ...zone, status } : zone)));
  };

  const updateZoneObservation = (key: string, observaciones: string) => {
    setDamageZones((prev) => prev.map((zone) => (zone.key === key ? { ...zone, observaciones } : zone)));
  };

  const updateZoneResponsable = (key: string, responsable: string) => {
    setDamageZones((prev) => prev.map((zone) => (zone.key === key ? { ...zone, responsable } : zone)));
  };

  const handleSaveChecklist = async () => {
    if (!selectedVehicleId) {
      alert('Selecciona un vehiculo para guardar el checklist');
      return;
    }

    setIsSaving(true);
    try {
      await vehiclesAPI.saveInspectionChecklist(selectedVehicleId, {
        inspectorName,
        inspectionDate,
        items,
        damageZones,
        generalObservations,
      });
      alert('Checklist guardado correctamente');
    } catch (error: any) {
      console.error('Error al guardar checklist:', error);
      alert(error?.response?.data?.message || 'No se pudo guardar el checklist');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (!selectedVehicleId || !selectedVehicle) {
      alert('Selecciona un vehiculo para exportar');
      return;
    }

    if (!viewerRef.current) {
      alert('El visor 3D no esta disponible para capturar imagenes');
      return;
    }

    setIsExportingPdf(true);
    try {
      const captures = await viewerRef.current.captureDamageViews();

      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 14;

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('CHECKLIST DE INGRESO VEHICULAR', pageWidth / 2, y, { align: 'center' });
      y += 8;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Vehiculo: ${selectedVehicle.marca} ${selectedVehicle.modelo} (${selectedVehicle.placa})`,
        14,
        y
      );
      y += 6;
      doc.text(`Inspector: ${inspectorName || 'No especificado'} | Fecha: ${inspectionDate}`, 14, y);
      y += 4;

      const imageWidth = 87;
      const imageHeight = 52;
      const leftX = 14;
      const rightX = 109;
      const firstRowY = y + 4;
      const secondRowY = firstRowY + imageHeight + 12;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Frente', leftX, firstRowY - 2);
      doc.text('Trasera', rightX, firstRowY - 2);
      doc.text('Lado izquierdo', leftX, secondRowY - 2);
      doc.text('Lado derecho', rightX, secondRowY - 2);

      doc.addImage(captures.frente, 'PNG', leftX, firstRowY, imageWidth, imageHeight);
      doc.addImage(captures.trasera, 'PNG', rightX, firstRowY, imageWidth, imageHeight);
      doc.addImage(captures.izquierda, 'PNG', leftX, secondRowY, imageWidth, imageHeight);
      doc.addImage(captures.derecha, 'PNG', rightX, secondRowY, imageWidth, imageHeight);

      y = secondRowY + imageHeight + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Resumen de danos y pendientes', 14, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const summaryText = summaryLines || 'Sin observaciones registradas.';
      const wrappedSummary = doc.splitTextToSize(summaryText, pageWidth - 28);
      doc.text(wrappedSummary, 14, y);

      doc.save(`checklist-${selectedVehicle.placa}-${Date.now()}.pdf`);
    } catch (error: any) {
      console.error('Error al exportar PDF del checklist:', error);
      alert(error?.message || 'No se pudo generar el PDF del checklist');
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (isLoadingVehicles) {
    return (
      <Layout>
        <div className="card text-center py-14">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500 mx-auto mb-4" />
          <p className="text-ink-200">Cargando checklist de inspeccion...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate('/vehicles')}
              className="text-sm text-ink-200 hover:text-white inline-flex items-center gap-2 mb-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a vehiculos
            </button>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-primary-400" />
              Checklist de Ingreso Vehicular
            </h1>
            <p className="text-ink-200 mt-2">
              Evaluacion mecanica y estetica con mapa visual de danos y resumen exportable en PDF.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              onClick={handleExportPdf}
              disabled={isExportingPdf || isLoadingChecklist}
            >
              <FileText className="h-4 w-4" />
              {isExportingPdf ? 'Generando PDF...' : 'Exportar PDF'}
            </button>
            <button
              type="button"
              className="btn-primary flex items-center gap-2"
              onClick={handleSaveChecklist}
              disabled={isSaving || isLoadingChecklist}
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Guardando...' : 'Guardar checklist'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm text-ink-200 mb-1">Vehiculo</label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="input-field"
              >
                {vehicles.map((vehicle) => (
                  <option key={vehicle._id} value={vehicle._id}>
                    {vehicle.placa} - {vehicle.marca} {vehicle.modelo} {vehicle.año}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-ink-200 mb-1">Inspector</label>
              <input
                type="text"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                placeholder="Nombre del inspector"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-ink-200 mb-1">Fecha inspeccion</label>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </div>

        {isLoadingChecklist ? (
          <div className="card text-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-3" />
            <p className="text-ink-200">Cargando datos guardados del checklist...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <div className="card">
                <h2 className="text-xl font-semibold text-white mb-4">Revision por componentes</h2>
                <div className="space-y-5">
                  {Object.entries(groupedItems).map(([category, categoryItems]) => (
                    <div key={category} className="border border-[#30343d] rounded-lg p-4 bg-[#171a20]">
                      <h3 className="text-sm uppercase tracking-wide text-ink-200 mb-3">{category}</h3>
                      <div className="space-y-3">
                        {categoryItems.map((item) => (
                          <div key={item.key} className="rounded-lg border border-[#2f3238] p-3 bg-[#1a1d23]">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                              <p className="text-white font-medium">{item.label}</p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateItemStatus(item.key, 'bien')}
                                  className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                                    item.status === 'bien'
                                      ? 'bg-green-600/20 border-green-500 text-green-300'
                                      : 'bg-transparent border-[#3b404a] text-ink-200 hover:border-green-500/60'
                                  }`}
                                >
                                  Bien
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItemStatus(item.key, 'mal')}
                                  className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                                    item.status === 'mal'
                                      ? 'bg-red-600/20 border-red-500 text-red-300'
                                      : 'bg-transparent border-[#3b404a] text-ink-200 hover:border-red-500/60'
                                  }`}
                                >
                                  Mal
                                </button>
                              </div>
                            </div>
                            <textarea
                              value={item.observaciones}
                              onChange={(e) => updateItemObservation(item.key, e.target.value)}
                              rows={2}
                              className="input-field text-sm"
                              placeholder="Observaciones o trabajo requerido"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                              <input
                                type="text"
                                value={item.responsable}
                                onChange={(e) => updateItemResponsable(item.key, e.target.value)}
                                className="input-field text-sm"
                                placeholder="Responsable de la tarea"
                              />
                              {PERCENTAGE_ITEM_KEYS.has(item.key) && (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={typeof item.porcentajeEstado === 'number' ? item.porcentajeEstado : ''}
                                  onChange={(e) => updateItemPercentage(item.key, e.target.value)}
                                  className="input-field text-sm"
                                  placeholder="Estado (%)"
                                />
                              )}
                              {TRANSMISSION_ITEM_KEYS.has(item.key) && (
                                <select
                                  value={item.tipoTransmision || ''}
                                  onChange={(e) =>
                                    updateItemTransmissionType(
                                      item.key,
                                      e.target.value as '' | 'mecanica' | 'automatica'
                                    )
                                  }
                                  className="input-field text-sm"
                                >
                                  <option value="">Seleccionar tipo</option>
                                  <option value="mecanica">Mecanica</option>
                                  <option value="automatica">Automatica</option>
                                </select>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h2 className="text-xl font-semibold text-white mb-4">Observaciones generales</h2>
                <textarea
                  value={generalObservations}
                  onChange={(e) => setGeneralObservations(e.target.value)}
                  rows={4}
                  className="input-field"
                  placeholder="Resumen general del estado del vehiculo"
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="card">
                <h2 className="text-lg font-semibold text-white mb-3">Mapa visual de danos</h2>
                <p className="text-sm text-ink-200 mb-4">
                  Visual 3D rotable para inspeccionar danos por zona del vehiculo.
                </p>
                <Vehicle3DModelViewer 
                  ref={viewerRef} 
                  damageZones={damageZones}
                  onZoneClick={(zoneKey) => {
                    setSelectedZone(zoneKey);
                    // Enfocar la zona en la lista desplazandose hasta ella
                    const zoneElement = document.getElementById(`zone-${zoneKey}`);
                    if (zoneElement) {
                      zoneElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  selectedZone={selectedZone}
                />

                <div className="mt-4 space-y-3">
                  {damageZones.map((zone) => (
                    <div 
                      key={zone.key} 
                      id={`zone-${zone.key}`}
                      className={`rounded-lg border p-3 bg-[#1a1d23] transition-all ${
                        selectedZone === zone.key 
                          ? 'border-primary-500 ring-1 ring-primary-500/50' 
                          : 'border-[#2f3238]'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                        <p className="text-white font-medium">{zone.label}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateZoneStatus(zone.key, 'bien')}
                            className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                              zone.status === 'bien'
                                ? 'bg-green-600/20 border-green-500 text-green-300'
                                : 'bg-transparent border-[#3b404a] text-ink-200 hover:border-green-500/60'
                            }`}
                          >
                            Bien
                          </button>
                          <button
                            type="button"
                            onClick={() => updateZoneStatus(zone.key, 'mal')}
                            className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                              zone.status === 'mal'
                                ? 'bg-red-600/20 border-red-500 text-red-300'
                                : 'bg-transparent border-[#3b404a] text-ink-200 hover:border-red-500/60'
                            }`}
                          >
                            Mal
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={zone.observaciones}
                        onChange={(e) => updateZoneObservation(zone.key, e.target.value)}
                        rows={2}
                        className="input-field text-sm"
                        placeholder="Detalle de dano en esta zona"
                      />
                      <input
                        type="text"
                        value={zone.responsable}
                        onChange={(e) => updateZoneResponsable(zone.key, e.target.value)}
                        className="input-field text-sm mt-2"
                        placeholder="Responsable de reparacion"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h2 className="text-lg font-semibold text-white mb-3">Previsualizacion del resumen</h2>
                <div className="space-y-3 mb-4">
                  <div className="rounded-lg border border-[#2f3238] bg-[#171a20] p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-ink-200">
                      <AlertTriangle className="h-4 w-4 text-red-300" />
                      Componentes con pendiente
                    </div>
                    <span className="text-xl font-bold text-red-300">{failingItems.length}</span>
                  </div>
                  <div className="rounded-lg border border-[#2f3238] bg-[#171a20] p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-ink-200">
                      <Car className="h-4 w-4 text-orange-300" />
                      Zonas con dano
                    </div>
                    <span className="text-xl font-bold text-orange-300">{damagedZones.length}</span>
                  </div>
                  <div className="rounded-lg border border-[#2f3238] bg-[#171a20] p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-ink-200">
                      <CheckCircle2 className="h-4 w-4 text-green-300" />
                      Componentes en buen estado
                    </div>
                    <span className="text-xl font-bold text-green-300">{items.length - failingItems.length}</span>
                  </div>
                </div>
                <textarea readOnly className="input-field text-sm" rows={14} value={summaryLines} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default VehicleInspectionChecklist;
