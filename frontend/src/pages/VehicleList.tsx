import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Car, Edit, Trash2, FileDown, X, ChevronDown, ChevronUp, FileText, DollarSign, Edit2 } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import api from '../services/api';
import { Vehicle, DatosVenta } from '../types';
import SaleDataModal from '../components/SaleDataModal';
import ViewSaleDataModal from '../components/ViewSaleDataModal';
import { vehiclesAPI } from '../services/api';

const VehicleList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    loadVehicles();
  }, []);

  // Leer parámetros de la URL al cargar
  useEffect(() => {
    const estadoParam = searchParams.get('estado');
    if (estadoParam) {
      setFilterEstado(estadoParam);
    }
  }, [searchParams]);

  useEffect(() => {
    filterVehicles();
  }, [searchTerm, filterEstado, vehicles]);

  const loadVehicles = async () => {
    try {
      const response = await api.get('/vehicles');
      setVehicles(response.data);
    } catch (error) {
      console.error('Error al cargar vehículos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterVehicles = () => {
    let filtered = vehicles;

    // Filtrar por estado
    if (filterEstado !== 'todos') {
      filtered = filtered.filter(v => v.estado === filterEstado);
    }

    // Filtrar por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(v =>
        v.marca.toLowerCase().includes(term) ||
        v.modelo.toLowerCase().includes(term) ||
        v.placa.toLowerCase().includes(term) ||
        v.año.toString().includes(term)
      );
    }

    setFilteredVehicles(filtered);
  };

  const toggleVehicle = (id: string) => {
    const newExpanded = new Set(expandedVehicles);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedVehicles(newExpanded);
  };

  const clearFilters = () => {
    setFilterEstado('todos');
    setSearchTerm('');
    setSearchParams({});
  };

  const getEstadoLabel = (estado: string) => {
    const labels: Record<string, string> = {
      listo_venta: 'Listos para Venta',
      en_proceso: 'En Proceso',
      en_negociacion: 'En Negociación',
      vendido: 'Vendidos',
      retirado: 'Retirados'
    };
    return labels[estado] || estado;
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este vehículo?')) return;

    try {
      await api.delete(`/vehicles/${id}`);
      loadVehicles();
    } catch (error) {
      console.error('Error al eliminar vehículo:', error);
      alert('Error al eliminar el vehículo');
    }
  };

  const handleOpenSaleModal = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setSaleModalOpen(true);
  };

  const handleSaveSaleData = async (data: DatosVenta) => {
    if (!selectedVehicle) return;

    try {
      // Si el vehículo ya está vendido, actualizar; si no, crear
      if (selectedVehicle.estado === 'vendido' && selectedVehicle.datosVenta) {
        await vehiclesAPI.updateSaleData(selectedVehicle._id, data);
        alert('Datos de venta actualizados exitosamente.');
      } else {
        await vehiclesAPI.saveSaleData(selectedVehicle._id, data);
        alert('Datos de venta guardados exitosamente. El vehículo ha sido marcado como vendido.');
      }
      setSaleModalOpen(false);
      setSelectedVehicle(null);
      loadVehicles();
    } catch (error) {
      console.error('Error al guardar datos de venta:', error);
      alert('Error al guardar los datos de venta');
    }
  };

  const handleEditSaleData = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setSaleModalOpen(true);
  };

  const handleGenerateContract = async (vehicleId: string) => {
    try {
      await vehiclesAPI.generateContract(vehicleId);
    } catch (error) {
      console.error('Error al generar contrato:', error);
      alert('Error al generar el contrato. Asegúrate de que el vehículo tenga datos de venta registrados.');
    }
  };

  const getEstadoBadge = (estado: string) => {
    const badges: Record<string, { class: string; text: string }> = {
      en_proceso: { class: 'badge-warning', text: 'En Proceso' },
      listo_venta: { class: 'badge-success', text: 'Listo para Venta' },
      en_negociacion: { class: 'badge-info', text: 'En Negociación' },
      vendido: { class: 'badge-gray', text: 'Vendido' },
      retirado: { class: 'badge-danger', text: 'Retirado' }
    };
    const badge = badges[estado] || badges.en_proceso;
    return <span className={`badge ${badge.class}`}>{badge.text}</span>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando vehículos...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Inventario de Vehículos
            </h1>
            {filterEstado !== 'todos' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  Mostrando: <span className="font-semibold">{getEstadoLabel(filterEstado)}</span>
                </span>
                <button
                  onClick={clearFilters}
                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => navigate('/vehicles/new')}
            className="btn-primary flex items-center justify-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nuevo Vehículo
          </button>
        </div>

        {/* Filtros y Búsqueda */}
        <div className="card mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por marca, modelo, placa o año..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
            </div>
            <div>
              <select
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                className="input-field"
              >
                <option value="todos">Todos los Estados</option>
                <option value="listo_venta">Listos para Venta</option>
                <option value="en_proceso">Con Pendientes</option>
                <option value="en_negociacion">En Negociación</option>
                <option value="vendido">Vendidos</option>
              </select>
            </div>
          </div>
        </div>

        {/* Estadísticas Rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <button
            onClick={() => {
              setFilterEstado('todos');
              setSearchParams({});
            }}
            className={`card transition-all ${
              filterEstado === 'todos'
                ? 'bg-blue-100 border-blue-300 ring-2 ring-blue-500'
                : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
            }`}
          >
            <p className="text-sm text-blue-600 font-medium">Total Vehículos</p>
            <p className="text-2xl font-bold text-blue-900">{vehicles.length}</p>
          </button>
          <button
            onClick={() => {
              setFilterEstado('listo_venta');
              setSearchParams({ estado: 'listo_venta' });
            }}
            className={`card transition-all ${
              filterEstado === 'listo_venta'
                ? 'bg-green-100 border-green-300 ring-2 ring-green-500'
                : 'bg-green-50 border-green-200 hover:bg-green-100'
            }`}
          >
            <p className="text-sm text-green-600 font-medium">Listos para Venta</p>
            <p className="text-2xl font-bold text-green-900">
              {vehicles.filter(v => v.estado === 'listo_venta').length}
            </p>
          </button>
          <button
            onClick={() => {
              setFilterEstado('en_proceso');
              setSearchParams({ estado: 'en_proceso' });
            }}
            className={`card transition-all ${
              filterEstado === 'en_proceso'
                ? 'bg-yellow-100 border-yellow-300 ring-2 ring-yellow-500'
                : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
            }`}
          >
            <p className="text-sm text-yellow-600 font-medium">Con Pendientes</p>
            <p className="text-2xl font-bold text-yellow-900">
              {vehicles.filter(v => v.estado === 'en_proceso').length}
            </p>
          </button>
          <button
            onClick={() => {
              setFilterEstado('vendido');
              setSearchParams({ estado: 'vendido' });
            }}
            className={`card transition-all ${
              filterEstado === 'vendido'
                ? 'bg-purple-100 border-purple-300 ring-2 ring-purple-500'
                : 'bg-purple-50 border-purple-200 hover:bg-purple-100'
            }`}
          >
            <p className="text-sm text-purple-600 font-medium">Vendidos</p>
            <p className="text-2xl font-bold text-purple-900">
              {vehicles.filter(v => v.estado === 'vendido').length}
            </p>
          </button>
        </div>
      </div>

      {/* Lista de Vehículos */}
      {filteredVehicles.length === 0 ? (
        <div className="card text-center py-12">
          <Car className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm || filterEstado !== 'todos' 
              ? 'No se encontraron vehículos' 
              : 'No hay vehículos registrados'}
          </h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || filterEstado !== 'todos'
              ? 'Intenta con otros filtros de búsqueda'
              : 'Comienza agregando tu primer vehículo al inventario'}
          </p>
          {!searchTerm && filterEstado === 'todos' && (
            <button
              onClick={() => navigate('/vehicles/new')}
              className="btn-primary inline-flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Agregar Primer Vehículo
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVehicles.map((vehicle) => {
            const isExpanded = expandedVehicles.has(vehicle._id);
            const utilidad = vehicle.precioVenta - vehicle.precioCompra - (vehicle.gastos?.total || 0);
            
            return (
              <div key={vehicle._id} className="card hover:shadow-md transition-all">
                {/* Encabezado Compacto - Siempre Visible */}
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleVehicle(vehicle._id)}
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {vehicle.marca} {vehicle.modelo}
                        </h3>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          vehicle.estado === 'vendido' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {(() => {
                            const fechaIngreso = new Date(vehicle.fechaIngreso);
                            const fechaFinal = vehicle.estado === 'vendido' && vehicle.fechaVenta 
                              ? new Date(vehicle.fechaVenta) 
                              : new Date();
                            const diasEnVitrina = Math.floor((fechaFinal.getTime() - fechaIngreso.getTime()) / (1000 * 60 * 60 * 24));
                            return vehicle.estado === 'vendido'
                              ? `${diasEnVitrina} día${diasEnVitrina !== 1 ? 's' : ''} en inventario`
                              : `${diasEnVitrina} día${diasEnVitrina !== 1 ? 's' : ''} en vitrina`;
                          })()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {vehicle.año} • <span className="font-medium">{vehicle.placa}</span>
                      </p>
                    </div>
                    <div className="hidden md:flex items-center space-x-4">
                      {getEstadoBadge(vehicle.estado)}
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Precio Venta</p>
                        <p className="text-sm font-semibold text-blue-600">
                          {formatCurrency(vehicle.precioVenta)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Utilidad</p>
                        <p className={`text-sm font-semibold ${
                          utilidad >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(utilidad)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button className="ml-4 p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-600" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-600" />
                    )}
                  </button>
                </div>

                {/* Información Detallada - Desplegable */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                    {/* Información Financiera */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Información Financiera</h4>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Precio Compra:</span>
                          <span className="font-medium text-gray-900">
                            {formatCurrency(vehicle.precioCompra)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Gastos del Vehículo:</span>
                          <span className="font-medium text-blue-600">
                            {formatCurrency((() => {
                              const gastos = vehicle.gastos || {};
                              return (gastos.pintura || 0) + (gastos.mecanica || 0) + (gastos.traspaso || 0) + 
                                     (gastos.alistamiento || 0) + (gastos.tapiceria || 0) + (gastos.transporte || 0) + (gastos.varios || 0);
                            })())}
                          </span>
                        </div>
                        {(() => {
                          const gastosInversionistas = vehicle.inversionistas?.reduce((sum, inv) => {
                            const totalGastosInv = inv.gastos?.reduce((s, g) => s + (g.monto || 0), 0) || 0;
                            return sum + totalGastosInv;
                          }, 0) || 0;
                          
                          return gastosInversionistas > 0 ? (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Gastos de Inversionistas:</span>
                              <span className="font-medium text-orange-600">
                                {formatCurrency(gastosInversionistas)}
                              </span>
                            </div>
                          ) : null;
                        })()}
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Gastos Totales:</span>
                          <span className="font-medium text-orange-600">
                            {formatCurrency(vehicle.gastos?.total || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm border-t pt-2">
                          <span className="text-gray-600 font-semibold">Costo Total:</span>
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(vehicle.precioCompra + (vehicle.gastos?.total || 0))}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Precio Venta:</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(vehicle.precioVenta)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm border-t pt-2">
                          <span className="text-gray-600 font-semibold">Utilidad:</span>
                          <span className={`font-semibold ${
                            utilidad >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(utilidad)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600 font-semibold">Margen de Ganancia:</span>
                          <span className={`font-semibold ${
                            utilidad >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {(() => {
                              const costoTotal = vehicle.precioCompra + (vehicle.gastos?.total || 0);
                              const margen = costoTotal > 0 ? ((utilidad / costoTotal) * 100).toFixed(2) : '0.00';
                              return `${margen}%`;
                            })()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Detalles del Vehículo</h4>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Color:</span>
                          <span className="font-medium text-gray-900">{vehicle.color}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Kilometraje:</span>
                          <span className="font-medium text-gray-900">
                            {vehicle.kilometraje.toLocaleString()} km
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">VIN:</span>
                          <span className="font-medium text-gray-900 text-xs">{vehicle.vin}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Estado:</span>
                          {getEstadoBadge(vehicle.estado)}
                        </div>
                      </div>
                    </div>

                    {/* Desglose de Gastos */}
                    {vehicle.gastos && (vehicle.gastos.pintura > 0 || vehicle.gastos.mecanica > 0 || vehicle.gastos.traspaso > 0 || 
                                        vehicle.gastos.alistamiento > 0 || vehicle.gastos.tapiceria > 0 || vehicle.gastos.transporte > 0 || vehicle.gastos.varios > 0) && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Desglose de Gastos</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {vehicle.gastos.pintura > 0 && (
                            <div className="bg-orange-50 p-2 rounded">
                              <p className="text-xs text-gray-600">Pintura</p>
                              <p className="text-sm font-medium text-orange-600">
                                {formatCurrency(vehicle.gastos.pintura)}
                              </p>
                            </div>
                          )}
                          {vehicle.gastos.mecanica > 0 && (
                            <div className="bg-blue-50 p-2 rounded">
                              <p className="text-xs text-gray-600">Mecánica</p>
                              <p className="text-sm font-medium text-blue-600">
                                {formatCurrency(vehicle.gastos.mecanica)}
                              </p>
                            </div>
                          )}
                          {vehicle.gastos.traspaso > 0 && (
                            <div className="bg-purple-50 p-2 rounded">
                              <p className="text-xs text-gray-600">Traspaso</p>
                              <p className="text-sm font-medium text-purple-600">
                                {formatCurrency(vehicle.gastos.traspaso)}
                              </p>
                            </div>
                          )}
                          {vehicle.gastos.alistamiento > 0 && (
                            <div className="bg-green-50 p-2 rounded">
                              <p className="text-xs text-gray-600">Alistamiento</p>
                              <p className="text-sm font-medium text-green-600">
                                {formatCurrency(vehicle.gastos.alistamiento)}
                              </p>
                            </div>
                          )}
                          {vehicle.gastos.tapiceria > 0 && (
                            <div className="bg-pink-50 p-2 rounded">
                              <p className="text-xs text-gray-600">Tapicería</p>
                              <p className="text-sm font-medium text-pink-600">
                                {formatCurrency(vehicle.gastos.tapiceria)}
                              </p>
                            </div>
                          )}
                          {vehicle.gastos.transporte > 0 && (
                            <div className="bg-cyan-50 p-2 rounded">
                              <p className="text-xs text-gray-600">Transporte</p>
                              <p className="text-sm font-medium text-cyan-600">
                                {formatCurrency(vehicle.gastos.transporte)}
                              </p>
                            </div>
                          )}
                          {vehicle.gastos.varios > 0 && (
                            <div className="bg-gray-50 p-2 rounded">
                              <p className="text-xs text-gray-600">Varios</p>
                              <p className="text-sm font-medium text-gray-600">
                                {formatCurrency(vehicle.gastos.varios)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Documentación */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Documentación</h4>
                      <div className="flex flex-wrap gap-2">
                        {vehicle.documentacion?.prenda?.tiene && (
                          <span className="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full">
                            ⚠️ Prenda
                          </span>
                        )}
                        {vehicle.documentacion?.soat?.tiene && (
                          <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full">
                            ✓ SOAT
                          </span>
                        )}
                        {vehicle.documentacion?.tecnomecanica?.tiene && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                            ✓ Tecnomecánica
                          </span>
                        )}
                        {vehicle.documentacion?.tarjetaPropiedad?.tiene && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-3 py-1 rounded-full">
                            ✓ Tarjeta Propiedad
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Inversionistas */}
                    {vehicle.inversionistas && vehicle.inversionistas.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Inversionistas</h4>
                        <div className="space-y-2">
                          {vehicle.inversionistas.map((inv, idx) => {
                            const totalGastosInv = inv.gastos?.reduce((s, g) => s + (g.monto || 0), 0) || 0;
                            return (
                              <div key={idx} className="bg-indigo-50 p-3 rounded border border-indigo-200">
                                <div className="flex justify-between items-start mb-2">
                                  <span className="text-sm font-medium text-gray-700">{inv.nombre}</span>
                                  <span className="text-sm font-semibold text-indigo-600">
                                    {formatCurrency(inv.montoInversion)}
                                  </span>
                                </div>
                                {totalGastosInv > 0 && (
                                  <div className="mt-2 pt-2 border-t border-indigo-200">
                                    <div className="flex justify-between items-start text-xs mb-2">
                                      <span className="text-gray-600">Total Gastos:</span>
                                      <span className="font-medium text-orange-600">
                                        {formatCurrency(totalGastosInv)}
                                      </span>
                                    </div>
                                    {inv.gastos && inv.gastos.length > 0 && (
                                      <div className="space-y-1">
                                        {inv.gastos.map((gasto, gIdx) => (
                                          <div key={gIdx} className="text-xs text-gray-600 flex justify-between">
                                            <span className="capitalize">{gasto.categoria}:</span>
                                            <span className="font-medium">{formatCurrency(gasto.monto)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Observaciones */}
                    {vehicle.observaciones && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Observaciones</h4>
                        <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                          {vehicle.observaciones}
                        </p>
                      </div>
                    )}

                    {/* Acciones */}
                    <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
                      {/* Botones para vehículos NO vendidos */}
                      {vehicle.estado !== 'vendido' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenSaleModal(vehicle);
                          }}
                          className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <DollarSign className="h-4 w-4" />
                          Vender Vehículo
                        </button>
                      )}
                      
                      {/* Botones para vehículos vendidos */}
                      {vehicle.estado === 'vendido' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditSaleData(vehicle);
                            }}
                            className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
                          >
                            <Edit2 className="h-4 w-4" />
                            Editar Datos de Venta
                          </button>
                          
                          {vehicle.datosVenta && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateContract(vehicle._id);
                              }}
                              className="px-4 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2"
                            >
                              <FileText className="h-4 w-4" />
                              Generar Contrato
                            </button>
                          )}
                        </>
                      )}

                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const response = await api.get(`/vehicles/${vehicle._id}/expenses-template`, {
                              responseType: 'blob'
                            });
                            const url = window.URL.createObjectURL(new Blob([response.data]));
                            const link = document.createElement('a');
                            link.href = url;
                            link.setAttribute('download', `gastos-${vehicle.placa}-${Date.now()}.xlsx`);
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                          } catch (error) {
                            console.error('Error al exportar plantilla:', error);
                            alert('Error al exportar plantilla de gastos');
                          }
                        }}
                        className="px-4 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <FileDown className="h-4 w-4" />
                        Plantilla Gastos
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const response = await api.get(`/vehicles/${vehicle._id}/export`, {
                              responseType: 'blob'
                            });
                            const url = window.URL.createObjectURL(new Blob([response.data]));
                            const link = document.createElement('a');
                            link.href = url;
                            link.setAttribute('download', `vehiculo-${vehicle.placa}-${Date.now()}.xlsx`);
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                          } catch (error) {
                            console.error('Error al exportar:', error);
                            alert('Error al exportar el vehículo');
                          }
                        }}
                        className="px-4 py-2 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <FileDown className="h-4 w-4" />
                        Reporte Completo
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/vehicles/${vehicle._id}/edit`);
                        }}
                        className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Edit className="h-4 w-4" />
                        Editar
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(vehicle._id);
                        }}
                        className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Datos de Venta */}
      {selectedVehicle && (
        <>
          <SaleDataModal
            isOpen={saleModalOpen}
            onClose={() => {
              setSaleModalOpen(false);
              setSelectedVehicle(null);
            }}
            onSubmit={handleSaveSaleData}
            vehiclePlaca={selectedVehicle.placa}
            initialData={selectedVehicle.datosVenta}
            isEditMode={selectedVehicle.estado === 'vendido' && !!selectedVehicle.datosVenta}
          />
        </>
      )}
    </Layout>
  );
};

export default VehicleList;
