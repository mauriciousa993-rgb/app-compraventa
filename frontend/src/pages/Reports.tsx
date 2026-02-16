import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Calendar,
  FileDown,
  Package,
  Wallet,
  ClipboardList,
  Gauge,
  Receipt,
} from 'lucide-react';
import Layout from '../components/Layout/Layout';
import api from '../services/api';

interface MonthlyVehicle {
  marca: string;
  modelo: string;
  anio?: number;
  ['año']?: number;
  ['aÃ±o']?: number;
  placa: string;
  precioVenta: number;
  precioCompra: number;
  gastosTotal: number;
  costoTotal?: number;
  utilidad: number;
  fechaVenta: string;
}

interface MonthlyReport {
  mes: string;
  anio?: number;
  ['año']?: number;
  ['aÃ±o']?: number;
  totalVentas: number;
  totalCostosVenta?: number;
  totalGastosFijos?: number;
  totalGastos: number;
  utilidadBruta?: number;
  utilidad: number;
  cantidadVehiculos: number;
  ticketPromedio?: number;
  margenNeto?: number;
  vehiculos: MonthlyVehicle[];
}

type TemplateType =
  | 'inventario'
  | 'ventas'
  | 'gastos'
  | 'flujo-caja'
  | 'kpi-gerencial'
  | 'cuentas-cobrar-pagar';

const REPORT_TEMPLATES: Array<{
  id: TemplateType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'inventario',
    title: 'Inventario Maestro',
    description: 'Control por unidad, costos, estado, dias en inventario y responsable.',
    icon: Package,
  },
  {
    id: 'ventas',
    title: 'Registro de Ventas',
    description: 'Seguimiento comercial por canal, asesor, comision y utilidad neta.',
    icon: FileDown,
  },
  {
    id: 'gastos',
    title: 'Control de Gastos',
    description: 'Gastos fijos y variables por centro de costo con aprobaciones.',
    icon: ClipboardList,
  },
  {
    id: 'flujo-caja',
    title: 'Flujo de Caja',
    description: 'Liquidez semanal con saldo, meta minima y desviacion.',
    icon: Wallet,
  },
  {
    id: 'kpi-gerencial',
    title: 'KPI Gerencial',
    description: 'Indicadores clave para direccion: rotacion, margen, cumplimiento.',
    icon: Gauge,
  },
  {
    id: 'cuentas-cobrar-pagar',
    title: 'CxC / CxP',
    description: 'Cuentas por cobrar y pagar con vencimientos y responsables.',
    icon: Receipt,
  },
];

