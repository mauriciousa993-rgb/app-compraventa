import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileDown, Search, X } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import { creditAPI } from '../services/api';
import { ListadoSolicitudes, SolicitudResumen } from '../types/credit';
import {
  ESTADOS_SOLICITUD,
  fechaCorta,
  formatoMiles,
  getEstadoSolicitud,
} from '../constants/creditOptions';

const EtiquetaEstado: React.FC<{ estado: string }> = ({ estado }) => {
  const e = getEstadoSolicitud(estado);
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${e.badge}`}>
      {e.texto}
    </span>
  );
};

const CreditApplications: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const estado = searchParams.get('estado') || '';
  const q = searchParams.get('q') || '';
  const pagina = Math.max(1, Number(searchParams.get('pagina')) || 1);

  const [datos, setDatos] = useState<ListadoSolicitudes | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState(q);
  const [descargando, setDescargando] = useState<string | null>(null);

  useEffect(() => {
    setBusqueda(q);
  }, [q]);

  const cargar = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const respuesta = await creditAPI.list({ q, estado, pagina });
      setDatos(respuesta);
    } catch (err: any) {
      console.error('Error al cargar las solicitudes de credito:', err);
      setError(
        err.response?.data?.message ||
          'No se pudieron cargar las solicitudes de crédito. Revisa la conexión con el servidor.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [q, estado, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizarFiltros = (cambios: Record<string, string>) => {
    const siguiente: Record<string, string> = { q, estado, pagina: '1' };
    Object.assign(siguiente, cambios);

    const limpio: Record<string, string> = {};
    Object.entries(siguiente).forEach(([clave, valor]) => {
      if (valor && !(clave === 'pagina' && valor === '1')) limpio[clave] = valor;
    });

    setSearchParams(limpio);
  };

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    actualizarFiltros({ q: busqueda.trim() });
  };

  const handleExportar = async () => {
    try {
      await creditAPI.exportCsv(estado || undefined);
    } catch (err: any) {
      console.error('Error al exportar solicitudes:', err);
      alert(err.response?.data?.message || 'No se pudo exportar el listado');
    }
  };

  const handleZip = async (solicitud: SolicitudResumen) => {
    setDescargando(solicitud.id);
    try {
      await creditAPI.downloadZip(solicitud.id, solicitud.radicado);
    } catch (err: any) {
      console.error('Error al descargar el ZIP:', err);
      alert(err.response?.data?.message || 'No se pudo descargar el ZIP de la solicitud');
    } finally {
      setDescargando(null);
    }
  };

  const conteos = datos?.conteos || {};
  const solicitudes = datos?.solicitudes || [];
  const total = datos?.total || 0;
  const paginas = datos?.paginas || 1;

  return (
    <Layout>
      <div className="mb-6">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">Solicitudes de Crédito</h1>
            <p className="text-sm text-ink-200">
              Solicitudes que llegan del formulario público, con su PDF firmado y soportes.
            </p>
          </div>
          <button
            onClick={handleExportar}
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <FileDown className="h-5 w-5" />
            Exportar Excel (CSV)
          </button>
        </div>

        {/* Resumen por estado */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {ESTADOS_SOLICITUD.map((e) => {
            const activo = estado === e.valor;
            return (
              <button
                key={e.valor}
                onClick={() => actualizarFiltros({ estado: activo ? '' : e.valor })}
                className={`card transition-all ${activo ? e.cardActiva : e.card}`}
              >
                <p className="text-2xl font-bold text-white">{conteos[e.valor] ?? 0}</p>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink-200">
                  {e.texto}
                </p>
              </button>
            );
          })}
        </div>

        {/* Búsqueda */}
        <form onSubmit={handleBuscar} className="card mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-ink-300" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, cédula, radicado o celular..."
                  className="input-field pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">
                Buscar
              </button>
              {(q || estado) && (
                <button
                  type="button"
                  onClick={() => setSearchParams({})}
                  className="flex items-center gap-1 rounded-lg px-3 text-xs text-primary-300 transition-colors hover:text-primary-200"
                >
                  <X className="h-3 w-3" />
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary-500"></div>
            <p className="mt-4 text-ink-200">Cargando solicitudes...</p>
          </div>
        </div>
      ) : error ? (
        <div className="card border-primary-700/60 bg-[#2a1114] text-center">
          <p className="text-primary-200">{error}</p>
          <button onClick={cargar} className="btn-secondary mt-4">
            Reintentar
          </button>
        </div>
      ) : solicitudes.length === 0 ? (
        <div className="card py-12 text-center">
          <h3 className="mb-2 text-lg font-medium text-white">
            {q || estado ? 'Ninguna solicitud coincide con la búsqueda' : 'Todavía no hay solicitudes'}
          </h3>
          <p className="text-ink-200">
            {q || estado
              ? 'Prueba con otro filtro o limpia la búsqueda'
              : 'Las solicitudes aparecen aquí apenas el cliente envía el formulario'}
          </p>
        </div>
      ) : (
        <>
          {/* Tarjetas en móvil */}
          <div className="space-y-3 lg:hidden">
            {solicitudes.map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/credit-applications/${s.id}`)}
                className="card cursor-pointer transition-all hover:border-primary-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-white">{s.nombre}</h3>
                    <p className="text-xs text-ink-300">
                      {s.tipo_documento} {formatoMiles(s.numero_documento)} · {s.celular}
                    </p>
                  </div>
                  <EtiquetaEstado estado={s.estado} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-ink-200">{s.vehiculo || 'Sin vehículo'}</span>
                  <span className="font-semibold text-white">
                    {s.total_financiar ? `$ ${formatoMiles(s.total_financiar)}` : '—'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-ink-300">
                  {fechaCorta(s.creado_en)} · {s.radicado}
                </p>
              </div>
            ))}
          </div>

          {/* Tabla en escritorio */}
          <div className="hidden overflow-x-auto rounded-xl border border-[#30343d] bg-[#1c1f26] lg:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#16181d] text-[11px] uppercase tracking-wide text-ink-300">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Solicitante</th>
                  <th className="px-4 py-3 font-semibold">Documento</th>
                  <th className="px-4 py-3 font-semibold">Celular</th>
                  <th className="px-4 py-3 font-semibold">Ocupación</th>
                  <th className="px-4 py-3 font-semibold">Vehículo</th>
                  <th className="px-4 py-3 text-right font-semibold">A financiar</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d34]">
                {solicitudes.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-[#23262d]">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-200">
                      {fechaCorta(s.creado_en)}
                      <span className="block text-[11px] text-ink-300">{s.radicado}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/credit-applications/${s.id}`)}
                        className="font-semibold text-white hover:underline"
                      >
                        {s.nombre}
                      </button>
                      <span className="block text-[11px] text-ink-300">{s.ciudad}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-100">
                      {s.tipo_documento} {formatoMiles(s.numero_documento)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-100">{s.celular}</td>
                    <td className="px-4 py-3 text-ink-100">{s.ocupacion}</td>
                    <td className="px-4 py-3 text-ink-100">{s.vehiculo || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-white">
                      {s.total_financiar ? `$ ${formatoMiles(s.total_financiar)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <EtiquetaEstado estado={s.estado} />
                      {s.correo_error && (
                        <span
                          className="ml-1 text-primary-300"
                          title={`El aviso por correo falló: ${s.correo_error}`}
                        >
                          ✉!
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => handleZip(s)}
                        disabled={descargando === s.id}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#8fd5e5] transition-colors hover:bg-[#16242c] disabled:opacity-50"
                        title="Descargar PDF firmado + documentos"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {descargando === s.id ? '...' : 'ZIP'}
                      </button>
                      <button
                        onClick={() => navigate(`/credit-applications/${s.id}`)}
                        className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink-100 transition-colors hover:bg-[#2a2d34]"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="mt-4 flex items-center justify-between text-[13px] text-ink-200">
            <span>
              {total} solicitud{total === 1 ? '' : 'es'}
              {q || estado ? ' (filtradas)' : ''}
            </span>
            {paginas > 1 && (
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => actualizarFiltros({ pagina: String(n) })}
                    className={`rounded-lg px-3 py-1.5 ${
                      n === pagina ? 'bg-primary-500 text-white' : 'hover:bg-[#2a2d34]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
};

export default CreditApplications;
