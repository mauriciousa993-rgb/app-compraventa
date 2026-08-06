import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { DatosNegociacion, FormaPagoNegociacion } from '../types';
import {
  FORMAS_PAGO_NEGOCIACION,
  getTotalNegociacion,
  normalizeDatosNegociacion,
} from '../constants/vehicleOptions';

interface NegotiationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DatosNegociacion) => Promise<void> | void;
  vehiclePlaca: string;
  vehiclePrecioVenta: number;
  initialData?: DatosNegociacion;
  isSubmitting?: boolean;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount || 0);

const NegotiationModal: React.FC<NegotiationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  vehiclePlaca,
  vehiclePrecioVenta,
  initialData,
  isSubmitting = false,
}) => {
  const [formData, setFormData] = useState<DatosNegociacion>(() =>
    normalizeDatosNegociacion(initialData)
  );

  useEffect(() => {
    if (!isOpen) return;
    setFormData(normalizeDatosNegociacion(initialData));
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const total = getTotalNegociacion(formData);
  const diferencia = (vehiclePrecioVenta || 0) - total;

  const usaCredito = formData.formaPago === 'credito' || formData.formaPago === 'mixto';
  const usaEfectivo = formData.formaPago === 'efectivo' || formData.formaPago === 'mixto';
  const usaConsignacion = formData.formaPago === 'consignacion' || formData.formaPago === 'mixto';
  const usaTransferencia = formData.formaPago === 'transferencia' || formData.formaPago === 'mixto';

  const updateMonto = (campo: keyof DatosNegociacion, valor: string) => {
    setFormData((prev) => ({ ...prev, [campo]: parseFloat(valor) || 0 }));
  };

  const handleFormaPagoChange = (formaPago: FormaPagoNegociacion) => {
    setFormData((prev) => ({
      ...prev,
      formaPago,
      // Al cambiar a una forma de pago simple se limpian los montos que ya no aplican
      montoEfectivo: formaPago === 'efectivo' || formaPago === 'mixto' ? prev.montoEfectivo : 0,
      montoConsignacion:
        formaPago === 'consignacion' || formaPago === 'mixto' ? prev.montoConsignacion : 0,
      montoTransferencia:
        formaPago === 'transferencia' || formaPago === 'mixto' ? prev.montoTransferencia : 0,
      montoCredito: formaPago === 'credito' || formaPago === 'mixto' ? prev.montoCredito : 0,
      financiera: formaPago === 'credito' || formaPago === 'mixto' ? prev.financiera : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    await Promise.resolve(onSubmit(formData));
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:ring-2 focus:ring-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="modal-light max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">Forma de Pago de la Negociación</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-800">
              Vehículo: <span className="font-bold">{vehiclePlaca}</span>
            </p>
            <p className="text-sm text-blue-600">
              Precio de venta: {formatCurrency(vehiclePrecioVenta)}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Forma de pago *</label>
              <select
                required
                value={formData.formaPago}
                onChange={(e) => handleFormaPagoChange(e.target.value as FormaPagoNegociacion)}
                className={inputClass}
              >
                {FORMAS_PAGO_NEGOCIACION.map((opcion) => (
                  <option key={opcion.value || 'sin-definir'} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cliente interesado</label>
              <input
                type="text"
                value={formData.cliente}
                onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                className={inputClass}
                placeholder="Nombre del cliente"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono del cliente</label>
              <input
                type="tel"
                value={formData.telefonoCliente}
                onChange={(e) => setFormData({ ...formData, telefonoCliente: e.target.value })}
                className={inputClass}
                placeholder="Número de contacto"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="border-b pb-2 text-lg font-medium text-gray-900">Distribución del pago</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {usaEfectivo && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Monto en efectivo
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.montoEfectivo || ''}
                    onChange={(e) => updateMonto('montoEfectivo', e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
              )}

              {usaConsignacion && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Monto en consignación
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.montoConsignacion || ''}
                    onChange={(e) => updateMonto('montoConsignacion', e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
              )}

              {usaTransferencia && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Monto en transferencia
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.montoTransferencia || ''}
                    onChange={(e) => updateMonto('montoTransferencia', e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
              )}

              {usaCredito && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Monto financiado (crédito)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formData.montoCredito || ''}
                      onChange={(e) => updateMonto('montoCredito', e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Financiera / Entidad *
                    </label>
                    <input
                      type="text"
                      required={usaCredito}
                      value={formData.financiera}
                      onChange={(e) => setFormData({ ...formData, financiera: e.target.value })}
                      className={inputClass}
                      placeholder="Ej: Banco de Bogotá, Sufi, Finandina..."
                    />
                  </div>
                </>
              )}

              {!formData.formaPago && (
                <p className="text-sm text-gray-500 md:col-span-2">
                  Selecciona una forma de pago para registrar los montos.
                </p>
              )}
            </div>

            {formData.formaPago && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Total registrado</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {diferencia > 0 ? 'Falta por cubrir' : diferencia < 0 ? 'Excede el precio' : 'Diferencia'}
                  </span>
                  <span
                    className={`font-semibold ${
                      diferencia === 0
                        ? 'text-green-700'
                        : diferencia > 0
                        ? 'text-amber-700'
                        : 'text-red-700'
                    }`}
                  >
                    {formatCurrency(Math.abs(diferencia))}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Notas de la negociación</label>
              <textarea
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                rows={3}
                className={inputClass}
                placeholder="Detalles del acuerdo, fechas de desembolso, condiciones..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-primary-500 px-4 py-2 text-white transition-colors hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar forma de pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NegotiationModal;
