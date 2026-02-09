import mongoose, { Schema, Document } from 'mongoose';

export interface IGastoInversionista {
  categoria: 'pintura' | 'mecanica' | 'traspaso' | 'alistamiento' | 'tapiceria' | 'transporte' | 'varios';
  monto: number;
  descripcion: string;
  fecha: Date;
}

export interface IInversionista {
  usuario: mongoose.Types.ObjectId; // Referencia al usuario inversionista
  nombre: string;
  montoInversion: number;
  gastos: IGastoInversionista[]; // Array de gastos del inversionista
  porcentajeParticipacion: number;
  utilidadCorrespondiente: number;
}

export interface IDatosVenta {
  // Datos del vendedor
  vendedor: {
    nombre: string;
    identificacion: string;
    direccion: string;
    telefono: string;
  };
  // Datos del comprador
  comprador: {
    nombre: string;
    identificacion: string;
    direccion: string;
    telefono: string;
    email: string;
  };
  // Datos adicionales del vehículo
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
  // Datos de la transacción
  transaccion: {
    lugarCelebracion: string;
    fechaCelebracion: Date;
    precioLetras: string;
    formaPago: string;
    vendedorAnterior: string;
    cedulaVendedorAnterior: string;
    diasTraspaso: number;
    fechaEntrega: Date;
    horaEntrega: string;
    domicilioContractual: string;
    clausulasAdicionales: string;
  };
}

export interface IGastoDetalle {
  descripcion: string;
  encargado: string;
  fecha: Date;
  monto: number;
}

export interface IVehicleDocument extends Document {
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
  gastosDetallados: {
    pintura: IGastoDetalle[];
    mecanica: IGastoDetalle[];
    traspaso: IGastoDetalle[];
    alistamiento: IGastoDetalle[];
    tapiceria: IGastoDetalle[];
    transporte: IGastoDetalle[];
    varios: IGastoDetalle[];
  };
  inversionistas: IInversionista[];
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
      fechaVencimiento?: Date;
      foto?: string;
      verificado: boolean;
    };
    tecnomecanica: {
      tiene: boolean;
      fechaVencimiento?: Date;
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
  fechaIngreso: Date;
  fechaVenta?: Date;
  datosVenta?: IDatosVenta;
  registradoPor: mongoose.Types.ObjectId;
}