const Reports: React.FC = () => {
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [downloadingTemplate, setDownloadingTemplate] = useState<TemplateType | ''>('');
  const [isExportingReport, setIsExportingReport] = useState(false);

  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  useEffect(() => {
    loadReports();
  }, [selectedYear]);

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(`/vehicles/reports/monthly?year=${selectedYear}`);
      setReports(response.data || []);
    } catch (error) {
      console.error('Error al cargar reportes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);

  const getYears = () => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = currentYear; i >= currentYear - 8; i -= 1) {
      years.push(i);
    }
    return years;
  };

  const filteredReports = useMemo(
    () => (selectedMonth ? reports.filter((r) => r.mes === selectedMonth) : reports),
    [reports, selectedMonth]
  );

  const totales = useMemo(
    () =>
      filteredReports.reduce(
        (acc, report) => ({
          ventas: acc.ventas + (report.totalVentas || 0),
          costosVenta: acc.costosVenta + (report.totalCostosVenta || 0),
          gastosFijos: acc.gastosFijos + (report.totalGastosFijos || 0),
          gastos: acc.gastos + (report.totalGastos || 0),
          utilidadBruta: acc.utilidadBruta + (report.utilidadBruta || 0),
          utilidad: acc.utilidad + (report.utilidad || 0),
          vehiculos: acc.vehiculos + (report.cantidadVehiculos || 0),
        }),
        { ventas: 0, costosVenta: 0, gastosFijos: 0, gastos: 0, utilidadBruta: 0, utilidad: 0, vehiculos: 0 }
      ),
    [filteredReports]
  );

  const getReportYear = (report: MonthlyReport): number | string => {
    return report['año'] ?? report.anio ?? report['aÃ±o'] ?? '';
  };

  const getVehicleYear = (vehicle: MonthlyVehicle): number | string => {
    return vehicle['año'] ?? vehicle.anio ?? vehicle['aÃ±o'] ?? '';
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const exportMonthlyReport = async () => {
    setIsExportingReport(true);
    try {
      const monthParam = selectedMonth ? `&month=${encodeURIComponent(selectedMonth)}` : '';
      const response = await api.get(`/vehicles/reports/monthly/export?year=${selectedYear}${monthParam}`, {
        responseType: 'blob',
      });
      downloadBlob(response.data, `reporte-ejecutivo-${selectedYear}-${Date.now()}.xlsx`);
    } catch (error) {
      console.error('Error al exportar reporte:', error);
      alert('Error al exportar el reporte mensual.');
    } finally {
      setIsExportingReport(false);
    }
  };

  const exportTemplate = async (template: TemplateType) => {
    setDownloadingTemplate(template);
    try {
      const monthParam = selectedMonth ? `&month=${encodeURIComponent(selectedMonth)}` : '';
      const response = await api.get(`/vehicles/reports/templates/${template}?year=${selectedYear}${monthParam}`, {
        responseType: 'blob',
      });
      downloadBlob(response.data, `plantilla-${template}-${Date.now()}.xlsx`);
    } catch (error) {
      console.error('Error al exportar plantilla:', error);
      alert('No fue posible descargar la plantilla.');
    } finally {
      setDownloadingTemplate('');
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary-400" />
            Informes de Ventas y Gastos
          </h1>
          <p className="mt-2 text-ink-200">
            Analisis mensual con ventas, costos de vehiculos, gastos fijos y utilidad neta.
          </p>
        </div>

        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-100 mb-1">Ano</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="input-field"
              >
                {getYears().map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-100 mb-1">Mes (Opcional)</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="input-field"
              >
                <option value="">Todos los meses</option>
                {meses.map((mes) => (
                  <option key={mes} value={mes}>{mes}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={exportMonthlyReport}
                disabled={isExportingReport}
                className="btn-primary w-full flex items-center justify-center disabled:opacity-60"
              >
                <FileDown className="h-5 w-5 mr-2" />
                {isExportingReport ? 'Exportando...' : 'Exportar Reporte Ejecutivo'}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Plantillas Profesionales</h2>
            <span className="text-xs text-ink-300">Descarga directa en Excel</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {REPORT_TEMPLATES.map((template) => {
              const Icon = template.icon;
              const isDownloading = downloadingTemplate === template.id;
              return (
                <div key={template.id} className="rounded-xl border border-[#30343d] bg-[#17191f] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-white font-semibold">{template.title}</p>
                      <p className="text-sm text-ink-300 mt-1">{template.description}</p>
                    </div>
                    <Icon className="h-5 w-5 text-primary-400 flex-shrink-0" />
                  </div>
                  <button
                    onClick={() => exportTemplate(template.id)}
                    disabled={isDownloading}
                    className="mt-4 w-full btn-secondary disabled:opacity-60 flex items-center justify-center"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    {isDownloading ? 'Descargando...' : 'Descargar plantilla'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card border-[#304669] bg-[#162235]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#9bb6de] font-medium">Total Ventas</p>
                <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totales.ventas)}</p>
              </div>
              <DollarSign className="h-10 w-10 text-[#9bb6de] opacity-80" />
            </div>
          </div>

          <div className="card border-[#4f2b30] bg-[#2a1518]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-primary-300 font-medium">Costos Venta + Fijos</p>
                <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totales.gastos)}</p>
              </div>
              <TrendingUp className="h-10 w-10 text-primary-300 opacity-80" />
            </div>
          </div>

          <div className="card border-[#2e4e40] bg-[#152820]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#8dd6ae] font-medium">Utilidad Neta</p>
                <p className="text-2xl font-bold text-white mt-1">{formatCurrency(totales.utilidad)}</p>
              </div>
              <BarChart3 className="h-10 w-10 text-[#8dd6ae] opacity-80" />
            </div>
          </div>

          <div className="card border-[#3f3554] bg-[#201a2e]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#bca8ed] font-medium">Vehiculos Vendidos</p>
                <p className="text-2xl font-bold text-white mt-1">{totales.vehiculos}</p>
              </div>
              <Calendar className="h-10 w-10 text-[#bca8ed] opacity-80" />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
              <p className="mt-4 text-ink-200">Cargando reportes...</p>
            </div>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="card text-center py-12">
            <BarChart3 className="h-16 w-16 text-ink-300 mx-auto mb-4" />
            <p className="text-ink-200 text-lg">No hay movimientos registrados para este filtro.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredReports.map((report, index) => (
              <div key={`${report.mes}-${index}`} className="card">
                <div className="border-b border-[#32353d] pb-4 mb-4">
                  <h2 className="text-xl font-bold text-white">{report.mes} {getReportYear(report)}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-4">
                    <div>
                      <p className="text-sm text-ink-300">Ventas</p>
                      <p className="text-lg font-semibold text-[#9bb6de]">{formatCurrency(report.totalVentas)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-300">Costos de Venta</p>
                      <p className="text-lg font-semibold text-primary-300">
                        {formatCurrency(report.totalCostosVenta || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-300">Gastos Fijos</p>
                      <p className="text-lg font-semibold text-primary-300">
                        {formatCurrency(report.totalGastosFijos || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-300">Utilidad Neta</p>
                      <p className={`text-lg font-semibold ${report.utilidad >= 0 ? 'text-[#8dd6ae]' : 'text-primary-300'}`}>
                        {formatCurrency(report.utilidad)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-300">Vehiculos</p>
                      <p className="text-lg font-semibold text-[#bca8ed]">{report.cantidadVehiculos}</p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-300">Margen Neto</p>
                      <p className={`text-lg font-semibold ${(report.margenNeto || 0) >= 0 ? 'text-[#8dd6ae]' : 'text-primary-300'}`}>
                        {((report.margenNeto || 0) * 100).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#32353d]">
                    <thead className="bg-[#1a1d23]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ink-300 uppercase">Vehiculo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-ink-300 uppercase">Fecha Venta</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-ink-300 uppercase">Precio Venta</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-ink-300 uppercase">Costo Total</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-ink-300 uppercase">Utilidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#32353d]">
                      {report.vehiculos.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-sm text-ink-300 text-center">
                            No hubo ventas en este mes. Se muestran solo gastos fijos en el resumen superior.
                          </td>
                        </tr>
                      ) : (
                        report.vehiculos.map((vehiculo, vIndex) => (
                          <tr key={`${vehiculo.placa}-${vIndex}`} className="hover:bg-[#1a1d23]">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm font-medium text-white">
                                {vehiculo.marca} {vehiculo.modelo}
                              </div>
                              <div className="text-sm text-ink-300">
                                {getVehicleYear(vehiculo)} - {vehiculo.placa}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-ink-200">
                              {new Date(vehiculo.fechaVenta).toLocaleDateString('es-CO')}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-[#9bb6de]">
                              {formatCurrency(vehiculo.precioVenta)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-ink-200">
                              {formatCurrency(vehiculo.costoTotal || ((vehiculo.precioCompra || 0) + (vehiculo.gastosTotal || 0)))}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <span className={`font-semibold ${vehiculo.utilidad >= 0 ? 'text-[#8dd6ae]' : 'text-primary-300'}`}>
                                {formatCurrency(vehiculo.utilidad)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
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
