import mongoose, { Document, Schema } from 'mongoose';

export type InspectionStatus = 'bien' | 'mal';

export interface IInspectionItem {
  key: string;
  label: string;
  category: string;
  status: InspectionStatus;
  observaciones: string;
}

export interface IDamageZone {
  key: string;
  label: string;
  status: InspectionStatus;
  observaciones: string;
}

export interface IVehicleInspectionChecklistDocument extends Document {
  vehicle: mongoose.Types.ObjectId;
  inspectorName: string;
  inspectionDate: Date;
  items: IInspectionItem[];
  damageZones: IDamageZone[];
  generalObservations: string;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const inspectionItemSchema = new Schema<IInspectionItem>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    status: { type: String, enum: ['bien', 'mal'], required: true },
    observaciones: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const damageZoneSchema = new Schema<IDamageZone>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    status: { type: String, enum: ['bien', 'mal'], required: true },
    observaciones: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const vehicleInspectionChecklistSchema = new Schema<IVehicleInspectionChecklistDocument>(
  {
    vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, unique: true, index: true },
    inspectorName: { type: String, default: '', trim: true },
    inspectionDate: { type: Date, default: Date.now },
    items: { type: [inspectionItemSchema], default: [] },
    damageZones: { type: [damageZoneSchema], default: [] },
    generalObservations: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IVehicleInspectionChecklistDocument>(
  'VehicleInspectionChecklist',
  vehicleInspectionChecklistSchema
);
