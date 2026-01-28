import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Car, Edit, Trash2 } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import api from '../services/api';
import { Vehicle } from '../types';

const VehicleList: React.FC = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');

  useEffect(() => {
    loadVehicles();
  }, []);

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
          <h1 className="text-3xl font-bold text-gray-900 mb-4 md:mb-0">
            Inventario de Vehículos
          </h1>
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
          <div className="card bg-blue-50 border-blue-200">
            <p className="text-sm text-blue-600 font-medium">Total Vehículos</p>
            <p className="text-2xl font-bold text-blue-900">{vehicles.length}</p>
          </div>
          <div className="card bg-green-50 border-green-200">
            <p className="text-sm text-green-600 font-medium">Listos para Venta</p>
            <p className="text-2xl font-bold text-green-900">
              {vehicles.filter(v => v.estado === 'listo_venta').length}
            </p>
          </div>
          <div className="card bg-yellow-50 border-yellow-200">
            <p className="text-sm text-yellow-600 font-medium">Con Pendientes</p>
            <p className="text-2xl font-bold text-yellow-900">
              {vehicles.filter(v => v.estado === 'en_proceso').length}
            </p>
          </div>
          <div className="card bg-purple-50 border-purple-200">
            <p className="text-sm text-purple-600 font-medium">Vendidos</p>
            <p className="text-2xl font-bold text-purple-900">
              {vehicles.filter(v => v.estado === 'vendido').length}
            </p>
          </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVehicles.map((vehicle) => (
            <div key={vehicle._id} className="card hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {vehicle.marca} {vehicle.modelo}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {vehicle.año} • {vehicle.placa}
                  </p>
                </div>
                {getEstadoBadge(vehicle.estado)}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Kilometraje:</span>
                  <span className="font-medium text-gray-900">
                    {vehicle.kilometraje.toLocaleString()} km
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Precio Compra:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(vehicle.precioCompra)}
                  </span>
                </div>
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
                    (vehicle.precioVenta - vehicle.precioCompra - (vehicle.gastos?.total || 0)) >= 0 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {formatCurrency(vehicle.precioVenta - vehicle.precioCompra - (vehicle.gastos?.total || 0))}
                  </span>
                </div>
              </div>

              <div className="border-t pt-3 flex justify-between items-center">
                <div className="flex space-x-2">
                  {vehicle.documentacion?.prenda?.tiene && (
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                      Prenda
                    </span>
                  )}
                  {vehicle.documentacion?.soat?.tiene && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      SOAT
                    </span>
                  )}
                  {vehicle.documentacion?.tecnomecanica?.tiene && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Tecno
                    </span>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => navigate(`/vehicles/${vehicle._id}/edit`)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(vehicle._id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
};

export default VehicleList;
