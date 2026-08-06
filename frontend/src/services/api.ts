import axios from 'axios';
import {
  AuthResponse,
  User,
  Vehicle,
  Statistics,
  DatosVenta,
  DatosSeparacion,
  FixedExpense,
  VehicleInspectionChecklist,
  VehicleInspectionChecklistPayload,
} from '../types';

const asBoolean = (value: unknown) => String(value ?? '').trim().toLowerCase() === 'true';
const toNumber = (value: any, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const toStringValue = (value: any, fallback = '') => (value === null || value === undefined ? fallback : String(value));
const toBoolean = (value: any, fallback = false) => (typeof value === 'boolean' ? value : fallback);
const toDateValue = (value?: any) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : '';
};
const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const DEMO_FRONTEND = asBoolean((import.meta as any).env?.VITE_DEMO_FRONTEND);

const getAPIURL = (): string => {
  const ensureApi = (url: string) => {
    const clean = url.trim().replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  };

  const configured = (import.meta as any).env?.VITE_API_URL;
  if (configured) {
    return ensureApi(configured);
  }

  if (window.location.hostname.includes('vercel.app')) {
    return 'https://app-compraventa.onrender.com/api';
  }

  return `http://${window.location.hostname}:5000/api`;
};

const API_URL = getAPIURL();
const DEMO_STATE_KEY = 'app_compraventa_demo_state_v2';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const DEMO_PHOTO_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
      <rect width="800" height="450" rx="24" fill="#e5eefc"/>
      <rect x="35" y="35" width="730" height="380" rx="24" fill="#ffffff" fill-opacity="0.6"/>
      <text x="400" y="205" text-anchor="middle" font-size="48" fill="#2c3e61" font-family="Arial, sans-serif" font-weight="700">AutoTech</text>
      <text x="400" y="250" text-anchor="middle" font-size="28" fill="#51617e" font-family="Arial, sans-serif">Demo: imagen local</text>
    </svg>`
  );

const createBlob = (label: string, type = 'application/pdf') => new Blob([`Archivo demo AutoTech: ${label}`], { type });
const createExcelBlob = (label: string) => new Blob([`Excel demo AutoTech: ${label}`], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

interface AxiosStyleResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: unknown;
}

type DemoUser = User & { password?: string };

interface DemoState {
  users: DemoUser[];
  vehicles: Vehicle[];
  fixedExpenses: FixedExpense[];
  liquidaciones: LiquidacionComision[];
}

interface DemoError extends Error {
  response?: {
    status: number;
    data: {
      message: string;
      field?: string;
    };
  };
}

type AxiosLike = {
  get: (url: string, config?: any) => Promise<AxiosStyleResponse<unknown>>;
  post: (url: string, data?: any, config?: any) => Promise<AxiosStyleResponse<unknown>>;
  put: (url: string, data?: any, config?: any) => Promise<AxiosStyleResponse<unknown>>;
  delete: (url: string, config?: any) => Promise<AxiosStyleResponse<unknown>>;
  interceptors: {
    request: { use: (a: (v: any) => any, b?: (e: any) => any) => void };
    response: { use: (a: (v: any) => any, b?: (e: any) => any) => void };
  };
};

const ensureVehicle = (vehicle: Vehicle): Vehicle => {
  const gastos = vehicle.gastos || {
    pintura: 0,
    mecanica: 0,
    traspaso: 0,
    alistamiento: 0,
    tapiceria: 0,
    transporte: 0,
    varios: 0,
    total: 0,
  };
  const total =
    gastos.total ||
    gastos.pintura +
      gastos.mecanica +
      gastos.traspaso +
      gastos.alistamiento +
      gastos.tapiceria +
      gastos.transporte +
      gastos.varios;

  return {
    ...vehicle,
    _id: vehicle._id || randomId('veh'),
    gastos: {
      ...gastos,
      total,
    },
    inversionistas: vehicle.inversionistas || [],
    tieneInversionistas: toBoolean(vehicle.tieneInversionistas, false),
    estado: vehicle.estado || 'en_proceso',
    documentacion: {
      prenda: { tiene: false, verificado: false },
      soat: { tiene: false, verificado: false },
      tecnomecanica: { tiene: false, verificado: false },
      tarjetaPropiedad: { tiene: false, verificado: false },
      ...(vehicle.documentacion || {}),
    },
    checklist: {
      revisionMecanica: false,
      limpiezaDetailing: false,
      fotografiasCompletas: false,
      documentosCompletos: false,
      precioEstablecido: false,
      ...(vehicle.checklist || {}),
    },
    fotos: {
      exteriores: [],
      interiores: [],
      detalles: [],
      documentos: [],
      ...(vehicle.fotos || {}),
    },
    observaciones: toStringValue(vehicle.observaciones),
    pendientes: vehicle.pendientes || [],
    fechaIngreso: toDateValue(vehicle.fechaIngreso) || new Date().toISOString(),
    fechaVenta: toDateValue(vehicle.fechaVenta),
    fechaListoVenta: toDateValue(vehicle.fechaListoVenta),
    registradoPor:
      vehicle.registradoPor && vehicle.registradoPor._id
        ? vehicle.registradoPor
        : {
            _id: 'u_admin_demo',
            nombre: 'Admin Demo',
            email: 'admin@autotech.com',
          },
    createdAt: toDateValue(vehicle.createdAt) || new Date().toISOString(),
    updatedAt: toDateValue(vehicle.updatedAt) || new Date().toISOString(),
  };
};

const now = new Date();

const buildVehicleTemplate = (overrides: Partial<Vehicle> = {}): Vehicle => {
  return ensureVehicle({
    _id: overrides._id || randomId('veh'),
    marca: toStringValue(overrides.marca, 'Marca Demo'),
    modelo: toStringValue(overrides.modelo, 'Modelo Demo'),
    tipoVehiculo: overrides.tipoVehiculo || 'sedan',
    año: toNumber(overrides.año, now.getFullYear()),
    placa: toStringValue(overrides.placa, `AUTO${Math.floor(Math.random() * 900 + 100)}`),
    vin: toStringValue(overrides.vin, `VIN-${randomId('vin')}`),
    color: toStringValue(overrides.color, 'Plata'),
    kilometraje: toNumber(overrides.kilometraje),
    precioCompra: toNumber(overrides.precioCompra, 0),
    precioVenta: toNumber(overrides.precioVenta, 0),
    gastos: {
      pintura: toNumber(overrides.gastos?.pintura),
      mecanica: toNumber(overrides.gastos?.mecanica),
      traspaso: toNumber(overrides.gastos?.traspaso),
      alistamiento: toNumber(overrides.gastos?.alistamiento),
      tapiceria: toNumber(overrides.gastos?.tapiceria),
      transporte: toNumber(overrides.gastos?.transporte),
      varios: toNumber(overrides.gastos?.varios),
      total: toNumber((overrides.gastos as any)?.total),
    },
    inversionistas: overrides.inversionistas || [],
    tieneInversionistas: toBoolean(overrides.tieneInversionistas, false),
    estado: overrides.estado || 'en_proceso',
    estadoTramite: overrides.estadoTramite,
    datosTarjetaPropiedad: overrides.datosTarjetaPropiedad,
    documentacion: overrides.documentacion || {
      prenda: { tiene: false, verificado: false },
      soat: { tiene: false, verificado: false },
      tecnomecanica: { tiene: false, verificado: false },
      tarjetaPropiedad: { tiene: false, verificado: false },
    },
    checklist: overrides.checklist || {
      revisionMecanica: false,
      limpiezaDetailing: false,
      fotografiasCompletas: false,
      documentosCompletos: false,
      precioEstablecido: false,
    },
    fotos: overrides.fotos || {
      exteriores: [],
      interiores: [],
      detalles: [],
      documentos: [],
    },
    observaciones: toStringValue(overrides.observaciones),
    pendientes: overrides.pendientes || [],
    fechaIngreso: toDateValue(overrides.fechaIngreso) || new Date().toISOString(),
    fechaVenta: toDateValue(overrides.fechaVenta),
    fechaListoVenta: toDateValue(overrides.fechaListoVenta),
    inspectionChecklist: overrides.inspectionChecklist,
    datosVenta: overrides.datosVenta,
    datosSeparacion: overrides.datosSeparacion,
    registradoPor:
      overrides.registradoPor || {
        _id: 'u_admin_demo',
        nombre: 'Admin Demo',
        email: 'admin@autotech.com',
      },
    createdAt: toDateValue(overrides.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Vehicle);
};

const seedUsers: DemoUser[] = [
  {
    id: 'u_admin_demo',
    nombre: 'Admin Demo',
    email: 'admin@autotech.com',
    password: 'admin123',
    rol: 'admin',
    activo: true,
  },
  {
    id: 'u_vendedor_demo',
    nombre: 'Vendedor Demo',
    email: 'vendedor@autotech.com',
    password: 'vendedor123',
    rol: 'vendedor',
    activo: true,
  },
  {
    id: 'u_visualizador_demo',
    nombre: 'Visor Demo',
    email: 'visor@autotech.com',
    password: 'visor123',
    rol: 'visualizador',
    activo: true,
  },
];

const seedVehicles: Vehicle[] = [
  buildVehicleTemplate({
    _id: 'veh_1',
    marca: 'Mazda',
    modelo: '3',
    tipoVehiculo: 'sedan',
    año: 2022,
    placa: 'ABC123',
    color: 'Gris',
    kilometraje: 37000,
    precioCompra: 64000000,
    precioVenta: 82000000,
    gastos: {
      pintura: 1200000,
      mecanica: 900000,
      traspaso: 300000,
      alistamiento: 450000,
      tapiceria: 250000,
      transporte: 50000,
      varios: 180000,
      total: 0,
    },
    estado: 'en_proceso',
    documentacion: {
      prenda: { tiene: false, verificado: false },
      soat: {
        tiene: true,
        fechaVencimiento: new Date(now.getTime() + 22 * 86400000).toISOString(),
        verificado: true,
      },
      tecnomecanica: {
        tiene: true,
        fechaVencimiento: new Date(now.getTime() + 58 * 86400000).toISOString(),
        verificado: true,
      },
      tarjetaPropiedad: { tiene: true, verificado: true },
    },
    checklist: {
      revisionMecanica: true,
      limpiezaDetailing: true,
      fotografiasCompletas: true,
      documentosCompletos: true,
      precioEstablecido: false,
    },
    fotos: {
      exteriores: ['demo-photo:veh_1:exteriores'],
      interiores: ['demo-photo:veh_1:interiores'],
      detalles: [],
      documentos: ['demo-photo:veh_1:documentos'],
    },
    observaciones: 'Vehículo de prueba en proceso',
    fechaIngreso: new Date(now.getTime() - 22 * 86400000).toISOString(),
  }),
  buildVehicleTemplate({
    _id: 'veh_2',
    marca: 'Chevrolet',
    modelo: 'Tracker',
    tipoVehiculo: 'suv',
    año: 2023,
    placa: 'SDF456',
    color: 'Blanco',
    kilometraje: 15200,
    precioCompra: 86000000,
    precioVenta: 98000000,
    gastos: {
      pintura: 700000,
      mecanica: 1200000,
      traspaso: 420000,
      alistamiento: 500000,
      tapiceria: 0,
      transporte: 0,
      varios: 320000,
      total: 0,
    },
    estado: 'listo_venta',
    documentacion: {
      prenda: { tiene: false, verificado: false },
      soat: {
        tiene: true,
        fechaVencimiento: new Date(now.getTime() + 12 * 86400000).toISOString(),
        verificado: true,
      },
      tecnomecanica: {
        tiene: true,
        fechaVencimiento: new Date(now.getTime() + 20 * 86400000).toISOString(),
        verificado: true,
      },
      tarjetaPropiedad: { tiene: true, verificado: true },
    },
    checklist: {
      revisionMecanica: true,
      limpiezaDetailing: true,
      fotografiasCompletas: true,
      documentosCompletos: true,
      precioEstablecido: true,
    },
    fotos: {
      exteriores: ['demo-photo:veh_2:exteriores'],
      interiores: ['demo-photo:veh_2:interiores'],
      detalles: ['demo-photo:veh_2:detalles'],
      documentos: ['demo-photo:veh_2:documentos'],
    },
    observaciones: 'Listo para marketplace',
    fechaIngreso: new Date(now.getTime() - 35 * 86400000).toISOString(),
    fechaListoVenta: new Date(now.getTime() - 3 * 86400000).toISOString(),
  }),
  buildVehicleTemplate({
    _id: 'veh_3',
    marca: 'Kia',
    modelo: 'Sportage',
    tipoVehiculo: 'suv',
    año: 2021,
    placa: 'QWE789',
    color: 'Negro',
    kilometraje: 54000,
    precioCompra: 74000000,
    precioVenta: 89000000,
    gastos: {
      pintura: 900000,
      mecanica: 1500000,
      traspaso: 450000,
      alistamiento: 320000,
      tapiceria: 0,
      transporte: 150000,
      varios: 90000,
      total: 0,
    },
    estado: 'vendido',
    estadoTramite: 'entrega_cliente',
    datosVenta: {
      vendedor: {
        nombre: 'Vendedor Demo',
        identificacion: 'CC 100200300',
        direccion: 'Calle 10 # 20-30',
        telefono: '3001002000',
      },
      comprador: {
        nombre: 'Cliente Demo',
        identificacion: 'CC 200300400',
        direccion: 'Carrera 40 # 10-20',
        telefono: '3111111111',
        email: 'comprador@demo.com',
      },
      vehiculoAdicional: {
        tipoCarroceria: 'SUV',
        capacidad: '5',
        cilindrada: '2.0L',
        claseVehiculo: 'SUV',
        servicio: 'Particular',
        numeroPuertas: 5,
        numeroMotor: '1KD-9876543',
        numeroChasis: 'JX0X000000000003',
        linea: 'Sportage',
        actaManifiesto: 'AM-00012',
        sitioMatricula: 'RUA',
        tipoServicio: 'Particular',
      },
      transaccion: {
        lugarCelebracion: 'Bogota',
        fechaCelebracion: new Date(now.getTime() - 2 * 86400000).toISOString(),
        precioLetras: '89000000',
        formaPago: 'Transferencia',
        vendedorAnterior: 'Comercial Real',
        cedulaVendedorAnterior: 'CC 123456789',
        diasTraspaso: 3,
        fechaEntrega: new Date(now.getTime() + 5 * 86400000).toISOString(),
        horaEntrega: '13:00',
        domicilioContractual: 'Cra 15 # 40-50',
        clausulasAdicionales: 'Entrega con manuales',
      },
      comision: {
        monto: 1250000,
        porcentaje: 1.5,
        descripcion: 'Comision de venta',
      },
    },
    documentacion: {
      prenda: { tiene: false, verificado: false },
      soat: {
        tiene: true,
        fechaVencimiento: new Date(now.getTime() - 15 * 86400000).toISOString(),
        verificado: true,
      },
      tecnomecanica: {
        tiene: true,
        fechaVencimiento: new Date(now.getTime() + 4 * 86400000).toISOString(),
        verificado: true,
      },
      tarjetaPropiedad: { tiene: true, verificado: true },
    },
    checklist: {
      revisionMecanica: true,
      limpiezaDetailing: true,
      fotografiasCompletas: true,
      documentosCompletos: true,
      precioEstablecido: true,
    },
    fotos: {
      exteriores: ['demo-photo:veh_3:exteriores'],
      interiores: ['demo-photo:veh_3:interiores'],
      detalles: ['demo-photo:veh_3:detalles'],
      documentos: ['demo-photo:veh_3:documentos'],
    },
    observaciones: 'Vehículo vendido',
    fechaIngreso: new Date(now.getTime() - 80 * 86400000).toISOString(),
    fechaListoVenta: new Date(now.getTime() - 70 * 86400000).toISOString(),
    fechaVenta: new Date(now.getTime() - 2 * 86400000).toISOString(),
  }),
];

const seedFixedExpenses: FixedExpense[] = [
  {
    _id: 'fe_1',
    nombre: 'Renta local',
    categoria: 'arriendo',
    monto: 2100000,
    diaPago: 5,
    proveedor: 'Propietario',
    metodoPago: 'transferencia',
    fechaInicio: new Date(now.getTime() - 120 * 86400000).toISOString(),
    observaciones: 'Pago mensual de arriendo',
    activo: true,
    registradoPor: {
      _id: 'u_admin_demo',
      id: 'u_admin_demo',
      nombre: 'Admin Demo',
      email: 'admin@autotech.com',
    },
    createdAt: new Date(now.getTime() - 120 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'fe_2',
    nombre: 'Software',
    categoria: 'software',
    monto: 350000,
    diaPago: 10,
    proveedor: 'SaaS Cloud',
    metodoPago: 'tarjeta',
    fechaInicio: new Date(now.getTime() - 120 * 86400000).toISOString(),
    observaciones: 'Suscripción mensual',
    activo: true,
    registradoPor: {
      _id: 'u_admin_demo',
      id: 'u_admin_demo',
      nombre: 'Admin Demo',
      email: 'admin@autotech.com',
    },
    createdAt: new Date(now.getTime() - 120 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const seedState: DemoState = {
  users: seedUsers,
  vehicles: seedVehicles,
  fixedExpenses: seedFixedExpenses,
  liquidaciones: [],
};

const getDemoState = (): DemoState => {
  const raw = localStorage.getItem(DEMO_STATE_KEY);
  if (!raw) {
    localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(seedState));
    return JSON.parse(JSON.stringify(seedState));
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : seedState.users,
      vehicles: Array.isArray(parsed.vehicles) && parsed.vehicles.length ? parsed.vehicles : seedState.vehicles,
      fixedExpenses: Array.isArray(parsed.fixedExpenses) && parsed.fixedExpenses.length ? parsed.fixedExpenses : seedState.fixedExpenses,
      liquidaciones: Array.isArray(parsed.liquidaciones) ? parsed.liquidaciones : [],
    } as DemoState;
  } catch {
    localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(seedState));
    return JSON.parse(JSON.stringify(seedState));
  }
};

const setDemoState = (state: DemoState) => {
  localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
};

const withTotals = (vehicle: Vehicle) => {
  const v = { ...vehicle };
  v.gastos = {
    ...(v.gastos || {}),
    total:
      toNumber(v.gastos?.total) ||
      toNumber(v.gastos?.pintura) +
        toNumber(v.gastos?.mecanica) +
        toNumber(v.gastos?.traspaso) +
        toNumber(v.gastos?.alistamiento) +
        toNumber(v.gastos?.tapiceria) +
        toNumber(v.gastos?.transporte) +
        toNumber(v.gastos?.varios),
  };
  v.updatedAt = new Date().toISOString();
  return v;
};

const mapSafeUser = (user: DemoUser): User => ({
  id: user.id,
  nombre: user.nombre,
  email: user.email,
  rol: user.rol,
  activo: toBoolean(user.activo, true),
});

const normalizePath = (url: string) => {
  if (url.startsWith('http')) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
  return url.split('?')[0] || '/';
};

const parseParams = (url: string, config: any = {}) => {
  const fromQuery = {} as Record<string, any>;
  const q = url.indexOf('?') >= 0 ? url.substring(url.indexOf('?') + 1) : '';
  new URLSearchParams(q).forEach((value, key) => {
    fromQuery[key] = value;
  });

  const configParams = config && config.params ? config.params : {};
  return {
    ...fromQuery,
    ...configParams,
  };
};

const normalizeSegments = (path: string) => path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

const isPositive = (value: any) => value === true || String(value).toLowerCase() === 'true';

const createResponse = <T,>(data: T): AxiosStyleResponse<T> => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {},
});

const createDemoError = (status: number, message: string, field?: string): DemoError => {
  const err: DemoError = new Error(message) as DemoError;
  err.response = {
    status,
    data: {
      message,
      ...(field ? { field } : {}),
    },
  };
  return err;
};

const parseYear = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const getVehicleById = (state: DemoState, id: string) => state.vehicles.find((vehicle) => vehicle._id === id);
const getCurrentUserFromStorage = (): DemoUser | undefined => {
  const raw = localStorage.getItem('user');
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.id) return undefined;
    return parsed as DemoUser;
  } catch {
    return undefined;
  }
};

const getDemoPhoto = (photoPath?: string) => {
  if (!photoPath) return '';
  if (photoPath.startsWith('http://') || photoPath.startsWith('https://') || photoPath.startsWith('data:')) {
    return photoPath;
  }
  if (DEMO_FRONTEND) return DEMO_PHOTO_URL;
  const file = photoPath.split('?')[0].split('/').pop() || '';
  return `${API_URL}/vehicles/photo/${encodeURIComponent(file)}`;
};

export const getPhotoOrDemoUrl = (photoPath?: string) => getDemoPhoto(photoPath);
export const buildVehiclePhotoUrl = getPhotoOrDemoUrl;

const calcVehicleStats = (state: DemoState): Statistics => {
  const vehicles = state.vehicles;
  const fixedExpenses = state.fixedExpenses;
  const activeExpenses = fixedExpenses.filter((e) => e.activo);

  const totalGastosFijos = activeExpenses.reduce((sum, expense) => sum + toNumber(expense.monto), 0);
  const totalGastosVehiculos = vehicles.reduce((sum, vehicle) => sum + toNumber(vehicle.gastos?.total), 0);
  const totalGastos = totalGastosFijos + totalGastosVehiculos;

  const valoresInventario = vehicles.reduce(
    (sum, vehicle) => sum + toNumber(vehicle.precioCompra) + toNumber(vehicle.gastos?.total),
    0
  );

  const gananciasEstimadas = vehicles
    .filter((vehicle) => vehicle.estado !== 'vendido')
    .reduce(
      (sum, vehicle) => sum + toNumber(vehicle.precioVenta) - toNumber(vehicle.precioCompra) - toNumber(vehicle.gastos?.total),
      0
    );

  const gananciasReales = vehicles
    .filter((vehicle) => vehicle.estado === 'vendido')
    .reduce((sum, vehicle) => sum + toNumber(vehicle.precioVenta) - toNumber(vehicle.precioCompra) - toNumber(vehicle.gastos?.total), 0);

  return {
    totalVehiculos: vehicles.length,
    vehiculosListos: vehicles.filter((vehicle) => vehicle.estado === 'listo_venta').length,
    vehiculosEnNegociacion: vehicles.filter((vehicle) => vehicle.estado === 'en_negociacion').length,
    vehiculosPendientes: vehicles.filter((vehicle) => vehicle.estado === 'en_proceso').length,
    vehiculosVendidos: vehicles.filter((vehicle) => vehicle.estado === 'vendido').length,
    valorInventario: valoresInventario,
    valorInventarioTotal: valoresInventario,
    totalGastos,
    totalGastosSistema: totalGastos,
    gananciasEstimadas,
    gananciasEstimadasTotal: gananciasEstimadas,
    gananciasReales,
    gananciasRealesTotal: gananciasReales,
    vehiculosEnStock: Math.max(0, vehicles.length - vehicles.filter((vehicle) => vehicle.estado === 'vendido').length),
    miInversion: totalGastos,
    misGastos: totalGastos,
    miUtilidadEstimada: gananciasEstimadas * 0.4,
    miUtilidadReal: gananciasReales * 0.4,
    inventarioInversionistasInvitados: 0,
    rentabilidadEsperadaInversionistasInvitados: 0,
    inventarioInversionistasAdmin: 0,
    rentabilidadEsperadaInversionistasAdmin: 0,
  };
};

const getMonthlyReport = (state: DemoState, year: number) => {
  const fixedExpenseSum = state.fixedExpenses.filter((expense) => expense.activo).reduce((sum, expense) => sum + toNumber(expense.monto), 0);

  return MONTH_NAMES.map((name, monthIndex) => {
    const month = monthIndex + 1;
    const vendidos = state.vehicles.filter((vehicle) => {
      if (vehicle.estado !== 'vendido' || !vehicle.fechaVenta) return false;
      const date = new Date(vehicle.fechaVenta);
      return !Number.isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() + 1 === month;
    });

    const totalVentas = vendidos.reduce((sum, vehicle) => sum + toNumber(vehicle.precioVenta), 0);
    const totalCostosVenta = vendidos.reduce((sum, vehicle) => sum + toNumber(vehicle.precioCompra) + toNumber(vehicle.gastos?.total), 0);
    const utilidadBruta = totalVentas - totalCostosVenta;
    const utilidad = utilidadBruta - fixedExpenseSum;

    return {
      mes: name,
      año: year,
      anio: year,
      totalVentas,
      totalCostosVenta,
      totalGastosFijos: fixedExpenseSum,
      totalGastos: totalCostosVenta + fixedExpenseSum,
      utilidadBruta,
      utilidad,
      cantidadVehiculos: vendidos.length,
      ticketPromedio: vendidos.length ? totalVentas / vendidos.length : 0,
      margenNeto: totalVentas > 0 ? Number(((utilidad / totalVentas) * 100).toFixed(2)) : 0,
      vehiculos: vendidos.map((vehicle) => ({
        marca: vehicle.marca,
        modelo: vehicle.modelo,
        año: vehicle.año,
        placa: vehicle.placa,
        precioVenta: vehicle.precioVenta,
        precioCompra: vehicle.precioCompra,
        gastosTotal: toNumber(vehicle.gastos?.total),
        costoTotal: toNumber(vehicle.precioCompra) + toNumber(vehicle.gastos?.total),
        utilidad: toNumber(vehicle.precioVenta) - (toNumber(vehicle.precioCompra) + toNumber(vehicle.gastos?.total)),
        fechaVenta: toDateValue(vehicle.fechaVenta),
      })),
    };
  });
};

const getResumenComisiones = (state: DemoState, year?: number, mes?: number): ResumenComisiones[] => {
  const yearFilter = parseYear(year) || new Date().getFullYear();
  const soldVehicles = state.vehicles.filter((vehicle) => {
    if (!vehicle.fechaVenta || !vehicle.datosVenta) return false;
    const soldDate = new Date(vehicle.fechaVenta);
    return !Number.isNaN(soldDate.getTime()) && soldDate.getFullYear() === yearFilter && (!mes || soldDate.getMonth() + 1 === mes);
  });

  const grouped: Record<string, ResumenComisiones> = soldVehicles.reduce((acc, vehicle) => {
    const vendedor = toStringValue(vehicle.datosVenta?.vendedor?.nombre, 'Sin asignar');
    if (!acc[vendedor]) {
      acc[vendedor] = {
        vendedor,
        totalComisiones: 0,
        cantidadVentas: 0,
        comisionesPagadas: 0,
        comisionesPendientes: 0,
        ventas: [],
        liquidado: true,
      };
    }

    const comision = toNumber(vehicle.datosVenta?.comision?.monto);
    const porcentaje = toNumber(vehicle.datosVenta?.comision?.porcentaje);
    const fechaVenta = toDateValue(vehicle.fechaVenta) ? new Date(vehicle.fechaVenta as string) : new Date();

    const hasLiquidaciones = state.liquidaciones.filter(
      (liq) => liq.vendedor === vendedor && liq.año === fechaVenta.getFullYear() && liq.mes === fechaVenta.getMonth() + 1
    );

    const ventaLiquidada = hasLiquidaciones.some((liquidacion) =>
      liquidacion.Liquidaciones.some((entry) => entry.placa === vehicle.placa && entry.liquidada)
    );

    const liquidacionRef = hasLiquidaciones[0];

    acc[vendedor].totalComisiones += comision;
    acc[vendedor].cantidadVentas += 1;
    if (ventaLiquidada) {
      acc[vendedor].comisionesPagadas += comision;
    } else {
      acc[vendedor].comisionesPendientes += comision;
      acc[vendedor].liquidado = false;
    }

    if (liquidacionRef?._id && !acc[vendedor].liquidacionId) {
      acc[vendedor].liquidacionId = liquidacionRef._id;
    }

    const entry = liquidacionRef?.Liquidaciones.find((item) => item.placa === vehicle.placa);
    const fechaLiquidacion = entry?.fechaLiquidacion ? new Date(entry.fechaLiquidacion as unknown as string) : undefined;

    acc[vendedor].ventas.push({
      placa: vehicle.placa,
      vehiculo: `${vehicle.marca} ${vehicle.modelo}`,
      precioVenta: toNumber(vehicle.precioVenta),
      fechaVenta: fechaVenta,
      comision,
      porcentaje,
      descripcion: toStringValue(vehicle.datosVenta?.comision?.descripcion, 'Comisión de venta'),
      liquidada: !!ventaLiquidada,
      fechaLiquidacion,
    });

    return acc;
  }, {} as Record<string, ResumenComisiones>);

  return Object.values(grouped).map((item) => {
    if (item.comisionesPendientes === 0 && item.comisionesPagadas > 0) {
      item.liquidado = true;
    }
    return item;
  });
};

const realApi = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

realApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

realApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    if (!error.response) {
      console.error('❌ Error de conexión:', error.message);
      console.log('API URL intentada:', API_URL);
    }
    return Promise.reject(error);
  }
);

const mockGet = async (url: string, config: any = {}) => {
  const path = normalizePath(url);
  const segments = normalizeSegments(path);
  const query = parseParams(url, config);
  const state = getDemoState();

  if (segments.length === 2 && segments[0] === 'auth' && segments[1] === 'users') {
    return createResponse(state.users.map(mapSafeUser));
  }

  if (segments.length === 2 && segments[0] === 'auth' && segments[1] === 'profile') {
    const current = getCurrentUserFromStorage() || state.users[0];
    return createResponse(mapSafeUser(current));
  }

  if (segments.length === 2 && segments[0] === 'vehicles' && segments[1] === 'marketplace') {
    return createResponse(
      state.vehicles
        .filter((vehicle) => vehicle.estado === 'listo_venta')
        .map((vehicle) => ({
          _id: vehicle._id,
          marca: vehicle.marca,
          modelo: vehicle.modelo,
          año: vehicle.año,
          placa: vehicle.placa,
          color: vehicle.color,
          kilometraje: toNumber(vehicle.kilometraje),
          precioVenta: toNumber(vehicle.precioVenta),
          fotos: {
            exteriores: vehicle.fotos?.exteriores || [],
            interiores: vehicle.fotos?.interiores || [],
            detalles: vehicle.fotos?.detalles || [],
          },
          observaciones: vehicle.observaciones,
        }))
    );
  }

  if (segments.length === 2 && segments[0] === 'vehicles' && segments[1] === 'statistics') {
    return createResponse(calcVehicleStats(state));
  }

  if (segments.length === 2 && segments[0] === 'vehicles' && segments[1] === 'expiring-documents') {
    const nowDate = new Date();
    return createResponse(
      state.vehicles.filter((vehicle) =>
        ['soat', 'tecnomecanica'].some((key) => {
          const item = vehicle.documentacion?.[key as keyof typeof vehicle.documentacion];
          if (!item || !item.fechaVencimiento) return false;
          const v = new Date(item.fechaVencimiento);
          const remaining = Math.ceil((v.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
          return remaining >= 0 && remaining <= 30;
        })
      )
    );
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[1] === 'consulta') {
    const placa = toStringValue(segments[2]).toUpperCase();
    const vehicle = state.vehicles.find((item) => item.placa.toUpperCase() === placa);
    if (!vehicle) {
      return createResponse({ found: false, message: 'No se encontró el vehículo' });
    }

    if (segments.length === 4 && segments[3] === 'transfer-form-excel') {
      return createResponse(createBlob(`transfer-${vehicle.placa}`));
    }

    if (vehicle.estado !== 'vendido') {
      return createResponse({
        found: false,
        message: 'No se encontró una venta activa para esta placa',
      });
    }

    return createResponse({
      found: true,
      vehiculo: {
        id: vehicle._id,
        marca: vehicle.marca,
        modelo: vehicle.modelo,
        año: vehicle.año,
        placa: vehicle.placa,
        color: vehicle.color,
        fechaVenta: vehicle.fechaVenta || new Date().toISOString(),
        estadoTramite: vehicle.estadoTramite || 'completado',
        comprador: { nombre: vehicle.datosVenta?.comprador?.nombre || 'Cliente Demo' },
      },
    });
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[1] === 'ocr' && segments[2] === 'property-card') {
    return createResponse({
      source: 'demo',
      confidence: 92,
      detectedFields: 8,
      rawText: 'TARJETA DE PROPIEDAD DEMO',
      extracted: {
        placa: 'ABC123',
        marca: 'KIA',
        modelo: 'Sportage',
        año: new Date().getFullYear() - 1,
        color: 'Azul',
        vin: 'VIN-DEMO-001',
        linea: 'Sportage',
      },
    });
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[1] === 'reports' && segments[2] === 'monthly') {
    const year = parseYear(query.year) || new Date().getFullYear();
    return createResponse(getMonthlyReport(state, year));
  }

  if (segments.length === 4 && segments[0] === 'vehicles' && segments[1] === 'reports' && segments[2] === 'monthly' && segments[3] === 'export') {
    const year = parseYear(query.year) || new Date().getFullYear();
    const month = parseYear(query.month);
    const report = getMonthlyReport(state, year).filter((item) => (!month ? true : MONTH_NAMES.indexOf(item.mes) + 1 === month));
    return createResponse(createExcelBlob(`reporte-${year}${month ? `-${month}` : ''}`));
  }

  if (segments.length === 4 && segments[0] === 'vehicles' && segments[1] === 'reports' && segments[2] === 'templates') {
    const template = segments[3];
    const year = parseYear(query.year) || new Date().getFullYear();
    const month = parseYear(query.month);
    const suffix = month ? `-${year}-${month}` : `-${year}`;
    return createResponse(createExcelBlob(`plantilla-${template}${suffix}`));
  }

  if (segments.length === 2 && segments[0] === 'vehicles' && segments[1] === 'export') {
    const estado = toStringValue(query.estado);
    return createResponse(createExcelBlob(`vehiculos${estado ? `-${estado}` : ''}`));
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'contract') {
    const vehicle = getVehicleById(state, segments[1]);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    return createResponse(createBlob(`Contrato ${vehicle.placa}`));
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'transfer-form') {
    const vehicle = getVehicleById(state, segments[1]);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    return createResponse(createBlob(`Traspaso ${vehicle.placa}`));
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'transfer-form-excel') {
    const vehicle = getVehicleById(state, segments[1]);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    return createResponse(createBlob(`Traspaso IA ${vehicle.placa}`));
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'inspection-checklist') {
    const vehicle = getVehicleById(state, segments[1]);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    return createResponse(vehicle.inspectionChecklist || ({} as VehicleInspectionChecklist));
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'inspection-checklist' && segments[1]) {
    const vehicle = getVehicleById(state, segments[1]);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    return createResponse(vehicle.inspectionChecklist || ({} as VehicleInspectionChecklist));
  }

  if (segments.length === 4 && segments[0] === 'vehicles' && segments[2] === 'inspection-checklist' && segments[3] === 'pdf-ai') {
    const vehicle = getVehicleById(state, segments[1]);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    return createResponse(createBlob(`Checklist ${vehicle.placa}`));
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'export') {
    const vehicle = getVehicleById(state, segments[1]);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    return createResponse(createExcelBlob(`vehiculo-${vehicle.placa}`));
  }

  if (segments.length === 2 && segments[0] === 'vehicles') {
    const id = segments[1];
    const vehicle = getVehicleById(state, id);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    return createResponse(withTotals(vehicle));
  }

  if (segments.length === 2 && segments[0] === 'vehicles' && query.estado) {
    const filtered = state.vehicles.filter((vehicle) =>
      !query.estado || String(vehicle.estado) === String(query.estado)
    );
    return createResponse(filtered.map(withTotals));
  }

  if (segments.length === 3 && segments[0] === 'commissions' && segments[1] === 'resumen') {
    const año = parseYear(query.año) || new Date().getFullYear();
    const mes = parseYear(query.mes);
    return createResponse(getResumenComisiones(state, año, mes));
  }

  if (segments.length === 3 && segments[0] === 'commissions' && segments[1] === 'vendedores') {
    const year = parseYear(query.año) || new Date().getFullYear();
    const vendedores = state.liquidaciones
      .filter((liquidacion) => liquidacion.año === year)
      .map((liquidacion) => liquidacion.vendedor);
    return createResponse(Array.from(new Set(vendedores)).sort());
  }

  if (segments.length === 2 && segments[0] === 'fixed-expenses') {
    const includeInactive = isPositive(query.includeInactive);
    const categoria = toStringValue(query.categoria);
    return createResponse(
      state.fixedExpenses.filter((expense) => {
        if (!includeInactive && !expense.activo) return false;
        if (categoria && expense.categoria !== categoria) return false;
        return true;
      })
    );
  }

  if (segments.length === 2 && segments[0] === 'commissions' && segments[1] === 'vendedores') {
    return createResponse(
      Array.from(new Set(state.liquidaciones.map((item) => item.vendedor))).sort()
    );
  }

  if (segments.length === 2 && segments[0] === 'commissions') {
    const year = parseYear(query.año);
    const mes = parseYear(query.mes);
    const vendedor = toStringValue(query.vendedor);
    const list = state.liquidaciones.filter((liquidacion) => {
      if (year && liquidacion.año !== year) return false;
      if (mes && liquidacion.mes !== mes) return false;
      if (vendedor && liquidacion.vendedor !== vendedor) return false;
      return true;
    });
    return createResponse(list);
  }

  if (segments.length === 3 && segments[0] === 'commissions') {
    const liquidation = state.liquidaciones.find((item) => item._id === segments[1]);
    if (!liquidation) return Promise.reject(createDemoError(404, 'Liquidación no encontrada'));
    return createResponse(liquidation);
  }

  return Promise.reject(createDemoError(404, 'Ruta no encontrada'));
};

const mockPost = async (url: string, data: any, config: any = {}) => {
  const path = normalizePath(url);
  const segments = normalizeSegments(path);
  const query = parseParams(url, config);
  const state = getDemoState();

  if (segments.length === 2 && segments[0] === 'auth' && segments[1] === 'login') {
    const email = toStringValue(data?.email).toLowerCase();
    const password = toStringValue(data?.password);
    const user = state.users.find((item) => item.email.toLowerCase() === email);

    if (!user || (user.password && user.password !== password)) {
      return Promise.reject(createDemoError(401, 'Credenciales inválidas'));
    }

    const safe = mapSafeUser(user);
    const token = `demo-token-${safe.id}-${Date.now()}`;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(safe));
    return createResponse<AuthResponse>({ message: 'Login demo', token, user: safe });
  }

  if (segments.length === 2 && segments[0] === 'auth' && segments[1] === 'register') {
    const email = toStringValue(data?.email).toLowerCase();
    const nombre = toStringValue(data?.nombre);
    const password = toStringValue(data?.password);
    const rol = toStringValue(data?.rol, 'visualizador') as User['rol'];

    if (!email || !nombre || !password) {
      return Promise.reject(createDemoError(400, 'Datos incompletos para registro'));
    }

    if (state.users.some((item) => item.email.toLowerCase() === email)) {
      return Promise.reject(createDemoError(409, 'El correo ya está registrado'));
    }

    const nuevo: DemoUser = {
      id: randomId('u'),
      nombre,
      email,
      password,
      rol: rol === 'admin' || rol === 'vendedor' || rol === 'visualizador' || rol === 'inversionista' ? rol : 'visualizador',
      activo: true,
    };
    state.users.push(nuevo);
    setDemoState(state);
    return createResponse({ message: 'Usuario registrado', user: mapSafeUser(nuevo) });
  }

  if (segments.length === 3 && segments[0] === 'auth' && segments[1] === 'users' && segments[2] === 'create') {
    const nombre = toStringValue(data?.nombre, toStringValue(data?.name));
    const email = toStringValue(data?.email).toLowerCase();
    const password = toStringValue(data?.password, randomId('pwd'));
    const rol = toStringValue(data?.rol, 'visualizador') as User['rol'];

    if (state.users.some((item) => item.email.toLowerCase() === email)) {
      return Promise.reject(createDemoError(409, 'Usuario existente'));
    }

    const nuevo: DemoUser = {
      id: randomId('u'),
      nombre: nombre || `Usuario ${state.users.length + 1}`,
      email,
      password,
      rol: rol === 'admin' || rol === 'vendedor' || rol === 'visualizador' || rol === 'inversionista' ? rol : 'visualizador',
      activo: true,
    };
    state.users.push(nuevo);
    setDemoState(state);
    return createResponse<AuthResponse>({ message: 'Usuario creado', token: `demo-token-${nuevo.id}`, user: mapSafeUser(nuevo) });
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[1] === 'ocr' && segments[2] === 'property-card') {
    return mockGet('/vehicles/ocr/property-card');
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'photos') {
    const id = segments[1];
    const vehicle = getVehicleById(state, id);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));

    const tipo = toStringValue(data?.tipo, 'exteriores');
    const entry = `demo-photo:${id}:${tipo}:${Date.now()}`;
    vehicle.fotos = {
      ...vehicle.fotos,
      [tipo]: [...((vehicle.fotos && vehicle.fotos[tipo as keyof typeof vehicle.fotos]) || []), entry],
    } as Vehicle['fotos'];

    const idx = state.vehicles.findIndex((v) => v._id === id);
    if (idx >= 0) {
      state.vehicles[idx] = withTotals(vehicle);
      setDemoState(state);
    }

    return createResponse({ message: 'Fotos cargadas', fileName: entry });
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'sale-data') {
    const id = segments[1];
    const vehicle = getVehicleById(state, id);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    const idx = state.vehicles.findIndex((v) => v._id === id);
    if (idx === -1) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));

    state.vehicles[idx] = withTotals({
      ...vehicle,
      estado: 'vendido',
      datosVenta: data as DatosVenta,
      fechaVenta: toDateValue(data?.fechaVenta) || new Date().toISOString(),
    });
    setDemoState(state);
    return createResponse(state.vehicles[idx]);
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'separation-data') {
    const id = segments[1];
    const vehicle = getVehicleById(state, id);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    const idx = state.vehicles.findIndex((v) => v._id === id);
    if (idx === -1) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));

    state.vehicles[idx] = withTotals({
      ...vehicle,
      estado: vehicle.estado === 'vendido' ? 'vendido' : 'separado',
      datosSeparacion: data as DatosSeparacion,
    });
    setDemoState(state);
    return createResponse(state.vehicles[idx]);
  }

  if (segments.length === 1 && segments[0] === 'vehicles') {
    const newVehicle = withTotals(
      buildVehicleTemplate({
        ...data,
        _id: randomId('veh'),
        fechaIngreso: new Date().toISOString(),
      })
    );
    state.vehicles.push(newVehicle);
    setDemoState(state);
    return createResponse({ message: 'Vehículo creado', vehicle: newVehicle });
  }

  if (segments.length === 2 && segments[0] === 'fixed-expenses') {
    const payload = {
      _id: randomId('fe'),
      nombre: toStringValue(data?.nombre, 'Gasto fijo'),
      categoria: data?.categoria || 'servicios',
      monto: toNumber(data?.monto),
      diaPago: toNumber(data?.diaPago, 1),
      proveedor: toStringValue(data?.proveedor),
      metodoPago: toStringValue(data?.metodoPago, 'transferencia'),
      fechaInicio: toDateValue(data?.fechaInicio) || new Date().toISOString(),
      fechaFin: toDateValue(data?.fechaFin),
      observaciones: toStringValue(data?.observaciones),
      activo: data?.activo !== false,
      registradoPor: getCurrentUserFromStorage() || seedUsers[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as FixedExpense;
    state.fixedExpenses.push(payload);
    setDemoState(state);
    return createResponse(payload);
  }

  if (segments.length === 1 && segments[0] === 'commissions') {
    const payload = {
      _id: randomId('liq'),
      vendedor: toStringValue(data?.vendedor, 'Sin asignar'),
      mes: toNumber(data?.mes, new Date().getMonth() + 1),
      año: toNumber(data?.año, new Date().getFullYear()),
      totalComisiones: Array.isArray(data?.Liquidaciones)
        ? data.Liquidaciones.reduce((sum: number, entry: any) => sum + toNumber(entry?.comision), 0)
        : 0,
      comisionesPendientes: 0,
      comisionesPagadas: 0,
      estado: 'pendiente' as LiquidacionComision['estado'],
      notas: toStringValue(data?.notas),
      Liquidaciones: Array.isArray(data?.Liquidaciones)
        ? data.Liquidaciones.map((entry: any) => ({
            placa: toStringValue(entry?.placa),
            comision: toNumber(entry?.comision),
            liquidada: !!entry?.liquidada,
            fechaVenta: toDateValue(entry?.fechaVenta),
            fechaLiquidacion: entry?.fechaLiquidacion ? toDateValue(entry.fechaLiquidacion) : undefined,
          }))
        : [],
    } as LiquidacionComision;
    payload.comisionesPagadas = payload.Liquidaciones.filter((entry) => entry.liquidada).reduce((sum, entry) => sum + entry.comision, 0);
    payload.comisionesPendientes = payload.totalComisiones - payload.comisionesPagadas;
    payload.estado = payload.comisionesPendientes > 0 ? 'parcial' : 'liquidado';
    state.liquidaciones.push(payload);
    setDemoState(state);
    return createResponse(payload);
  }

  if (segments.length === 2 && segments[0] === 'commissions' && segments[1] === 'liquidar') {
    const liquidacionId = toStringValue(data?.liquidacionId);
    const placa = toStringValue(data?.placa);
    const liquidation = state.liquidaciones.find((item) => item._id === liquidacionId);
    if (!liquidation) return Promise.reject(createDemoError(404, 'Liquidación no encontrada'));

    liquidation.Liquidaciones = liquidation.Liquidaciones.map((entry) =>
      entry.placa === placa
        ? {
            ...entry,
            liquidada: true,
            fechaLiquidacion: (query.fecha ? new Date(query.fecha) : new Date()).toISOString(),
          }
        : entry
    );

    liquidation.comisionesPagadas = liquidation.Liquidaciones.filter((entry) => entry.liquidada).reduce((sum, entry) => sum + toNumber(entry.comision), 0);
    liquidation.comisionesPendientes = liquidation.totalComisiones - liquidation.comisionesPagadas;
    liquidation.estado = liquidation.comisionesPendientes > 0 ? 'parcial' : 'liquidado';
    setDemoState(state);
    return createResponse(liquidation);
  }

  return Promise.reject(createDemoError(404, 'Ruta no encontrada'));
};

const mockPut = async (url: string, data: any, config: any = {}) => {
  const path = normalizePath(url);
  const segments = normalizeSegments(path);
  const query = parseParams(url, config);
  const state = getDemoState();

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'inspection-checklist') {
    const id = segments[1];
    const vehicle = getVehicleById(state, id);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));

    const checklist: VehicleInspectionChecklist = {
      ...(vehicle.inspectionChecklist || {
        vehicle: id,
        inspectorName: '',
        inspectionDate: new Date().toISOString(),
        deliveredByName: '',
        deliveredBySignature: '',
        items: [],
        damageZones: [],
        generalObservations: '',
      }),
      ...(data as VehicleInspectionChecklistPayload),
      vehicle: id,
    };

    const idx = state.vehicles.findIndex((v) => v._id === id);
    state.vehicles[idx] = withTotals({ ...vehicle, inspectionChecklist: checklist, updatedAt: new Date().toISOString() });
    setDemoState(state);
    return createResponse({ message: 'Checklist actualizado', checklist });
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'sale-data') {
    const id = segments[1];
    const vehicle = getVehicleById(state, id);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    const idx = state.vehicles.findIndex((v) => v._id === id);
    state.vehicles[idx] = withTotals({
      ...vehicle,
      estado: 'vendido',
      datosVenta: { ...(vehicle.datosVenta || {}), ...(data || {}) } as DatosVenta,
      fechaVenta: toDateValue(data?.fechaVenta) || vehicle.fechaVenta || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setDemoState(state);
    return createResponse(state.vehicles[idx]);
  }

  if (segments.length === 3 && segments[0] === 'vehicles' && segments[2] === 'separation-data') {
    const id = segments[1];
    const vehicle = getVehicleById(state, id);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    const idx = state.vehicles.findIndex((v) => v._id === id);
    state.vehicles[idx] = withTotals({
      ...vehicle,
      estado: vehicle.estado === 'vendido' ? 'vendido' : 'separado',
      datosSeparacion: { ...(vehicle.datosSeparacion || {}), ...(data || {}) } as DatosSeparacion,
      updatedAt: new Date().toISOString(),
    });
    setDemoState(state);
    return createResponse(state.vehicles[idx]);
  }

  if (segments.length === 2 && segments[0] === 'auth' && segments[1]) {
    const id = segments[1];
    const idx = state.users.findIndex((user) => user.id === id);
    if (idx === -1) return Promise.reject(createDemoError(404, 'Usuario no encontrado'));
    state.users[idx] = {
      ...state.users[idx],
      ...(data || {}),
      id,
    };
    setDemoState(state);
    return createResponse(mapSafeUser(state.users[idx]));
  }

  if (segments.length === 3 && segments[0] === 'fixed-expenses' && segments[2] === '') {
    const id = segments[1];
    const idx = state.fixedExpenses.findIndex((item) => item._id === id);
    if (idx === -1) return Promise.reject(createDemoError(404, 'Gasto no encontrado'));
    state.fixedExpenses[idx] = {
      ...state.fixedExpenses[idx],
      ...(data || {}),
      _id: id,
      updatedAt: new Date().toISOString(),
    } as FixedExpense;
    setDemoState(state);
    return createResponse(state.fixedExpenses[idx]);
  }

  if (segments.length === 2 && segments[0] === 'fixed-expenses') {
    const id = segments[1];
    const idx = state.fixedExpenses.findIndex((item) => item._id === id);
    if (idx === -1) return Promise.reject(createDemoError(404, 'Gasto no encontrado'));
    state.fixedExpenses[idx] = {
      ...state.fixedExpenses[idx],
      ...(data || {}),
      _id: id,
      updatedAt: new Date().toISOString(),
    } as FixedExpense;
    setDemoState(state);
    return createResponse(state.fixedExpenses[idx]);
  }

  if (segments.length === 2 && segments[0] === 'vehicles') {
    const id = segments[1];
    const vehicle = getVehicleById(state, id);
    if (!vehicle) return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    const gastos = {
      ...(vehicle.gastos || {}),
      ...(data?.gastos || {}),
    };
    const idx = state.vehicles.findIndex((v) => v._id === id);
    state.vehicles[idx] = withTotals({ ...vehicle, ...data, gastos, _id: id, updatedAt: new Date().toISOString() });
    setDemoState(state);
    return createResponse({ message: 'Vehículo actualizado', vehicle: state.vehicles[idx] });
  }

  return Promise.reject(createDemoError(404, 'Ruta no encontrada'));
};

const mockDelete = async (url: string) => {
  const path = normalizePath(url);
  const segments = normalizeSegments(path);
  const state = getDemoState();

  if (segments.length === 2 && segments[0] === 'vehicles') {
    const id = segments[1];
    const before = state.vehicles.length;
    state.vehicles = state.vehicles.filter((vehicle) => vehicle._id !== id);
    if (state.vehicles.length === before) {
      return Promise.reject(createDemoError(404, 'Vehículo no encontrado'));
    }
    setDemoState(state);
    return createResponse({ message: 'Vehículo eliminado' });
  }

  if (segments.length === 2 && segments[0] === 'auth') {
    const id = segments[1];
    const before = state.users.length;
    state.users = state.users.filter((user) => user.id !== id);
    if (state.users.length === before) return Promise.reject(createDemoError(404, 'Usuario no encontrado'));
    setDemoState(state);
    return createResponse({ message: 'Usuario eliminado' });
  }

  if (segments.length === 2 && segments[0] === 'fixed-expenses') {
    const id = segments[1];
    const idx = state.fixedExpenses.findIndex((item) => item._id === id);
    if (idx === -1) return Promise.reject(createDemoError(404, 'Gasto no encontrado'));
    state.fixedExpenses[idx] = {
      ...state.fixedExpenses[idx],
      activo: false,
      updatedAt: new Date().toISOString(),
    };
    setDemoState(state);
    return createResponse({ message: 'Gasto archivado' });
  }

  return Promise.reject(createDemoError(404, 'Ruta no encontrada'));
};

const api: AxiosLike = (DEMO_FRONTEND
  ? {
      get: (url, config) => mockGet(url, config) as Promise<AxiosStyleResponse<unknown>>,
      post: (url, data, config) => mockPost(url, data, config) as Promise<AxiosStyleResponse<unknown>>,
      put: (url, data, config) => mockPut(url, data, config) as Promise<AxiosStyleResponse<unknown>>,
      delete: (url) => mockDelete(url) as Promise<AxiosStyleResponse<unknown>>,
      interceptors: {
        request: { use: () => undefined },
        response: { use: () => undefined },
      },
    }
  : realApi) as unknown as AxiosLike;

export interface VisionPropertyCardOcrResponse {
  source?: string;
  confidence: number;
  detectedFields: number;
  rawText: string;
  extracted: Record<string, unknown>;
}

export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post<AuthResponse>('/auth/login', { email, password });
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get<User>('/auth/profile');
    return response.data;
  },

  getAllUsers: async () => {
    const response = await api.get<User[]>('/auth/users');
    return response.data;
  },

  createUser: async (data: { nombre: string; email: string; password: string; rol: string }) => {
    const response = await api.post('/auth/users/create', data);
    return response.data;
  },

  updateUser: async (id: string, data: Partial<User>) => {
    const response = await api.put(`/auth/users/${id}`, data);
    return response.data;
  },

  deleteUser: async (id: string) => {
    const response = await api.delete(`/auth/users/${id}`);
    return response.data;
  },
};

export const vehiclesAPI = {
  getAll: async (filters?: { estado?: string; marca?: string; modelo?: string; año?: number }) => {
    const response = await api.get<Vehicle[]>('/vehicles', { params: filters });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<Vehicle>(`/vehicles/${id}`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post<{ message: string; vehicle: Vehicle }>('/vehicles', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put<{ message: string; vehicle: Vehicle }>(`/vehicles/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/vehicles/${id}`);
    return response.data;
  },

  getStatistics: async () => {
    const response = await api.get<Statistics>('/vehicles/statistics');
    return response.data;
  },

  exportToExcel: async (estado?: string) => {
    const response = await api.get('/vehicles/export', {
      params: { estado },
      responseType: 'blob',
    });
    const blob = response.data instanceof Blob ? response.data : createExcelBlob('vehiculos');
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventario-vehiculos-${Date.now()}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  uploadPhotos: async (id: string, tipo: string, files: File[]) => {
    const formData = new FormData();
    formData.append('tipo', tipo);
    files.forEach((file) => {
      formData.append('fotos', file);
    });
    const response = await api.post(`/vehicles/${id}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  readPropertyCardWithVisionAI: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<VisionPropertyCardOcrResponse>('/vehicles/ocr/property-card', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getExpiringDocuments: async () => {
    const response = await api.get<Vehicle[]>('/vehicles/expiring-documents');
    return response.data;
  },

  getVehiclesWithExpiringDocuments: async () => {
    const response = await api.get<Vehicle[]>('/vehicles/expiring-documents');
    return response.data;
  },

  // URLs para conectar los vencimientos de SOAT/Tecnomecanica con Google Calendar
  getCalendarSubscription: async () => {
    const response = await api.get<{
      feedUrl: string;
      webcalUrl: string;
      googleCalendarUrl: string;
      diasAvisoPrevio: number[];
    }>('/vehicles/calendar-subscription');
    return response.data;
  },

  saveSaleData: async (id: string, data: DatosVenta) => {
    const response = await api.post(`/vehicles/${id}/sale-data`, data);
    return response.data;
  },

  saveSeparationData: async (id: string, data: DatosSeparacion) => {
    const response = await api.post(`/vehicles/${id}/separation-data`, data);
    return response.data;
  },

  updateSeparationData: async (id: string, data: DatosSeparacion) => {
    const response = await api.put(`/vehicles/${id}/separation-data`, data);
    return response.data;
  },

  updateSaleData: async (id: string, data: DatosVenta) => {
    const response = await api.put(`/vehicles/${id}/sale-data`, data);
    return response.data;
  },

  generateContract: async (id: string) => {
    const response = await api.get(`/vehicles/${id}/contract`, { responseType: 'blob' });
    const blob = response.data instanceof Blob ? response.data : createBlob(`Contrato ${id}`);
    const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `contrato-${id}-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  generateTransferForm: async (id: string) => {
    const response = await api.get(`/vehicles/${id}/transfer-form`, { responseType: 'blob' });
    const blob = response.data instanceof Blob ? response.data : createBlob(`Traspaso ${id}`);
    const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `formulario-traspaso-${id}-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  generateTransferFormExcelAI: async (id: string) => {
    const response = await api.get(`/vehicles/${id}/transfer-form-excel`, { responseType: 'blob' });
    const blob = response.data instanceof Blob ? response.data : createBlob(`Traspaso IA ${id}`);
    const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `formulario-traspaso-${id}-ia-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  generateTransferFormExcelAIByPlate: async (placa: string) => {
    const normalizedPlate = placa.trim().toUpperCase();
    const response = await api.get(`/vehicles/consulta/${encodeURIComponent(normalizedPlate)}/transfer-form-excel`, {
      responseType: 'blob',
    });
    const blob = response.data instanceof Blob ? response.data : createBlob(`Traspaso IA ${normalizedPlate}`);
    const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `formulario-traspaso-${normalizedPlate}-ia-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  getInspectionChecklist: async (id: string) => {
    const response = await api.get<VehicleInspectionChecklist>(`/vehicles/${id}/inspection-checklist`);
    return response.data;
  },

  generateInspectionChecklistPdfAI: async (id: string) => {
    const response = await api.get(`/vehicles/${id}/inspection-checklist/pdf-ai`, { responseType: 'blob' });
    const blob = response.data instanceof Blob ? response.data : createBlob(`Checklist ${id}`);
    const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `checklist-inspeccion-${id}-ia-${Date.now()}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  saveInspectionChecklist: async (id: string, data: VehicleInspectionChecklistPayload) => {
    const response = await api.put<{ message: string; checklist: VehicleInspectionChecklist }>(
      `/vehicles/${id}/inspection-checklist`,
      data
    );
    return response.data;
  },
};

export const fixedExpensesAPI = {
  getAll: async (params?: { includeInactive?: boolean; categoria?: string }) => {
    const response = await api.get<FixedExpense[]>('/fixed-expenses', { params });
    return response.data;
  },

  create: async (data: Partial<FixedExpense>) => {
    const response = await api.post('/fixed-expenses', data);
    return response.data;
  },

  update: async (id: string, data: Partial<FixedExpense>) => {
    const response = await api.put(`/fixed-expenses/${id}`, data);
    return response.data;
  },

  archive: async (id: string) => {
    const response = await api.delete(`/fixed-expenses/${id}`);
    return response.data;
  },
};

export interface VentaComision {
  placa: string;
  vehiculo: string;
  precioVenta: number;
  fechaVenta: Date;
  comision: number;
  porcentaje: number;
  descripcion: string;
  liquidada: boolean;
  fechaLiquidacion?: Date;
}

export interface ResumenComisiones {
  vendedor: string;
  totalComisiones: number;
  cantidadVentas: number;
  comisionesPagadas: number;
  comisionesPendientes: number;
  ventas: VentaComision[];
  liquidado: boolean;
  liquidacionId?: string;
}

export interface LiquidacionComision {
  _id: string;
  vendedor: string;
  mes: number;
  año: number;
  totalComisiones: number;
  comisionesPendientes: number;
  comisionesPagadas: number;
  estado: 'pendiente' | 'parcial' | 'liquidado';
  notas: string;
  Liquidaciones: {
    placa: string;
    comision: number;
    liquidada: boolean;
    fechaVenta?: Date;
    fechaLiquidacion?: Date;
  }[];
}

export const commissionsAPI = {
  getResumen: async (año?: number, mes?: number) => {
    const response = await api.get<ResumenComisiones[]>('/commissions/resumen', {
      params: { año, mes },
    });
    return response.data;
  },

  getVendedores: async (año?: number) => {
    const response = await api.get<string[]>('/commissions/vendedores', { params: { año } });
    return response.data;
  },

  getAll: async (params?: { año?: number; mes?: number; vendedor?: string }) => {
    const response = await api.get<LiquidacionComision[]>('/commissions', { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<LiquidacionComision>(`/commissions/${id}`);
    return response.data;
  },

  create: async (data: {
    vendedor: string;
    mes: number;
    año: number;
    Liquidaciones: { placa: string; comision: number; fechaVenta?: Date; liquidada: boolean }[];
    notas?: string;
  }) => {
    const response = await api.post<LiquidacionComision>('/commissions', data);
    return response.data;
  },

  liquidar: async (liquidacionId: string, placa: string) => {
    const response = await api.post<LiquidacionComision>('/commissions/liquidar', {
      liquidacionId,
      placa,
    });
    return response.data;
  },
};

export default api as unknown as typeof realApi;
