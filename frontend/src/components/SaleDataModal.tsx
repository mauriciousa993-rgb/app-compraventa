import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { DatosVenta } from '../types';
import { useAuth } from '../context/AuthContext';

interface SaleDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DatosVenta) => void;
  vehiclePlaca: string;
  initialData?: DatosVenta; // Datos iniciales para modo edición
  isEditMode?: boolean; // Indica si es modo edición
}

const SaleDataModal: React.FC<SaleDataModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  vehiclePlaca,
  initialData,
  isEditMode = false,
}) => {
  const { user } = useAuth();
  
  // Inicializar el formulario con datos iniciales o valores por defecto
  const getInitialData = () => {
    if (initialData) return initialData;
    
    // Si es una nueva venta (no modo edición), autocompletar con el usuario actual
    return {
      vendedor: {
        nombre: user?.nombre || user?.email || '',
        identificacion: '',
        direccion: '',
        telefono: '',
      },
      comprador: {
        nombre: '',
        identificacion: '',
        direccion: '',
        telefono: '',
        email: '',
      },
      vehiculoAdicional: {
        tipoCarroceria: '',
        capacidad: '',
        numeroPuertas: 4,
        numeroMotor: '',
        linea: '',
        actaManifiesto: '',
        sitioMatricula: '',
        tipoServicio: 'PARTICULAR',
      },
      transaccion: {
        lugarCelebracion: '',
        fechaCelebracion: new Date().toISOString().split('T')[0],
        precioLetras: '',
        formaPago: '',
        vendedorAnterior: '',
        cedulaVendedorAnterior: '',
        diasTraspaso: 30,
        fechaEntrega: new Date().toISOString().split('T')[0],
        horaEntrega: '',
        domicilioContractual: '',
        clausulasAdicionales: '',
      },
      comision: {
        monto: 0,
        porcentaje: 0,
        descripcion: '',
      },
    };
  };

  const [formData, setFormData] = useState<DatosVenta>(getInitialData());

  // Actualizar el formulario cuando cambia el modo o el usuario
  useEffect(() => {
    if (!isEditMode && user) {
      // Solo autocompletar si es modo creación y tenemos el usuario
      setFormData(prev => ({
        ...prev,
        vendedor: {
          ...prev.vendedor,
          nombre: prev.vendedor.nombre || user.nombre || user.email || ''
        }
      }));
    }
  }, [user, isEditMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedData: DatosVenta = {
      ...formData,
      vehiculoAdicional: {
        ...formData.vehiculoAdicional,
        numeroPuertas: Number.isFinite(formData.vehiculoAdicional.numeroPuertas)
          ? formData.vehiculoAdicional.numeroPuertas
          : 4,
      },
      transaccion: {
        ...formData.transaccion,
        diasTraspaso: Number.isFinite(formData.transaccion.diasTraspaso)
          ? formData.transaccion.diasTraspaso
          : 30,
      },
    };

    onSubmit(normalizedData);
  };

  const updateVendedor = (field: string, value: string) => {
    setFormData({
      ...formData,
      vendedor: { ...formData.vendedor, [field]: value },
    });
  };

  const updateComprador = (field: string, value: string) => {
    setFormData({
      ...formData,
      comprador: { ...formData.comprador, [field]: value },
    });
  };

  const updateVehiculoAdicional = (field: string, value: string | number) => {
    setFormData({
      ...formData,
      vehiculoAdicional: { ...formData.vehiculoAdicional, [field]: value },
    });
  };

  const updateTransaccion = (field: string, value: string | number) => {
    setFormData({
      ...formData,
      transaccion: { ...formData.transaccion, [field]: value },
    });
  };

  const updateComision = (field: string, value: string | number) => {
    setFormData({
      ...formData,
      comision: { ...formData.comision, [field]: value },
    });
  };

  // Función para calcular monto de comisión basado en porcentaje
  const calcularMontoComision = (porcentaje: number, precioVenta: number) => {
    return (porcentaje / 100) * precioVenta;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {isEditMode ? 'Editar' : 'Registrar'} Datos de Venta - {vehiclePlaca}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {/* DATOS DEL VENDEDOR */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
              Datos del Vendedor
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.vendedor.nombre}
                  onChange={(e) => updateVendedor('nombre', e.target.value)}
                  className="input"
                  placeholder="Ej: Juan Pérez García"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cédula/NIT *
                </label>
                <input
                  type="text"
                  required
                  value={formData.vendedor.identificacion}
                  onChange={(e) => updateVendedor('identificacion', e.target.value)}
                  className="input"
                  placeholder="Ej: 1234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección *
                </label>
                <input
                  type="text"
                  required
                  value={formData.vendedor.direccion}
                  onChange={(e) => updateVendedor('direccion', e.target.value)}
                  className="input"
                  placeholder="Ej: Calle 123 #45-67"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono *
                </label>
                <input
                  type="tel"
                  required
                  value={formData.vendedor.telefono}
                  onChange={(e) => updateVendedor('telefono', e.target.value)}
                  className="input"
                  placeholder="Ej: 3001234567"
                />
              </div>
            </div>
          </div>

          {/* COMISIÓN DEL VENDEDOR */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
              Comisión del Vendedor
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto de Comisión ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={formData.comision.monto}
                  onChange={(e) => updateComision('monto', parseFloat(e.target.value) || 0)}
                  className="input"
                  placeholder="Ej: 500000"
                />
                <p className="text-xs text-gray-500 mt-1">Monto fijo a pagar al vendedor</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Porcentaje de Comisión (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={formData.comision.porcentaje}
                  onChange={(e) => updateComision('porcentaje', parseFloat(e.target.value) || 0)}
                  className="input"
                  placeholder="Ej: 5"
                />
                <p className="text-xs text-gray-500 mt-1">% del precio de venta</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  value={formData.comision.descripcion}
                  onChange={(e) => updateComision('descripcion', e.target.value)}
                  className="input"
                  placeholder="Ej: Comisión por cierre de venta"
                />
                <p className="text-xs text-gray-500 mt-1">Concepto o nota adicional</p>
              </div>
            </div>
            {/* Mostrar cálculo automático si hay porcentaje */}
            {formData.comision.porcentaje > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Nota:</strong> Si ingresa tanto monto como porcentaje, se utilizará el monto fijo. 
                  El porcentaje es solo referencial para cálculo automático.
                </p>
              </div>
            )}
          </div>

          {/* DATOS DEL COMPRADOR */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
              Datos del Comprador
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.comprador.nombre}
                  onChange={(e) => updateComprador('nombre', e.target.value)}
                  className="input"
                  placeholder="Ej: María López Rodríguez"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cédula/NIT *
                </label>
                <input
                  type="text"
                  required
                  value={formData.comprador.identificacion}
                  onChange={(e) => updateComprador('identificacion', e.target.value)}
                  className="input"
                  placeholder="Ej: 9876543210"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección *
                </label>
                <input
                  type="text"
                  required
                  value={formData.comprador.direccion}
                  onChange={(e) => updateComprador('direccion', e.target.value)}
                  className="input"
                  placeholder="Ej: Carrera 45 #12-34"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono *
                </label>
                <input
                  type="tel"
                  required
                  value={formData.comprador.telefono}
                  onChange={(e) => updateComprador('telefono', e.target.value)}
                  className="input"
                  placeholder="Ej: 3109876543"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={formData.comprador.email}
                  onChange={(e) => updateComprador('email', e.target.value)}
                  className="input"
                  placeholder="Ej: comprador@email.com"
                />
              </div>
            </div>
          </div>

          {/* DATOS ADICIONALES DEL VEHÍCULO */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
              Datos Adicionales del Vehículo
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Carrocería
                </label>
                <input
                  type="text"
                  value={formData.vehiculoAdicional.tipoCarroceria}
                  onChange={(e) => updateVehiculoAdicional('tipoCarroceria', e.target.value)}
                  className="input"
                  placeholder="Ej: Sedán, SUV, Camioneta"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Capacidad
                </label>
                <input
                  type="text"
                  value={formData.vehiculoAdicional.capacidad}
                  onChange={(e) => updateVehiculoAdicional('capacidad', e.target.value)}
                  className="input"
                  placeholder="Ej: 5 pasajeros"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de Puertas
                </label>
                <input
                  type="number"
                  value={formData.vehiculoAdicional.numeroPuertas}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    updateVehiculoAdicional('numeroPuertas', Number.isFinite(value) ? value : 4);
                  }}
                  className="input"
                  min="2"
                  max="6"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de Motor
                </label>
                <input
                  type="text"
                  value={formData.vehiculoAdicional.numeroMotor}
                  onChange={(e) => updateVehiculoAdicional('numeroMotor', e.target.value)}
                  className="input"
                  placeholder="Ej: ABC123456"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Línea
                </label>
                <input
                  type="text"
                  value={formData.vehiculoAdicional.linea}
                  onChange={(e) => updateVehiculoAdicional('linea', e.target.value)}
                  className="input"
                  placeholder="Ej: Sport, Luxury"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Acta/Manifiesto
                </label>
                <input
                  type="text"
                  value={formData.vehiculoAdicional.actaManifiesto}
                  onChange={(e) => updateVehiculoAdicional('actaManifiesto', e.target.value)}
                  className="input"
                  placeholder="Ej: 123456"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sitio de Matrícula
                </label>
                <input
                  type="text"
                  value={formData.vehiculoAdicional.sitioMatricula}
                  onChange={(e) => updateVehiculoAdicional('sitioMatricula', e.target.value)}
                  className="input"
                  placeholder="Ej: Bogotá"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Servicio
                </label>
                <select
                  value={formData.vehiculoAdicional.tipoServicio}
                  onChange={(e) => updateVehiculoAdicional('tipoServicio', e.target.value)}
                  className="input"
                >
                  <option value="PARTICULAR">Particular</option>
                  <option value="PUBLICO">Público</option>
                  <option value="OFICIAL">Oficial</option>
                  <option value="DIPLOMATICO">Diplomático</option>
                </select>
              </div>
            </div>
          </div>

          {/* DATOS DE LA TRANSACCIÓN */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
              Datos de la Transacción
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lugar de Celebración *
                </label>
                <input
                  type="text"
                  required
                  value={formData.transaccion.lugarCelebracion}
                  onChange={(e) => updateTransaccion('lugarCelebracion', e.target.value)}
                  className="input"
                  placeholder="Ej: Bogotá D.C."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Celebración *
                </label>
                <input
                  type="date"
                  required
                  value={formData.transaccion.fechaCelebracion}
                  onChange={(e) => updateTransaccion('fechaCelebracion', e.target.value)}
                  className="input"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio en Letras *
                </label>
                <input
                  type="text"
                  required
                  value={formData.transaccion.precioLetras}
                  onChange={(e) => updateTransaccion('precioLetras', e.target.value)}
                  className="input"
                  placeholder="Ej: CINCUENTA MILLONES DE PESOS COLOMBIANOS"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Escribe el precio en letras mayúsculas
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Forma de Pago *
                </label>
                <textarea
                  required
                  value={formData.transaccion.formaPago}
                  onChange={(e) => updateTransaccion('formaPago', e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="Ej: Pago de contado en efectivo / Transferencia bancaria / Cuotas mensuales de..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendedor Anterior
                </label>
                <input
                  type="text"
                  value={formData.transaccion.vendedorAnterior}
                  onChange={(e) => updateTransaccion('vendedorAnterior', e.target.value)}
                  className="input"
                  placeholder="De quien se compró el vehículo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cédula Vendedor Anterior
                </label>
                <input
                  type="text"
                  value={formData.transaccion.cedulaVendedorAnterior}
                  onChange={(e) => updateTransaccion('cedulaVendedorAnterior', e.target.value)}
                  className="input"
                  placeholder="Ej: 1234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Días para Traspaso *
                </label>
                <input
                  type="number"
                  required
                  value={formData.transaccion.diasTraspaso}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    updateTransaccion('diasTraspaso', Number.isFinite(value) ? value : 30);
                  }}
                  className="input"
                  min="1"
                  max="90"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Entrega *
                </label>
                <input
                  type="date"
                  required
                  value={formData.transaccion.fechaEntrega}
                  onChange={(e) => updateTransaccion('fechaEntrega', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hora de Entrega
                </label>
                <input
                  type="time"
                  value={formData.transaccion.horaEntrega}
                  onChange={(e) => updateTransaccion('horaEntrega', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domicilio Contractual *
                </label>
                <input
                  type="text"
                  required
                  value={formData.transaccion.domicilioContractual}
                  onChange={(e) => updateTransaccion('domicilioContractual', e.target.value)}
                  className="input"
                  placeholder="Ej: Bogotá D.C."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cláusulas Adicionales
                </label>
                <textarea
                  value={formData.transaccion.clausulasAdicionales}
                  onChange={(e) => updateTransaccion('clausulasAdicionales', e.target.value)}
                  className="input"
                  rows={4}
                  placeholder="Cláusulas adicionales del contrato (opcional)"
                />
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
            >
              {isEditMode ? 'Actualizar Datos de Venta' : 'Guardar, Vender y Generar Documentos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SaleDataModal;