const vehicleSchema = new Schema<IVehicleDocument>(
  {
    marca: {
      type: String,
      required: [true, 'La marca es requerida'],
      trim: true,
    },
    modelo: {
      type: String,
      required: [true, 'El modelo es requerido'],
      trim: true,
    },
    año: {
      type: Number,
      required: [true, 'El año es requerido'],
      min: [1900, 'El año debe ser mayor a 1900'],
      max: [new Date().getFullYear() + 1, 'El año no puede ser futuro'],
    },
    placa: {
      type: String,
      required: [true, 'La placa es requerida'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    vin: {
      type: String,
      required: false,
      sparse: true, // Permite múltiples documentos con vin vacío
      uppercase: true,
      trim: true,
    },
    color: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    kilometraje: {
      type: Number,
      required: [true, 'El kilometraje es requerido'],
      min: [0, 'El kilometraje no puede ser negativo'],
    },
    precioCompra: {
      type: Number,
      required: [true, 'El precio de compra es requerido'],
      min: [0, 'El precio de compra no puede ser negativo'],
    },
    precioVenta: {
      type: Number,
      required: [true, 'El precio de venta es requerido'],
      min: [0, 'El precio de venta no puede ser negativo'],
    },
    gastos: {
      pintura: { type: Number, default: 0, min: [0, 'Los gastos no pueden ser negativos'] },
      mecanica: { type: Number, default: 0, min: [0, 'Los gastos no pueden ser negativos'] },
      traspaso: { type: Number, default: 0, min: [0, 'Los gastos no pueden ser negativos'] },
      alistamiento: { type: Number, default: 0, min: [0, 'Los gastos no pueden ser negativos'] },
      tapiceria: { type: Number, default: 0, min: [0, 'Los gastos no pueden ser negativos'] },
      transporte: { type: Number, default: 0, min: [0, 'Los gastos no pueden ser negativos'] },
      varios: { type: Number, default: 0, min: [0, 'Los gastos no pueden ser negativos'] },
      total: { type: Number, default: 0 },
    },
    gastosDetallados: {
      pintura: [{
        descripcion: { type: String, default: '', trim: true },
        encargado: { type: String, default: '', trim: true },
        fecha: { type: Date },
        monto: { type: Number, default: 0, min: [0, 'El monto no puede ser negativo'] }
      }],
      mecanica: [{
        descripcion: { type: String, default: '', trim: true },
        encargado: { type: String, default: '', trim: true },
        fecha: { type: Date },
        monto: { type: Number, default: 0, min: [0, 'El monto no puede ser negativo'] }
      }],
      traspaso: [{
        descripcion: { type: String, default: '', trim: true },
        encargado: { type: String, default: '', trim: true },
        fecha: { type: Date },
        monto: { type: Number, default: 0, min: [0, 'El monto no puede ser negativo'] }
      }],
      alistamiento: [{
        descripcion: { type: String, default: '', trim: true },
        encargado: { type: String, default: '', trim: true },
        fecha: { type: Date },
        monto: { type: Number, default: 0, min: [0, 'El monto no puede ser negativo'] }
      }],
      tapiceria: [{
        descripcion: { type: String, default: '', trim: true },
        encargado: { type: String, default: '', trim: true },
        fecha: { type: Date },
        monto: { type: Number, default: 0, min: [0, 'El monto no puede ser negativo'] }
      }],
      transporte: [{
        descripcion: { type: String, default: '', trim: true },
        encargado: { type: String, default: '', trim: true },
        fecha: { type: Date },
        monto: { type: Number, default: 0, min: [0, 'El monto no puede ser negativo'] }
      }],
      varios: [{
        descripcion: { type: String, default: '', trim: true },
        encargado: { type: String, default: '', trim: true },
        fecha: { type: Date },
        monto: { type: Number, default: 0, min: [0, 'El monto no puede ser negativo'] }
      }]
    },
    inversionistas: [{
      usuario: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      nombre: { type: String, required: true, trim: true },
      montoInversion: { type: Number, required: true, min: [0, 'El monto de inversión no puede ser negativo'] },
      gastos: [{
        categoria: { 
          type: String, 
          required: true,
          enum: ['pintura', 'mecanica', 'traspaso', 'alistamiento', 'tapiceria', 'transporte', 'varios']
        },
        monto: { type: Number, required: true, min: [0, 'El monto no puede ser negativo'] },
        descripcion: { type: String, default: '', trim: true },
        fecha: { type: Date, default: Date.now }
      }],
      porcentajeParticipacion: { type: Number, default: 0, min: [0, 'El porcentaje no puede ser negativo'], max: [100, 'El porcentaje no puede ser mayor a 100'] },
      utilidadCorrespondiente: { type: Number, default: 0 }
    }],
    tieneInversionistas: {
      type: Boolean,
      default: false,
    },
    estado: {
      type: String,
      enum: ['en_proceso', 'listo_venta', 'en_negociacion', 'vendido', 'retirado'],
      default: 'en_proceso',
    },
    documentacion: {
      prenda: {
        tiene: { type: Boolean, default: false },
        detalles: { type: String, default: '' },
        verificado: { type: Boolean, default: false },
      },
      soat: {
        tiene: { type: Boolean, default: false },
        fechaVencimiento: { type: Date },
        foto: { type: String, default: '' },
        verificado: { type: Boolean, default: false },
      },
      tecnomecanica: {
        tiene: { type: Boolean, default: false },
        fechaVencimiento: { type: Date },
        foto: { type: String, default: '' },
        verificado: { type: Boolean, default: false },
      },
      tarjetaPropiedad: {
        tiene: { type: Boolean, default: false },
        foto: { type: String, default: '' },
        verificado: { type: Boolean, default: false },
      },
    },
    checklist: {
      revisionMecanica: { type: Boolean, default: false },
      limpiezaDetailing: { type: Boolean, default: false },
      fotografiasCompletas: { type: Boolean, default: false },
      documentosCompletos: { type: Boolean, default: false },
      precioEstablecido: { type: Boolean, default: false },
    },
    fotos: {
      exteriores: [{ type: String }],
      interiores: [{ type: String }],
      detalles: [{ type: String }],
      documentos: [{ type: String }],
    },
    observaciones: {
      type: String,
      default: '',
    },
    pendientes: [{ type: String }],
    fechaIngreso: {
      type: Date,
      default: Date.now,
    },
    fechaVenta: {
      type: Date,
    },
    datosVenta: {
      vendedor: {
        nombre: { type: String, default: '', trim: true },
        identificacion: { type: String, default: '', trim: true },
        direccion: { type: String, default: '', trim: true },
        telefono: { type: String, default: '', trim: true },
      },
      comprador: {
        nombre: { type: String, default: '', trim: true },
        identificacion: { type: String, default: '', trim: true },
        direccion: { type: String, default: '', trim: true },
        telefono: { type: String, default: '', trim: true },
        email: { type: String, default: '', trim: true },
      },
      vehiculoAdicional: {
        tipoCarroceria: { type: String, default: '', trim: true },
        capacidad: { type: String, default: '', trim: true },
        numeroPuertas: { type: Number, default: 0 },
        numeroMotor: { type: String, default: '', trim: true },
        linea: { type: String, default: '', trim: true },
        actaManifiesto: { type: String, default: '', trim: true },
        sitioMatricula: { type: String, default: '', trim: true },
        tipoServicio: { type: String, default: '', trim: true },
      },
      transaccion: {
        lugarCelebracion: { type: String, default: '', trim: true },
        fechaCelebracion: { type: Date },
        precioLetras: { type: String, default: '', trim: true },
        formaPago: { type: String, default: '', trim: true },
        vendedorAnterior: { type: String, default: '', trim: true },
        cedulaVendedorAnterior: { type: String, default: '', trim: true },
        diasTraspaso: { type: Number, default: 30 },
        fechaEntrega: { type: Date },
        horaEntrega: { type: String, default: '', trim: true },
        domicilioContractual: { type: String, default: '', trim: true },
        clausulasAdicionales: { type: String, default: '', trim: true },
      },
    },
    registradoPor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índices para búsquedas rápidas
vehicleSchema.index({ placa: 1 });
vehicleSchema.index({ vin: 1 }, { sparse: true }); // Índice sparse para permitir valores vacíos
vehicleSchema.index({ estado: 1 });
vehicleSchema.index({ marca: 1, modelo: 1 });

// Middleware para calcular total de gastos y distribución de inversionistas antes de guardar
vehicleSchema.pre('save', function (next) {
  // Calcular totales de gastos detallados
  if (this.gastosDetallados) {
    this.gastos.pintura = this.gastosDetallados.pintura?.reduce((sum, g) => sum + (g.monto || 0), 0) || 0;
    this.gastos.mecanica = this.gastosDetallados.mecanica?.reduce((sum, g) => sum + (g.monto || 0), 0) || 0;
    this.gastos.traspaso = this.gastosDetallados.traspaso?.reduce((sum, g) => sum + (g.monto || 0), 0) || 0;
    this.gastos.alistamiento = this.gastosDetallados.alistamiento?.reduce((sum, g) => sum + (g.monto || 0), 0) || 0;
    this.gastos.tapiceria = this.gastosDetallados.tapiceria?.reduce((sum, g) => sum + (g.monto || 0), 0) || 0;
    this.gastos.transporte = this.gastosDetallados.transporte?.reduce((sum, g) => sum + (g.monto || 0), 0) || 0;
    this.gastos.varios = this.gastosDetallados.varios?.reduce((sum, g) => sum + (g.monto || 0), 0) || 0;
  }
  
  // Calcular gastos generales desde gastos detallados
  const gastosGenerales = this.gastos.pintura + this.gastos.mecanica + this.gastos.traspaso + 
                          this.gastos.alistamiento + this.gastos.tapiceria + this.gastos.transporte + 
                          this.gastos.varios;
  
  // Calcular gastos de inversionistas (suma de todos sus gastos individuales)
  const gastosInversionistas = this.inversionistas && this.inversionistas.length > 0
    ? this.inversionistas.reduce((sum, inv) => {
        const totalGastosInv = inv.gastos?.reduce((s, g) => s + (g.monto || 0), 0) || 0;
        return sum + totalGastosInv;
      }, 0)
    : 0;
  
  // Calcular total de gastos (generales + inversionistas)
  this.gastos.total = gastosGenerales + gastosInversionistas;
  
  // Calcular distribución de inversionistas si existen
  if (this.inversionistas && this.inversionistas.length > 0) {
    const totalInversion = this.inversionistas.reduce((sum, inv) => sum + inv.montoInversion, 0);
    
    // Utilidad bruta (sin considerar gastos de inversionistas)
    const utilidadBruta = this.precioVenta - this.precioCompra - gastosGenerales;
    
    // Utilidad neta a distribuir (después de restar gastos de inversionistas)
    const utilidadNeta = utilidadBruta - gastosInversionistas;
    
    this.inversionistas.forEach(inv => {
      // Calcular porcentaje de participación
      inv.porcentajeParticipacion = totalInversion > 0 ? (inv.montoInversion / totalInversion) * 100 : 0;
      
      // Calcular total de gastos del inversionista
      const totalGastosInv = inv.gastos?.reduce((s, g) => s + (g.monto || 0), 0) || 0;
      
      // Utilidad correspondiente = (porcentaje × utilidad neta) + gastos del inversionista
      const utilidadPorParticipacion = (inv.porcentajeParticipacion / 100) * utilidadNeta;
      inv.utilidadCorrespondiente = utilidadPorParticipacion + totalGastosInv;
    });
  }
  
  next();
});

// Método virtual para calcular costo total (compra + gastos)
vehicleSchema.virtual('costoTotal').get(function () {
  return this.precioCompra + this.gastos.total;
});

// Método virtual para calcular ganancia real (venta - compra - gastos)
vehicleSchema.virtual('ganancia').get(function () {
  return this.precioVenta - this.precioCompra - this.gastos.total;
});

// Método virtual para calcular margen de ganancia en porcentaje
vehicleSchema.virtual('margenGanancia').get(function () {
  const costoTotal = this.precioCompra + this.gastos.total;
  if (costoTotal === 0) return 0;
  return ((this.precioVenta - costoTotal) / costoTotal) * 100;
});

// Método virtual para verificar si está listo para venta
vehicleSchema.virtual('listoParaVenta').get(function () {
  const checklistCompleto = Object.values(this.checklist).every(item => item === true);
  const documentosCompletos = 
    this.documentacion.soat.verificado &&
    this.documentacion.tecnomecanica.verificado &&
    this.documentacion.tarjetaPropiedad.verificado &&
    !this.documentacion.prenda.tiene;
  
  return checklistCompleto && documentosCompletos;
});

export default mongoose.model<IVehicleDocument>('Vehicle', vehicleSchema);
