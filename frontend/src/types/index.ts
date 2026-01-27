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
    varios: number;
    total: number;
  };
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
