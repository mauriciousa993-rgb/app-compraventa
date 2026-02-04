import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, Save, Image, X } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import api from '../services/api';

const VehicleForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    // Datos básicos
    marca: '',
    modelo: '',
    año: new Date().getFullYear(),
    placa: '',
    color: '',
    kilometraje: 0,
    
    // Precios
    precioCompra: 0,
    precioVenta: 0,
    
    // Gastos
    gastos: {
      pintura: 0,
      mecanica: 0,
      traspaso: 0,
      varios: 0,
      total: 0
    },
    
    // Inversionistas
    inversionistas: [] as Array<{
      nombre: string;
      montoInversion: number;
      porcentajeParticipacion: number;
      utilidadCorrespondiente: number;
    }>,
    tieneInversionistas: false,
    
    // Estado
    estado: 'en_proceso',
    fechaVenta: '',
    
    // Documentación
    documentacion: {
      prenda: {
        tiene: false,
        detalles: '',
        verificado: false
      },
      soat: {
        tiene: false,
        fechaVencimiento: '',
        verificado: false
      },
      tecnomecanica: {
        tiene: false,
        fechaVencimiento: '',
        verificado: false
      },
      tarjetaPropiedad: {
        tiene: false,
        verificado: false
      }
    },
    
    // Checklist
    checklist: {
      revisionMecanica: false,
      limpiezaDetailing: false,
      fotografiasCompletas: false,
      documentosCompletos: false,
      precioEstablecido: false
    },
    
    // Observaciones
    observaciones: '',
    
    // Fotos
    fotos: {
      exteriores: [] as string[],
      interiores: [] as string[],
      detalles: [] as string[],
      documentos: [] as string[]
    }
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');

  // Formatear número con separador de miles
  const formatNumber = (value: number | string): string => {
    if (value === '' || value === 0 || value === '0') return '';
    const numValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(numValue)) return '';
    return numValue.toLocaleString('es-CO');
  };

  // Parsear número desde string formateado
  const parseFormattedNumber = (value: string): number => {
    if (!value || value === '') return 0;
    const cleaned = value.replace(/,/g, '').replace(/\./g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // Cargar datos del vehículo si estamos en modo edición
  useEffect(() => {
    if (isEditMode && id) {
      loadVehicleData(id);
    }
  }, [id, isEditMode]);

  const loadVehicleData = async (vehicleId: string) => {
    setIsLoadingData(true);
    setError('');
    try {
      const response = await api.get(`/vehicles/${vehicleId}`);
      const vehicle = response.data;
      
      // Cargar los datos en el formulario
      setFormData({
        marca: vehicle.marca || '',
        modelo: vehicle.modelo || '',
        año: vehicle.año || new Date().getFullYear(),
        placa: vehicle.placa || '',
        color: vehicle.color || '',
        kilometraje: vehicle.kilometraje || 0,
        precioCompra: vehicle.precioCompra || 0,
        precioVenta: vehicle.precioVenta || 0,
        gastos: {
          pintura: vehicle.gastos?.pintura || 0,
          mecanica: vehicle.gastos?.mecanica || 0,
          traspaso: vehicle.gastos?.traspaso || 0,
          varios: vehicle.gastos?.varios || 0,
          total: vehicle.gastos?.total || 0
        },
        inversionistas: vehicle.inversionistas || [],
        tieneInversionistas: vehicle.tieneInversionistas || false,
        estado: vehicle.estado || 'en_proceso',
        fechaVenta: vehicle.fechaVenta 
          ? new Date(vehicle.fechaVenta).toISOString().split('T')[0]
          : '',
        documentacion: {
          prenda: {
            tiene: vehicle.documentacion?.prenda?.tiene || false,
            detalles: vehicle.documentacion?.prenda?.detalles || '',
            verificado: vehicle.documentacion?.prenda?.verificado || false
          },
          soat: {
            tiene: vehicle.documentacion?.soat?.tiene || false,
            fechaVencimiento: vehicle.documentacion?.soat?.fechaVencimiento 
              ? new Date(vehicle.documentacion.soat.fechaVencimiento).toISOString().split('T')[0]
              : '',
            verificado: vehicle.documentacion?.soat?.verificado || false
          },
          tecnomecanica: {
            tiene: vehicle.documentacion?.tecnomecanica?.tiene || false,
            fechaVencimiento: vehicle.documentacion?.tecnomecanica?.fechaVencimiento
              ? new Date(vehicle.documentacion.tecnomecanica.fechaVencimiento).toISOString().split('T')[0]
              : '',
            verificado: vehicle.documentacion?.tecnomecanica?.verificado || false
          },
          tarjetaPropiedad: {
            tiene: vehicle.documentacion?.tarjetaPropiedad?.tiene || false,
            verificado: vehicle.documentacion?.tarjetaPropiedad?.verificado || false
          }
        },
        checklist: {
          revisionMecanica: vehicle.checklist?.revisionMecanica || false,
          limpiezaDetailing: vehicle.checklist?.limpiezaDetailing || false,
          fotografiasCompletas: vehicle.checklist?.fotografiasCompletas || false,
          documentosCompletos: vehicle.checklist?.documentosCompletos || false,
          precioEstablecido: vehicle.checklist?.precioEstablecido || false
        },
        observaciones: vehicle.observaciones || '',
        fotos: {
          exteriores: vehicle.fotos?.exteriores || [],
          interiores: vehicle.fotos?.interiores || [],
          detalles: vehicle.fotos?.detalles || [],
          documentos: vehicle.fotos?.documentos || []
        }
      });
    } catch (err: any) {
      console.error('Error al cargar vehículo:', err);
      setError(err.response?.data?.message || 'Error al cargar los datos del vehículo');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      
      // Manejar checkboxes del checklist
      if (name.startsWith('checklist.')) {
        const field = name.split('.')[1];
        setFormData(prev => ({
          ...prev,
          checklist: { ...prev.checklist, [field]: checked }
        }));
      }
      // Manejar checkboxes de documentación
      else if (name.startsWith('doc.')) {
        const parts = name.split('.');
        const doc = parts[1];
        const field = parts[2];
        setFormData(prev => ({
          ...prev,
          documentacion: {
            ...prev.documentacion,
            [doc]: { ...prev.documentacion[doc as keyof typeof prev.documentacion], [field]: checked }
          }
        }));
      }
    } else if (type === 'date') {
      // Manejar fechas de documentación
      if (name.startsWith('doc.')) {
        const parts = name.split('.');
        const doc = parts[1];
        setFormData(prev => ({
          ...prev,
          documentacion: {
            ...prev.documentacion,
            [doc]: { ...prev.documentacion[doc as keyof typeof prev.documentacion], fechaVencimiento: value, tiene: true }
          }
        }));
      } else {
        // Manejar otros campos de fecha (como fechaVenta)
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    } else if (name === 'doc.prenda.detalles') {
      setFormData(prev => ({
        ...prev,
        documentacion: {
          ...prev.documentacion,
          prenda: { ...prev.documentacion.prenda, detalles: value }
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Crear preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPhotoPreview('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isEditMode && id) {
        // Modo edición: usar PUT
        await api.put(`/vehicles/${id}`, formData);
        setSuccess(true);
        setTimeout(() => {
          navigate('/vehicles');
        }, 1500);
      } else {
        // Modo creación: usar POST
        await api.post('/vehicles', formData);
        setSuccess(true);
        setTimeout(() => {
          navigate('/vehicles');
        }, 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || `Error al ${isEditMode ? 'actualizar' : 'crear'} vehículo`);
    } finally {
      setIsLoading(false);
    }
  };

  // Mostrar loading mientras carga los datos del vehículo
  if (isLoadingData) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando datos del vehículo...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/vehicles')}
              className="mr-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-3xl font-bold text-gray-900">
              {isEditMode ? 'Editar Vehículo' : 'Nuevo Vehículo'}
            </h1>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            ¡Vehículo {isEditMode ? 'actualizado' : 'creado'} exitosamente! Redirigiendo...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Datos Básicos */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Datos Básicos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Marca *
                </label>
                <input
                  type="text"
                  name="marca"
                  value={formData.marca}
                  onChange={handleChange}
                  className="input-field"
                  required
                  placeholder="Ej: Toyota"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modelo *
                </label>
                <input
                  type="text"
                  name="modelo"
                  value={formData.modelo}
                  onChange={handleChange}
                  className="input-field"
                  required
                  placeholder="Ej: Corolla"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Año *
                </label>
                <input
                  type="number"
                  name="año"
                  value={formData.año}
                  onChange={handleChange}
                  className="input-field"
                  required
                  min="1900"
                  max={new Date().getFullYear() + 1}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Placa *
                </label>
                <input
                  type="text"
                  name="placa"
                  value={formData.placa}
                  onChange={handleChange}
                  className="input-field"
                  required
                  placeholder="Ej: ABC123"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <input
                  type="text"
                  name="color"
                  value={formData.color}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Ej: Blanco"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kilometraje
                </label>
                <input
                  type="text"
                  name="kilometraje"
                  value={formatNumber(formData.kilometraje)}
                  onChange={(e) => {
                    const numValue = parseFormattedNumber(e.target.value);
                    setFormData(prev => ({ ...prev, kilometraje: numValue }));
                  }}
                  className="input-field"
                  placeholder="Ej: 50,000"
                />
              </div>
            </div>
          </div>

          {/* Precios */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Precios</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio de Compra *
                </label>
                <input
                  type="text"
                  name="precioCompra"
                  value={formatNumber(formData.precioCompra)}
                  onChange={(e) => {
                    const numValue = parseFormattedNumber(e.target.value);
                    setFormData(prev => ({ ...prev, precioCompra: numValue }));
                  }}
                  className="input-field"
                  required
                  placeholder="Ej: 29,000,000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio de Venta *
                </label>
                <input
                  type="text"
                  name="precioVenta"
                  value={formatNumber(formData.precioVenta)}
                  onChange={(e) => {
                    const numValue = parseFormattedNumber(e.target.value);
                    setFormData(prev => ({ ...prev, precioVenta: numValue }));
                  }}
                  className="input-field"
                  required
                  placeholder="Ej: 37,500,000"
                />
              </div>
            </div>
          </div>

          {/* Gastos */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Gastos del Vehículo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gastos en Pintura
                </label>
                <input
                  type="text"
                  name="gastos.pintura"
                  value={formatNumber(formData.gastos.pintura)}
                  onChange={(e) => {
                    const numValue = parseFormattedNumber(e.target.value);
                    setFormData(prev => {
                      const newGastos = { ...prev.gastos, pintura: numValue };
                      newGastos.total = newGastos.pintura + newGastos.mecanica + newGastos.traspaso + newGastos.varios;
                      return { ...prev, gastos: newGastos };
                    });
                  }}
                  className="input-field"
                  placeholder="Ej: 2,000,000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gastos en Mecánica
                </label>
                <input
                  type="text"
                  name="gastos.mecanica"
                  value={formatNumber(formData.gastos.mecanica)}
                  onChange={(e) => {
                    const numValue = parseFormattedNumber(e.target.value);
                    setFormData(prev => {
                      const newGastos = { ...prev.gastos, mecanica: numValue };
                      newGastos.total = newGastos.pintura + newGastos.mecanica + newGastos.traspaso + newGastos.varios;
                      return { ...prev, gastos: newGastos };
                    });
                  }}
                  className="input-field"
                  placeholder="Ej: 1,500,000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gastos de Traspaso
                </label>
                <input
                  type="text"
                  name="gastos.traspaso"
                  value={formatNumber(formData.gastos.traspaso)}
                  onChange={(e) => {
                    const numValue = parseFormattedNumber(e.target.value);
                    setFormData(prev => {
                      const newGastos = { ...prev.gastos, traspaso: numValue };
                      newGastos.total = newGastos.pintura + newGastos.mecanica + newGastos.traspaso + newGastos.varios;
                      return { ...prev, gastos: newGastos };
                    });
                  }}
                  className="input-field"
                  placeholder="Ej: 800,000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gastos Varios
                </label>
                <input
                  type="text"
                  name="gastos.varios"
                  value={formatNumber(formData.gastos.varios)}
                  onChange={(e) => {
                    const numValue = parseFormattedNumber(e.target.value);
                    setFormData(prev => {
                      const newGastos = { ...prev.gastos, varios: numValue };
                      newGastos.total = newGastos.pintura + newGastos.mecanica + newGastos.traspaso + newGastos.varios;
                      return { ...prev, gastos: newGastos };
                    });
                  }}
                  className="input-field"
                  placeholder="Ej: 500,000"
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <label className="block text-sm font-medium text-blue-700 mb-1">
                  Total Gastos
                </label>
                <p className="text-2xl font-bold text-blue-900">
                  ${formData.gastos.total.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Resumen Financiero */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Resumen Financiero</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Costo Total:</p>
                  <p className="text-lg font-semibold text-gray-900">
                    ${(formData.precioCompra + formData.gastos.total).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-500">(Compra + Gastos)</p>
                </div>
                <div>
                  <p className="text-gray-600">Precio de Venta:</p>
                  <p className="text-lg font-semibold text-green-600">
                    ${formData.precioVenta.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Utilidad Estimada:</p>
                  <p className={`text-lg font-semibold ${
                    (formData.precioVenta - formData.precioCompra - formData.gastos.total) >= 0 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    ${(formData.precioVenta - formData.precioCompra - formData.gastos.total).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formData.precioCompra + formData.gastos.total > 0 
                      ? `(${(((formData.precioVenta - formData.precioCompra - formData.gastos.total) / (formData.precioCompra + formData.gastos.total)) * 100).toFixed(1)}%)`
                      : '(0%)'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Documentación */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Documentación</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="doc.prenda.tiene"
                  checked={formData.documentacion.prenda.tiene}
                  onChange={handleChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  ¿Tiene Prenda?
                </label>
              </div>

              {formData.documentacion.prenda.tiene && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Detalles de la Prenda
                  </label>
                  <textarea
                    name="doc.prenda.detalles"
                    value={formData.documentacion.prenda.detalles}
                    onChange={handleChange}
                    className="input-field"
                    rows={2}
                    placeholder="Detalles sobre la prenda..."
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SOAT (Vencimiento)
                  </label>
                  <input
                    type="date"
                    name="doc.soat.fechaVencimiento"
                    value={formData.documentacion.soat.fechaVencimiento}
                    onChange={handleChange}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tecnomecánica (Vencimiento)
                  </label>
                  <input
                    type="date"
                    name="doc.tecnomecanica.fechaVencimiento"
                    value={formData.documentacion.tecnomecanica.fechaVencimiento}
                    onChange={handleChange}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="doc.tarjetaPropiedad.tiene"
                  checked={formData.documentacion.tarjetaPropiedad.tiene}
                  onChange={handleChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Tarjeta de Propiedad
                </label>
              </div>
            </div>
          </div>

          {/* Checklist */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Checklist de Ingreso</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="checklist.revisionMecanica"
                  checked={formData.checklist.revisionMecanica}
                  onChange={handleChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Revisión Mecánica Completa
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="checklist.limpiezaDetailing"
                  checked={formData.checklist.limpiezaDetailing}
                  onChange={handleChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Limpieza y Detailing
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="checklist.documentosCompletos"
                  checked={formData.checklist.documentosCompletos}
                  onChange={handleChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Documentos Completos
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="checklist.fotografiasCompletas"
                  checked={formData.checklist.fotografiasCompletas}
                  onChange={handleChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Fotos Completas
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="checklist.precioEstablecido"
                  checked={formData.checklist.precioEstablecido}
                  onChange={handleChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Precio Establecido
                </label>
              </div>
            </div>
          </div>

          {/* Estado */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Estado del Vehículo</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estado *
                </label>
                <select
                  name="estado"
                  value={formData.estado}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="en_proceso">En Proceso (Con pendientes)</option>
                  <option value="listo_venta">Listo para Venta</option>
                  <option value="en_negociacion">En Negociación</option>
                  <option value="vendido">Vendido</option>
                </select>
              </div>

              {/* Mostrar campo de fecha de venta solo si el estado es "vendido" */}
              {formData.estado === 'vendido' && (
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <label className="block text-sm font-medium text-green-700 mb-1">
                    Fecha de Venta *
                  </label>
                  <input
                    type="date"
                    name="fechaVenta"
                    value={formData.fechaVenta || ''}
                    onChange={handleChange}
                    className="input-field"
                    required={formData.estado === 'vendido'}
                  />
                  <p className="mt-2 text-xs text-green-600">
                    Esta fecha se usará para generar informes de ventas mensuales
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Foto del Vehículo */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">
              <Image className="inline h-5 w-5 mr-2" />
              Foto del Vehículo
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Sube una foto principal del vehículo
            </p>

            {!photoPreview ? (
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-12 h-12 mb-4 text-gray-400" />
                    <p className="mb-2 text-sm text-gray-700">
                      <span className="font-semibold">Click para subir</span> o arrastra la foto aquí
                    </p>
                    <p className="text-xs text-gray-500">PNG o JPG (MAX. 5MB)</p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            ) : (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-lg border-2 border-gray-200"
                />
                <button
                  type="button"
                  onClick={removeFile}
                  className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 transition-colors shadow-lg"
                  title="Eliminar foto"
                >
                  <X className="h-5 w-5" />
                </button>
                {selectedFile && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">
                      <strong>✓ Foto seleccionada:</strong> {selectedFile.name}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observaciones y Comentarios */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Observaciones y Comentarios</h2>
            <textarea
              name="observaciones"
              value={formData.observaciones}
              onChange={handleChange}
              className="input-field"
              rows={4}
              placeholder="Escribe aquí cualquier observación, comentario o detalle importante sobre el vehículo..."
            />
            <p className="mt-2 text-sm text-gray-500">
              Puedes incluir información sobre el estado general, historial, negociaciones, o cualquier detalle relevante.
            </p>
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/vehicles')}
              className="btn-secondary"
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary flex items-center"
              disabled={isLoading || success}
            >
              <Save className="h-5 w-5 mr-2" />
              {isLoading 
                ? 'Guardando...' 
                : success 
                  ? '¡Guardado!' 
                  : isEditMode 
                    ? 'Actualizar Vehículo' 
                    : 'Guardar Vehículo'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default VehicleForm;
