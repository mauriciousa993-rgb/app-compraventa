import { DatosNegociacion, FormaPagoNegociacion, UbicacionVehiculo, Vehicle } from '../types';

export const UBICACIONES_VEHICULO: Array<{ value: UbicacionVehiculo; label: string }> = [
  { value: '', label: 'Sin definir' },
  { value: 'taller_mecanico', label: 'Taller / Mecánica' },
  { value: 'pintura', label: 'Pintura' },
  { value: 'latoneria', label: 'Latonería' },
  { value: 'tapiceria', label: 'Tapicería' },
  { value: 'alistamiento', label: 'Alistamiento / Lavado' },
  { value: 'parqueadero', label: 'Parqueadero' },
  { value: 'tramites', label: 'Trámites / Tránsito' },
  { value: 'vitrina', label: 'Vitrina' },
  { value: 'otro', label: 'Otro' },
];

export const getUbicacionLabel = (ubicacion?: UbicacionVehiculo): string =>
  UBICACIONES_VEHICULO.find((item) => item.value === (ubicacion || ''))?.label || 'Sin definir';

export const FORMAS_PAGO_NEGOCIACION: Array<{ value: FormaPagoNegociacion; label: string }> = [
  { value: '', label: 'Sin definir' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'consignacion', label: 'Consignación' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'credito', label: 'Crédito' },
  { value: 'mixto', label: 'Mixto (crédito + contado)' },
];

export const getFormaPagoLabel = (formaPago?: FormaPagoNegociacion): string =>
  FORMAS_PAGO_NEGOCIACION.find((item) => item.value === (formaPago || ''))?.label || 'Sin definir';

export const createEmptyDatosNegociacion = (): DatosNegociacion => ({
  formaPago: '',
  montoEfectivo: 0,
  montoConsignacion: 0,
  montoTransferencia: 0,
  montoCredito: 0,
  financiera: '',
  cliente: '',
  telefonoCliente: '',
  notas: '',
});

export const normalizeDatosNegociacion = (datos?: DatosNegociacion | null): DatosNegociacion => ({
  ...createEmptyDatosNegociacion(),
  ...(datos || {}),
});

export const getTotalNegociacion = (datos?: DatosNegociacion | null): number => {
  const negociacion = normalizeDatosNegociacion(datos);
  return (
    (negociacion.montoEfectivo || 0) +
    (negociacion.montoConsignacion || 0) +
    (negociacion.montoTransferencia || 0) +
    (negociacion.montoCredito || 0)
  );
};

export const tieneDatosNegociacion = (datos?: DatosNegociacion | null): boolean => {
  const negociacion = normalizeDatosNegociacion(datos);
  return Boolean(negociacion.formaPago) || getTotalNegociacion(negociacion) > 0;
};

const MS_POR_DIA = 1000 * 60 * 60 * 24;

const diffEnDias = (desde: Date, hasta: Date): number => {
  const diff = hasta.getTime() - desde.getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.floor(diff / MS_POR_DIA);
};

/**
 * Días en vitrina. El conteo se congela cuando el vehículo entra en negociación
 * (desde ahí corre el contador de negociación) y cuando se vende.
 */
export const getDiasEnVitrina = (vehicle: Vehicle): number => {
  const inicio = vehicle.fechaListoVenta
    ? new Date(vehicle.fechaListoVenta)
    : new Date(vehicle.fechaIngreso);

  if (vehicle.fechaInicioNegociacion) {
    return diffEnDias(inicio, new Date(vehicle.fechaInicioNegociacion));
  }

  if (vehicle.fechaVenta) {
    return diffEnDias(inicio, new Date(vehicle.fechaVenta));
  }

  return diffEnDias(inicio, new Date());
};

/** Días transcurridos desde que el vehículo pasó a negociación (conteo nuevo). */
export const getDiasEnNegociacion = (vehicle: Vehicle): number => {
  if (!vehicle.fechaInicioNegociacion) return 0;

  const inicio = new Date(vehicle.fechaInicioNegociacion);
  const fin = vehicle.fechaVenta ? new Date(vehicle.fechaVenta) : new Date();
  return diffEnDias(inicio, fin);
};

export const getDiasEnProceso = (vehicle: Vehicle): number =>
  diffEnDias(new Date(vehicle.fechaIngreso), new Date());

export const formatDias = (dias: number, sufijo: string): string =>
  `${dias} día${dias !== 1 ? 's' : ''} ${sufijo}`;
