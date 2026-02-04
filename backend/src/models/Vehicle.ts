import mongoose, { Schema, Document } from 'mongoose';

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
      varios: { type: Number, default: 0, min: [0, 'Los gastos no pueden ser negativos'] },
      total: { type: Number, default: 0 },
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

// Middleware para calcular total de gastos antes de guardar
vehicleSchema.pre('save', function (next) {
  this.gastos.total = this.gastos.pintura + this.gastos.mecanica + this.gastos.traspaso + this.gastos.varios;
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
