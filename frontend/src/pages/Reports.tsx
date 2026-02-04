import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Calendar, FileDown } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import api from '../services/api';

interface MonthlyReport {
  mes: string;
  año: number;
  totalVentas: number;
  totalGastos: number;
  utilidad: number;
  cantidadVehiculos: number;
  vehiculos: Array<{
    marca: string;
    modelo: string;
    año: number;
    placa: string;
    precioVenta: number;
    precioCompra: number;
    gastosTotal: number;
    utilidad: number;
    fechaVenta: string;
  }>;
}

const Reports: React.FC = () => {
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  useEffect(() => {
    loadReports();
  }, [selectedYear]);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(`/vehicles/reports/monthly?year=${selectedYear}`);
      setReports(response.data);
    } catch (error) {
      console.error('Error al cargar reportes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getYears = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i >= currentYear - 5; i--) {
      years.push(i);
    }
    return years;
  };

  const filteredReports = selectedMonth
    ? reports.filter(r => r.mes === selectedMonth)
    : reports;

  const totales = filteredReports.reduce(
    (acc, report) => ({
      ventas: acc.ventas + report.totalVentas,
      gastos: acc.gastos + report.totalGastos,
      utilidad: acc.utilidad + report.utilidad,
      vehiculos: acc.vehiculos + report.cantidadVehiculos,
    }),
    { ventas: 0, gastos: 0, utilidad: 0, vehiculos: 0 }
  );

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <BarChart3 className="h-8 w-8 mr-3 text-primary-600" />
            Informes de Ventas y Gastos
          </h1>
          <p className="mt-2 text-gray-600">
            Análisis mensual de ventas, gastos y utilidades
          </p>
        </div>

        {/* Filtros */}
        <div className="card mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Año
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="input-field"
              >
                {getYears().map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mes (Opcional)
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="input-field"
              >
                <option value="">Todos los meses</option>
                {meses.map((mes) => (
                  <option key={mes} value={mes}>
                    {mes}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  window.location.href = `${api.defaults.baseURL}/vehicles/reports/monthly/export?year=${selectedYear}`;
                }}
                className="btn-primary w-full flex items-center justify-center"
              >
                <FileDown className="h-5 w-5 mr-2" />
                Exportar a Excel
              </button>
            </div>
          </div>
        </div>

        {/* Resumen General */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="card bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Total Ventas</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">
                  {formatCurrency(totales.ventas)}
                </p>
              </div>
              <DollarSign className="h-10 w-10 text-blue-600 opacity-50" />
            </div>
          </div>

          <div className="card bg-red-50 border-red-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Total Gastos</p>
                <p className="text-2xl font-bold text-red-900 mt-1">
                  {formatCurrency(totales.gastos)}
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-red-600 opacity-50" />
            </div>
          </div>

          <div className="card bg-green-50 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Utilidad Total</p>
                <p className="text-2xl font-bold text-green-900 mt-1">
                  {formatCurrency(totales.utilidad)}
                </p>
              </div>
              <BarChart3 className="h-10 w-10 text-green-600 opacity-50" />
            </div>
          </div>

          <div className="card bg-purple-50 border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium">Vehículos Vendidos</p>
                <p className="text-2xl font-bold text-purple-900 mt-1">
                  {totales.vehiculos}
                </p>
              </div>
              <Calendar className="h-10 w-10 text-purple-600 opacity-50" />
            </div>
          </div>
        </div>

        {/* Reportes Mensuales */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Cargando reportes...</p>
            </div>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="card text-center py-12">
            <BarChart3 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">
              No hay ventas registradas para {selectedMonth || 'este año'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredReports.map((report, index) => (
              <div key={index} className="card">
                <div className="border-b border-gray-200 pb-4 mb-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    {report.mes} {report.año}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <p className="text-sm text-gray-600">Ventas</p>
                      <p className="text-lg font-semibold text-blue-600">
                        {formatCurrency(report.totalVentas)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Gastos</p>
                      <p className="text-lg font-semibold text-red-600">
                        {formatCurrency(report.totalGastos)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Utilidad</p>
                      <p className={`text-lg font-semibold ${
                        report.utilidad >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(report.utilidad)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Vehículos</p>
                      <p className="text-lg font-semibold text-purple-600">
                        {report.cantidadVehiculos}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Detalle de vehículos */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Vehículo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Fecha Venta
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Precio Venta
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Costo Total
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Utilidad
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {report.vehiculos.map((vehiculo, vIndex) => (
                        <tr key={vIndex} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {vehiculo.marca} {vehiculo.modelo}
                            </div>
                            <div className="text-sm text-gray-500">
                              {vehiculo.año} • {vehiculo.placa}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {new Date(vehiculo.fechaVenta).toLocaleDateString('es-CO')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-blue-600">
                            {formatCurrency(vehiculo.precioVenta)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                            {formatCurrency(vehiculo.precioCompra + vehiculo.gastosTotal)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                            <span className={`font-semibold ${
                              vehiculo.utilidad >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatCurrency(vehiculo.utilidad)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Reports;
