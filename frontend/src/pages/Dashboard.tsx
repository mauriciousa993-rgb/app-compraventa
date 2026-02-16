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
      console.error('Error al cargar estadisticas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
            <p className="mt-4 text-ink-200">Cargando estadisticas...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const statCards = [
    {
      title: 'Total Vehiculos',
      value: stats?.totalVehiculos || 0,
      icon: Car,
      iconColor: 'text-primary-400',
      iconBg: 'bg-[#2a1114]',
      valueColor: 'text-white',
      clickable: true,
      estado: undefined,
    },
    {
      title: 'Listos para Venta',
      value: stats?.vehiculosListos || 0,
      icon: CheckCircle,
      iconColor: 'text-silver',
      iconBg: 'bg-[#1f252c]',
      valueColor: 'text-white',
      clickable: true,
      estado: 'listo_venta',
    },
    {
      title: 'En Proceso',
      value: stats?.vehiculosPendientes || 0,
      icon: Clock,
      iconColor: 'text-[#f4c26b]',
      iconBg: 'bg-[#2b2116]',
      valueColor: 'text-white',
      clickable: true,
      estado: 'en_proceso',
    },
    {
      title: 'Vendidos',
      value: stats?.vehiculosVendidos || 0,
      icon: TrendingUp,
      iconColor: 'text-signal',
      iconBg: 'bg-[#341418]',
      valueColor: 'text-signal',
      clickable: true,
      estado: 'vendido',
    },
    {
      title: 'Valor Inventario',
      value: `$${(stats?.valorInventario || 0).toLocaleString('es-CO')}`,
      icon: Package,
      iconColor: 'text-[#83b3e5]',
      iconBg: 'bg-[#17212f]',
      valueColor: 'text-white',
      clickable: false,
    },
    {
      title: 'Total de Gastos',
      value: `$${(stats?.totalGastos || 0).toLocaleString('es-CO')}`,
      icon: AlertTriangle,
      iconColor: 'text-[#ff8b4a]',
      iconBg: 'bg-[#2c1b14]',
      valueColor: 'text-white',
      clickable: false,
    },
    {
      title: 'Ganancias Estimadas',
      value: `$${(stats?.gananciasEstimadas || 0).toLocaleString('es-CO')}`,
      icon: DollarSign,
      iconColor: 'text-[#7be0aa]',
      iconBg: 'bg-[#16251f]',
      valueColor: 'text-white',
      clickable: false,
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-ink-200 mt-1">Resumen general del inventario de vehiculos</p>
          </div>
          <Link to="/vehicles/new" className="btn-primary inline-flex items-center justify-center">
            + Nuevo Vehiculo
          </Link>
        </div>

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
                    ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0 w-full text-left'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-200">{stat.title}</p>
                    <p className={`text-3xl font-bold mt-2 ${stat.valueColor}`}>{stat.value}</p>
                    {stat.clickable && <p className="text-xs text-ink-300 mt-1">Click para ver detalles</p>}
                  </div>
                  <div className={`${stat.iconBg} p-3 rounded-xl border border-[#30333a]`}>
                    <Icon className={`h-8 w-8 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardWrapper>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-xl font-bold text-white mb-4">Accesos Rapidos</h2>
            <div className="space-y-3">
              <Link
                to="/vehicles?estado=listo_venta"
                className="flex items-center justify-between p-3 rounded-lg border border-[#32353d] bg-[#1b2027] hover:border-[#59606b] transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-silver" />
                  <span className="font-medium text-ink-100">Ver Vehiculos Listos</span>
                </div>
                <span className="text-silver font-bold">{stats?.vehiculosListos || 0}</span>
              </Link>

              <Link
                to="/vehicles?estado=en_proceso"
                className="flex items-center justify-between p-3 rounded-lg border border-[#3f3223] bg-[#221b13] hover:border-[#7b6242] transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="h-5 w-5 text-[#f4c26b]" />
                  <span className="font-medium text-ink-100">Ver Vehiculos Pendientes</span>
                </div>
                <span className="text-[#f4c26b] font-bold">{stats?.vehiculosPendientes || 0}</span>
              </Link>

              <Link
                to="/vehicles/new"
                className="flex items-center justify-between p-3 rounded-lg border border-primary-700 bg-[#2b1215] hover:bg-[#32161a] hover:border-primary-500 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Car className="h-5 w-5 text-primary-400" />
                  <span className="font-medium text-white">Registrar Nuevo Vehiculo</span>
                </div>
              </Link>

              <Link
                to="/marketplace"
                className="flex items-center justify-between p-3 rounded-lg border border-[#27354a] bg-[#121f2d] hover:border-[#3f5573] transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#83b3e5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="font-medium text-ink-100">Ver Marketplace Publico</span>
                </div>
              </Link>
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl font-bold text-white mb-4">Resumen Financiero</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#31353d] bg-[#1a1d23]">
                <span className="text-ink-200">Vehiculos en Stock</span>
                <span className="font-bold text-white">{stats?.vehiculosEnStock || 0}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#27354a] bg-[#121f2d]">
                <span className="text-ink-200">Valor Total Inventario</span>
                <span className="font-bold text-[#83b3e5]">${(stats?.valorInventario || 0).toLocaleString('es-CO')}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#214333] bg-[#10261d]">
                <span className="text-ink-200">Ganancias Estimadas</span>
                <span className="font-bold text-[#7be0aa]">${(stats?.gananciasEstimadas || 0).toLocaleString('es-CO')}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-primary-800 bg-[#2b1215]">
                <span className="text-ink-200">Ganancias Reales</span>
                <span className="font-bold text-signal">${(stats?.gananciasReales || 0).toLocaleString('es-CO')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;