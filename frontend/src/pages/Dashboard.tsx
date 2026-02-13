import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout/Layout';
import { vehiclesAPI } from '../services/api';
import { Statistics } from '../types';
import {
  Car,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Package,
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStatistics();
  }, []);

  const handleCardClick = (estado?: string) => {
    if (estado) {
      navigate(`/vehicles?estado=${estado}`);
    } else {
      navigate('/vehicles');
    }
  };

  const loadStatistics = async () => {
    try {
      const data = await vehiclesAPI.getStatistics();
      setStats(data);
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando estadísticas...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const statCards = [
    {
      title: 'Total Vehículos',
      value: stats?.totalVehiculos || 0,
      icon: Car,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      clickable: true,
      estado: undefined,
    },
    {
      title: 'Listos para Venta',
      value: stats?.vehiculosListos || 0,
      icon: CheckCircle,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50',
      clickable: true,
      estado: 'listo_venta',
    },
    {
      title: 'En Proceso',
      value: stats?.vehiculosPendientes || 0,
      icon: Clock,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      clickable: true,
      estado: 'en_proceso',
    },
    {
      title: 'Vendidos',
      value: stats?.vehiculosVendidos || 0,
      icon: TrendingUp,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
      clickable: true,
      estado: 'vendido',
    },
    {
      title: 'Valor Inventario',
      value: `$${(stats?.valorInventario || 0).toLocaleString('es-CO')}`,
      icon: Package,
      color: 'bg-indigo-500',
      textColor: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      clickable: false,
    },
    {
      title: 'Total de Gastos',
      value: `$${(stats?.totalGastos || 0).toLocaleString('es-CO')}`,
      icon: AlertTriangle,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
      bgColor: 'bg-orange-50',
      clickable: false,
    },
    {
      title: 'Ganancias Estimadas',
      value: `$${(stats?.gananciasEstimadas || 0).toLocaleString('es-CO')}`,
      icon: DollarSign,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      clickable: false,
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard v2</h1>

            <p className="text-gray-600 mt-1">
              Resumen general del inventario de vehículos
            </p>
          </div>
          <Link to="/vehicles/new" className="btn-primary">
            + Nuevo Vehículo
          </Link>
        </div>

        {/* Tarjetas de estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            const CardWrapper = stat.clickable ? 'button' : 'div';
            
            return (
              <CardWrapper
                key={index}
                onClick={stat.clickable ? () => handleCardClick(stat.estado) : undefined}
                className={`card ${
                  stat.clickable 
                    ? 'cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200 active:scale-100 w-full text-left' 
                    : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {stat.title}
                    </p>
                    <p className={`text-2xl font-bold mt-2 ${stat.textColor}`}>
                      {stat.value}
                    </p>
                    {stat.clickable && (
                      <p className="text-xs text-gray-500 mt-1">
                        Click para ver detalles
                      </p>
                    )}
                  </div>
                  <div className={`${stat.bgColor} p-3 rounded-lg ${stat.clickable ? 'group-hover:scale-110 transition-transform' : ''}`}>
                    <Icon className={`h-8 w-8 ${stat.textColor}`} />
                  </div>
                </div>
              </CardWrapper>
            );
          })}
        </div>

        {/* Accesos rápidos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Accesos Rápidos
            </h2>
            <div className="space-y-3">
              <Link
                to="/vehicles?estado=listo_venta"
                className="flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-gray-900">
                    Ver Vehículos Listos
                  </span>
                </div>
                <span className="text-green-600 font-bold">
                  {stats?.vehiculosListos || 0}
                </span>
              </Link>

              <Link
                to="/vehicles?estado=en_proceso"
                className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span className="font-medium text-gray-900">
                    Ver Vehículos Pendientes
                  </span>
                </div>
                <span className="text-yellow-600 font-bold">
                  {stats?.vehiculosPendientes || 0}
                </span>
              </Link>

              <Link
                to="/vehicles/new"
                className="flex items-center justify-between p-3 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Car className="h-5 w-5 text-primary-600" />
                  <span className="font-medium text-gray-900">
                    Registrar Nuevo Vehículo
                  </span>
                </div>
              </Link>

              <Link
                to="/marketplace"
                className="flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="font-medium text-gray-900">
                    Ver Marketplace Público
                  </span>
                </div>
              </Link>
            </div>

          </div>

          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Resumen Financiero
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">Vehículos en Stock</span>
                <span className="font-bold text-gray-900">
                  {stats?.vehiculosEnStock || 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg">
                <span className="text-gray-700">Valor Total Inventario</span>
                <span className="font-bold text-indigo-600">
                  ${(stats?.valorInventario || 0).toLocaleString('es-CO')}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                <span className="text-gray-700">Ganancias Estimadas</span>
                <span className="font-bold text-emerald-600">
                  ${(stats?.gananciasEstimadas || 0).toLocaleString('es-CO')}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <span className="text-gray-700">Ganancias Reales</span>
                <span className="font-bold text-purple-600">
                  ${(stats?.gananciasReales || 0).toLocaleString('es-CO')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
