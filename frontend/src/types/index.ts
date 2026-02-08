export interface User {
  id: string;
  nombre: string;
  email: string;
  rol: 'admin' | 'vendedor' | 'visualizador';
  activo: boolean;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface Inversionista {
  usuario: string; // ID del usuario inversionista
  nombre: string;
  montoInversion: number;
  gastosInversionista: number;
  detallesGastos: string;
  porcentajeParticipacion: number;
  utilidadCorrespondiente: number;
}

export interface GastoDetalle {
  descripcion: string;
  encargado: string;
  fecha: string;
  monto: number;
}

export interface DatosVenta {
  vendedor: {
    nombre: string;
    identificacion: string;
    direccion: string;
    telefono: string;
  };
  comprador: {
    nombre: string;
    identificacion: string;
    direccion: string;
    telefono: string;
    email: string;
  };
  vehiculoAdicional: {
    tipoCarroceria: string;
    capacidad: string;
    numeroPuertas: number;
    numeroMotor: string;
    linea: string;
    actaManifiesto: string;
    sitioMatricula: string;
    tipoServicio: string;
  };
  transaccion: {
    lugarCelebracion: string;
    fechaCelebracion: string;
    precioLetras: string;
    formaPago: string;
    vendedorAnterior: string;
    cedulaVendedorAnterior: string;
    diasTraspaso: number;
    fechaEntrega: string;
    horaEntrega: string;
    domicilioContractual: string;
    clausulasAdicionales: string;
  };
}

export interface Vehicle {
  _id: string;
  marca: string;
  modelo: string;
  año: number;
  placa: string;
  vin: string;
  color: string;
  kilometraje: number;
  precioCompra: number;
  precioVenta: number;
  gastos: {
    pintura: number;
    mecanica: number;
    traspaso: number;
    alistamiento: number;
    tapiceria: number;
    transporte: number;
    varios: number;
    total: number;
  };
  gastosDetallados?: {
    pintura: GastoDetalle[];
    mecanica: GastoDetalle[];
    traspaso: GastoDetalle[];
    alistamiento: GastoDetalle[];
    tapiceria: GastoDetalle[];
    transporte: GastoDetalle[];
    varios: GastoDetalle[];
  };
  inversionistas: Inversionista[];
  tieneInversionistas: boolean;
  estado: 'en_proceso' | 'listo_venta' | 'en_negociacion' | 'vendido' | 'retirado';
  documentacion: {
    prenda: {
      tiene: boolean;
      detalles?: string;
      verificado: boolean;
    };
    soat: {
      tiene: boolean;
      fechaVencimiento?: string;
      foto?: string;
      verificado: boolean;
    };
    tecnomecanica: {
      tiene: boolean;
      fechaVencimiento?: string;
      foto?: string;
      verificado: boolean;
    };
    tarjetaPropiedad: {
      tiene: boolean;
      foto?: string;
      verificado: boolean;
    };
  };
  checklist: {
    revisionMecanica: boolean;
    limpiezaDetailing: boolean;
    fotografiasCompletas: boolean;
    documentosCompletos: boolean;
    precioEstablecido: boolean;
  };
  fotos: {
    exteriores: string[];
    interiores: string[];
    detalles: string[];
    documentos: string[];
  };
  observaciones: string;
  pendientes: string[];
  fechaIngreso: string;
  fechaVenta?: string;
  datosVenta?: DatosVenta;
  registradoPor: {
    _id: string;
    nombre: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Statistics {
  totalVehiculos: number;
  vehiculosListos: number;
  vehiculosPendientes: number;
  vehiculosVendidos: number;
  valorInventario: number;
  totalGastos: number;
  gananciasEstimadas: number;
  gananciasReales: number;
  vehiculosEnStock: number;
}

export interface VehicleFormData {
  marca: string;
  modelo: string;
  año: number;
  placa: string;
  vin: string;
  color: string;
  kilometraje: number;
  precioCompra: number;
  precioVenta: number;
  observaciones?: string;
}
