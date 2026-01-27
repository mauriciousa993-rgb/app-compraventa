import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Save, Image, X } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import api from '../services/api';

const VehicleForm: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    // Datos básicos
    marca: '',
    modelo: '',
    año: new Date().getFullYear(),
    placa: '',
    vin: '',
    color: '',
    kilometraje: 0,
    
    // Precios
    precioCompra: 0,
    precioVenta: 0,
    
    // Gastos
    gastos: {
      pintura: 0,
      mecanica: 0,
      varios: 0,
      total: 0
    },
    
    // Estado
    estado: 'en_proceso',
    
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

  const [selectedFiles, setSelectedFiles] = useState<{
    exteriores: File[];
    interiores: File[];
    detalles: File[];
    documentos: File[];
  }>({
    exteriores: [],
    interiores: [],
    detalles: [],
    documentos: []
  });

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
    } else if (type === 'number') {
      // Manejar gastos
      if (name.startsWith('gastos.')) {
        const field = name.split('.')[1];
        const numValue = parseFloat(value) || 0;
        setFormData(prev => {
          const newGastos = { ...prev.gastos, [field]: numValue };
          // Calcular total automáticamente
          newGastos.total = newGastos.pintura + newGastos.mecanica + newGastos.varios;
          return { ...prev, gastos: newGastos };
        });
      } else {
        setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
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

  const handleFileChange = (category: 'exteriores' | 'interiores' | 'detalles' | 'documentos', files: FileList | null) => {
    if (!files) return;
    
    const fileArray = Array.from(files);
    setSelectedFiles(prev => ({
      ...prev,
      [category]: [...prev[category], ...fileArray]
    }));
  };

  const removeFile = (category: 'exteriores' | 'interiores' | 'detalles' | 'documentos', index: number) => {
    setSelectedFiles(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Por ahora guardamos sin fotos (la funcionalidad de upload se puede agregar después)
      // Las fotos se pueden subir usando FormData y multer en el backend
      await api.post('/vehicles', formData);
      setSuccess(true);
      setTimeout(() => {
        navigate('/vehicles');
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear vehículo');
    } finally {
      setIsLoading(false);
    }
  };

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
            <h1 className="text-3xl font-bold text-gray-900">Nuevo Vehículo</h1>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            ¡Vehículo creado exitosamente! Redirigiendo...
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
                  VIN
                </label>
                <input
                  type="text"
                  name="vin"
                  value={formData.vin}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="Número de identificación"
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
                  type="number"
                  name="kilometraje"
                  value={formData.kilometraje}
                  onChange={handleChange}
                  className="input-field"
                  min="0"
                  placeholder="0"
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
                  type="number"
                  name="precioCompra"
                  value={formData.precioCompra}
                  onChange={handleChange}
                  className="input-field"
                  required
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio de Venta *
                </label>
                <input
                  type="number"
                  name="precioVenta"
                  value={formData.precioVenta}
                  onChange={handleChange}
                  className="input-field"
                  required
                  min="0"
                  step="0.01"
                  placeholder="0.00"
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
                  type="number"
                  name="gastos.pintura"
                  value={formData.gastos.pintura}
                  onChange={handleChange}
                  className="input-field"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gastos en Mecánica
                </label>
                <input
                  type="number"
                  name="gastos.mecanica"
                  value={formData.gastos.mecanica}
                  onChange={handleChange}
                  className="input-field"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gastos Varios
                </label>
                <input
                  type="number"
                  name="gastos.varios"
                  value={formData.gastos.varios}
                  onChange={handleChange}
                  className="input-field"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
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

          {/* Fotos del Vehículo */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Fotografías del Vehículo</h2>
            <p className="text-sm text-gray-600 mb-4">
              Adjunta fotos del vehículo para tener un registro visual completo
            </p>

            <div className="space-y-6">
              {/* Fotos Exteriores */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Image className="inline h-4 w-4 mr-1" />
                  Fotos Exteriores
                </label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-500" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click para subir</span> o arrastra archivos
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG (MAX. 5MB cada una)</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleFileChange('exteriores', e.target.files)}
                    />
                  </label>
                </div>
                {selectedFiles.exteriores.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFiles.exteriores.map((file, index) => (
                      <div key={index} className="relative bg-blue-50 px-3 py-2 rounded-lg flex items-center">
                        <span className="text-sm text-blue-700">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile('exteriores', index)}
                          className="ml-2 text-red-600 hover:text-red-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fotos Interiores */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Image className="inline h-4 w-4 mr-1" />
                  Fotos Interiores
                </label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-500" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click para subir</span> o arrastra archivos
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG (MAX. 5MB cada una)</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleFileChange('interiores', e.target.files)}
                    />
                  </label>
                </div>
                {selectedFiles.interiores.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFiles.interiores.map((file, index) => (
                      <div key={index} className="relative bg-blue-50 px-3 py-2 rounded-lg flex items-center">
                        <span className="text-sm text-blue-700">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile('interiores', index)}
                          className="ml-2 text-red-600 hover:text-red-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fotos de Detalles/Daños */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Image className="inline h-4 w-4 mr-1" />
                  Fotos de Detalles/Daños
                </label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-500" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click para subir</span> o arrastra archivos
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG (MAX. 5MB cada una)</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleFileChange('detalles', e.target.files)}
                    />
                  </label>
                </div>
                {selectedFiles.detalles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFiles.detalles.map((file, index) => (
                      <div key={index} className="relative bg-blue-50 px-3 py-2 rounded-lg flex items-center">
                        <span className="text-sm text-blue-700">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile('detalles', index)}
                          className="ml-2 text-red-600 hover:text-red-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fotos de Documentos */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Image className="inline h-4 w-4 mr-1" />
                  Fotos de Documentos
                </label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2 text-gray-500" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click para subir</span> o arrastra archivos
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG, PDF (MAX. 5MB cada una)</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => handleFileChange('documentos', e.target.files)}
                    />
                  </label>
                </div>
                {selectedFiles.documentos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFiles.documentos.map((file, index) => (
                      <div key={index} className="relative bg-blue-50 px-3 py-2 rounded-lg flex items-center">
                        <span className="text-sm text-blue-700">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile('documentos', index)}
                          className="ml-2 text-red-600 hover:text-red-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Nota:</strong> Las fotos se guardarán cuando completes el registro del vehículo. 
                Total de fotos seleccionadas: {
                  selectedFiles.exteriores.length + 
                  selectedFiles.interiores.length + 
                  selectedFiles.detalles.length + 
                  selectedFiles.documentos.length
                }
              </p>
            </div>
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
              {isLoading ? 'Guardando...' : success ? '¡Guardado!' : 'Guardar Vehículo'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default VehicleForm;
