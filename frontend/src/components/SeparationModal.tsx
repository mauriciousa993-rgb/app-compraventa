import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DatosSeparacion } from '../types';

interface SeparationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DatosSeparacion) => void;
  vehiclePlaca: string;
  vehiclePrecioVenta: number;
  initialData?: DatosSeparacion;
  isEditMode?: boolean;
}

const SeparationModal: React.FC<SeparationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  vehiclePlaca,
  vehiclePrecioVenta,
  initialData,
  isEditMode = false,
}) => {
  const [formData, setFormData] = useState<DatosSeparacion>(initialData || {
    cliente: {
      nombre: '',
      identificacion: '',
      direccion: '',
      telefono: '',
      email: '',
    },
    valorSeparacion: 0,
    fechaSeparacion: new Date().toISOString().split('T')[0],
    notas: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const normalizedData: DatosSeparacion = {
      ...formData,
      fechaSeparacion: formData.fechaSeparacion || new Date().toISOString().split('T')[0],
    };

    onSubmit(normalizedData);
  };

  const updateCliente = (field: string, value: string) => {
    setFormData({
      ...formData,
      cliente: { ...formData.cliente, [field]: value },
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditMode ? 'Editar Separación' : 'Separación de Vehículo'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Vehicle Info */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-800">
              Vehículo: <span className="font-bold">{vehiclePlaca}</span>
            </p>
            <p className="text-sm text-blue-600">
              Precio de venta: ${vehiclePrecioVenta.toLocaleString('es-CO')}
            </p>
          </div>

          {/* Cliente Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
              Datos del Cliente
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.cliente.nombre}
                  onChange={(e) => updateCliente('nombre', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Nombre del cliente"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Identificación *
                </label>
                <input
                  type="text"
                  required
                  value={formData.cliente.identificacion}
                  onChange={(e) => updateCliente('identificacion', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Número de identificación"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono *
                </label>
                <input
                  type="tel"
                  required
                  value={formData.cliente.telefono}
                  onChange={(e) => updateCliente('telefono', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Número de teléfono"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.cliente.email}
                  onChange={(e) => updateCliente('email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="correo@ejemplo.com"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección
                </label>
                <input
                  type="text"
                  value={formData.cliente.direccion}
                  onChange={(e) => updateCliente('direccion', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Dirección de residencia"
                />
              </div>
            </div>
          </div>

          {/* Separation Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
              Detalles de la Separación
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor de Separación *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  value={formData.valorSeparacion}
                  onChange={(e) => setFormData({ ...formData, valorSeparacion: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Precio de venta: ${vehiclePrecioVenta.toLocaleString('es-CO')}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Separación *
                </label>
                <input
                  type="date"
                  required
                  value={formData.fechaSeparacion}
                  onChange={(e) => setFormData({ ...formData, fechaSeparacion: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas adicionales
                </label>
                <textarea
                  value={formData.notas || ''}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Observaciones o notas sobre la separación..."
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-500 text-white hover:bg-primary-400 rounded-lg transition-colors"
            >
              {isEditMode ? 'Actualizar' : 'Guardar Separación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SeparationModal;
