import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Trash2 } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import { creditAPI } from '../services/api';
import { DocumentoSolicitud, EstadoSolicitud, SolicitudCompleta } from '../types/credit';
import {
  ESTADOS_SOLICITUD,
  ETIQUETA_DOCUMENTO,
  TIPO_DOCUMENTO_LABEL,
  fechaLarga,
  formatoMiles,
  formatoPeso,
  getEstadoSolicitud,
} from '../constants/creditOptions';

/* ------------------------------------------------------------------ *
 * Piezas de presentación
 * ------------------------------------------------------------------ */

const Bloque: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="card">
    <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-primary-300">
      {titulo}
    </h2>
    {children}
  </section>
);

const Rejilla: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid gap-x-6 sm:grid-cols-2">{children}</div>
);

const Dato: React.FC<{ k: string; v?: string | null; destacado?: boolean }> = ({
  k,
  v,
  destacado,
}) => {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-[#2a2d34] py-1.5 last:border-0">
      <dt className="text-[13px] text-ink-300">{k}</dt>
      <dd
        className={`text-right text-[13px] ${
          destacado ? 'font-semibold text-primary-300' : 'text-ink-100'
        }`}
      >
        {v}
      </dd>
    </div>
  );
};

const EtiquetaEstado: React.FC<{ estado: string }> = ({ estado }) => {
  const e = getEstadoSolicitud(estado);
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${e.badge}`}
    >
      {e.texto}
    </span>
  );
};

/* ------------------------------------------------------------------ *
 * Utilidades sobre el JSON de la solicitud
 * ------------------------------------------------------------------ */

const valor = (x: unknown): string => {
  if (x === null || x === undefined) return '';
  if (typeof x === 'boolean') return x ? 'Sí' : 'No';
  return String(x).trim();
};

const fechaPartida = (f: unknown): string => {
  const o = (f ?? {}) as { dia?: string; mes?: string; anio?: string };
  return [o.dia, o.mes, o.anio].filter(Boolean).join('/');
};

const siNo = (b: unknown, detalle?: string): string => {
  if (b !== true) return 'No';
  return detalle ? `Sí — ${detalle}` : 'Sí';
};

/* ------------------------------------------------------------------ */

const CreditApplicationDetail: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [solicitud, setSolicitud] = useState<SolicitudCompleta | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoSolicitud[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [notas, setNotas] = useState('');
  const [estadoNotas, setEstadoNotas] = useState<'' | 'guardando' | 'ok'>('');
  const [guardandoEstado, setGuardandoEstado] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [descargando, setDescargando] = useState(false);

  const cargar = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { solicitud: s, documentos: docs } = await creditAPI.getById(id);
      setSolicitud(s);
      setDocumentos(docs || []);
      setNotas(s.notas || '');
    } catch (err: any) {
      console.error('Error al cargar la solicitud:', err);
      setError(err.response?.data?.message || 'No se pudo cargar la solicitud');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarEstado = async (nuevo: EstadoSolicitud) => {
    if (!solicitud) return;
    const anterior = solicitud.estado;

    setSolicitud({ ...solicitud, estado: nuevo });
    setGuardandoEstado(true);
    try {
      await creditAPI.update(solicitud.id, { estado: nuevo });
    } catch (err: any) {
      console.error('Error al cambiar el estado:', err);
      setSolicitud({ ...solicitud, estado: anterior });
      alert(err.response?.data?.message || 'No se pudo cambiar el estado');
    } finally {
      setGuardandoEstado(false);
    }
  };

  // Las notas se guardan al salir del campo, igual que en el panel anterior
  const guardarNotas = async () => {
    if (!solicitud || notas === (solicitud.notas || '')) return;

    setEstadoNotas('guardando');
    try {
      await creditAPI.update(solicitud.id, { notas });
      setSolicitud({ ...solicitud, notas });
      setEstadoNotas('ok');
      setTimeout(() => setEstadoNotas(''), 1500);
    } catch (err: any) {
      console.error('Error al guardar las notas:', err);
      setEstadoNotas('');
      alert(err.response?.data?.message || 'No se pudieron guardar las notas');
    }
  };

  const eliminar = async () => {
    if (!solicitud) return;
    if (
      !window.confirm(
        `¿Eliminar definitivamente la solicitud ${solicitud.radicado} y todos sus archivos?`
      )
    ) {
      return;
    }

    setEliminando(true);
    try {
      await creditAPI.remove(solicitud.id);
      navigate('/credit-applications');
    } catch (err: any) {
      console.error('Error al eliminar la solicitud:', err);
      setEliminando(false);
      alert(err.response?.data?.message || 'No se pudo eliminar la solicitud');
    }
  };

  const abrirArchivo = async (path?: string, nombre?: string) => {
    if (!solicitud) return;
    try {
      await creditAPI.openFile(solicitud.id, path, nombre);
    } catch (err: any) {
      console.error('Error al abrir el archivo:', err);
      alert(err.response?.data?.message || 'No se pudo abrir el archivo');
    }
  };

  const descargarZip = async () => {
    if (!solicitud) return;
    setDescargando(true);
    try {
      await creditAPI.downloadZip(solicitud.id, solicitud.radicado);
    } catch (err: any) {
      console.error('Error al descargar el ZIP:', err);
      alert(err.response?.data?.message || 'No se pudo descargar el ZIP');
    } finally {
      setDescargando(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary-500"></div>
            <p className="mt-4 text-ink-200">Cargando solicitud...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !solicitud) {
    return (
      <Layout>
        <div className="card py-12 text-center">
          <p className="text-primary-200">{error || 'Solicitud no encontrada'}</p>
          <button onClick={() => navigate('/credit-applications')} className="btn-secondary mt-4">
            Volver al listado
          </button>
        </div>
      </Layout>
    );
  }

  const s = solicitud;
  const d = (s.datos || {}) as Record<string, unknown>;
  const v = (k: string) => valor(d[k]);
  const dinero = (k: string) => (v(k) ? `$ ${formatoMiles(v(k))}` : '');
  const c = (d.conyuge ?? {}) as Record<string, unknown>;

  const referencias = (lista: unknown, tipo: string, extra: 'relacion' | 'direccion') => {
    if (!Array.isArray(lista) || lista.length === 0) return null;
    return (lista as Record<string, unknown>[]).map((r, i) => (
      <Rejilla key={`${tipo}-${i}`}>
        <Dato k={`${tipo} ${i + 1}`} v={valor(r.nombres)} />
        <Dato k={extra === 'relacion' ? 'Relación' : 'Dirección'} v={valor(r[extra])} />
        <Dato k="Ciudad" v={valor(r.ciudad)} />
        <Dato
          k="Teléfonos"
          v={[valor(r.celular), valor(r.telefono)].filter(Boolean).join(' · ')}
        />
        <Dato
          k="Antigüedad"
          v={valor(r.antiguedadMeses) ? `${valor(r.antiguedadMeses)} meses` : ''}
        />
      </Rejilla>
    ));
  };

  const sinReferencias =
    !(d.referenciasPersonales as unknown[])?.length &&
    !(d.referenciasComerciales as unknown[])?.length;

  return (
    <Layout>
      <button
        onClick={() => navigate('/credit-applications')}
        className="mb-3 flex items-center gap-1 text-[13px] text-ink-300 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Todas las solicitudes
      </button>

      {/* Encabezado */}
      <div className="card flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{s.nombre}</h1>
            <EtiquetaEstado estado={s.estado} />
          </div>
          <p className="mt-1 text-[14px] text-ink-200">
            {TIPO_DOCUMENTO_LABEL[s.tipo_documento] ?? s.tipo_documento}{' '}
            {formatoMiles(s.numero_documento)} · {s.celular} · {s.email}
          </p>
          <p className="mt-1 text-[13px] text-ink-300">
            Radicado <span className="font-medium text-ink-100">{s.radicado}</span> ·{' '}
            {fechaLarga(s.creado_en)}
            {s.tipo_solicitud ? ` · ${s.tipo_solicitud}` : ''}
            {s.calidad ? ` como ${s.calidad}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => abrirArchivo()}
            className="flex items-center gap-2 rounded-lg border border-primary-400 bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-400"
          >
            <FileText className="h-4 w-4" />
            PDF firmado
          </button>
          <button
            onClick={descargarZip}
            disabled={descargando}
            className="flex items-center gap-2 rounded-lg border border-[#3d434e] bg-[#2a2d34] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#333740] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {descargando ? 'Preparando...' : 'Todo en ZIP'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Columna lateral: gestión */}
        <aside className="space-y-4 lg:order-2">
          <Bloque titulo="Gestión">
            <label className="mb-1.5 block text-[13px] font-medium text-ink-200">Estado</label>
            <div className="flex items-center gap-2">
              <select
                value={s.estado}
                onChange={(e) => cambiarEstado(e.target.value as EstadoSolicitud)}
                className="input-field"
              >
                {ESTADOS_SOLICITUD.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.texto}
                  </option>
                ))}
              </select>
              {guardandoEstado && <span className="text-xs text-ink-300">Guardando…</span>}
            </div>

            <label className="mb-1.5 mt-4 block text-[13px] font-medium text-ink-200">
              Notas internas
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              onBlur={guardarNotas}
              rows={4}
              placeholder="Observaciones del estudio, llamadas hechas, documentos pendientes…"
              className="input-field"
            />
            <p className="mt-1 h-4 text-xs text-ink-300">
              {estadoNotas === 'guardando'
                ? 'Guardando…'
                : estadoNotas === 'ok'
                ? 'Guardado'
                : 'Se guarda solo al salir del campo.'}
            </p>
          </Bloque>

          <Bloque titulo={`Documentos (${documentos.length})`}>
            {documentos.length === 0 ? (
              <p className="text-[13px] text-ink-300">Sin soportes adjuntos.</p>
            ) : (
              <ul className="divide-y divide-[#2a2d34]">
                {documentos.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 py-2.5">
                    <span className="text-lg" aria-hidden>
                      {doc.tipo === 'application/pdf' ? '📄' : '🖼️'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-300">
                        {ETIQUETA_DOCUMENTO[doc.doc_id] ?? doc.doc_id}
                      </p>
                      <p className="truncate text-[13px] text-ink-100">{doc.nombre}</p>
                      <p className="text-[11px] text-ink-300">{formatoPeso(doc.size ?? 0)}</p>
                    </div>
                    <button
                      onClick={() => abrirArchivo(doc.path, doc.nombre)}
                      className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#8fd5e5] transition-colors hover:bg-[#16242c]"
                    >
                      Descargar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>

          <Bloque titulo="Firma electrónica">
            <Dato k="Fecha y hora" v={fechaLarga(s.constancia?.fechaHora)} />
            <Dato k="Dirección IP" v={s.constancia?.ip} />
            <Dato k="Dispositivo" v={s.constancia?.userAgent} />
            <Dato k="Ciudad de firma" v={v('ciudadFirma')} />
            <Dato
              k="Aviso por correo"
              v={
                s.correo_enviado
                  ? 'Enviado'
                  : s.correo_error
                  ? `Falló: ${s.correo_error}`
                  : 'No configurado'
              }
            />
          </Bloque>

          <div className="text-right">
            <button
              onClick={eliminar}
              disabled={eliminando}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-primary-300 transition-colors hover:bg-[#2a1114] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {eliminando ? 'Eliminando…' : 'Eliminar solicitud'}
            </button>
          </div>
        </aside>

        {/* Columna principal: la solicitud completa */}
        <div className="space-y-4 lg:order-1 lg:col-span-2">
          <Bloque titulo="Vehículo a financiar">
            <Rejilla>
              <Dato k="Vehículo" v={s.vehiculo} />
              <Dato k="Estado" v={v('vehEstado')} />
              <Dato k="Uso" v={v('vehUso')} />
              <Dato k="Plazo" v={v('vehPlazo') ? `${v('vehPlazo')} meses` : ''} />
              <Dato k="Precio de venta" v={dinero('vehPrecioVenta')} />
              <Dato k="Cuota inicial" v={dinero('vehCuotaInicial')} />
              <Dato k="Valor a financiar" v={dinero('vehValorFinanciar')} />
              <Dato k="Otros valores" v={dinero('vehOtrosValores')} />
              <Dato k="Total a financiar" v={dinero('vehTotalFinanciar')} destacado />
              <Dato k="Asesor" v={v('vendedor')} />
            </Rejilla>
            {v('comentarios') && (
              <p className="mt-3 rounded-xl bg-[#1a1d23] p-3 text-[13px] leading-relaxed text-ink-200">
                {v('comentarios')}
              </p>
            )}
          </Bloque>

          <Bloque titulo="Identificación">
            <Rejilla>
              <Dato k="Fecha de nacimiento" v={fechaPartida(d.fechaNacimiento)} />
              <Dato
                k="Lugar de nacimiento"
                v={[v('ciudadNacimiento'), v('paisNacimiento')].filter(Boolean).join(', ')}
              />
              <Dato k="Estado civil" v={v('estadoCivil')} />
              <Dato
                k="Sexo"
                v={v('sexo') === 'F' ? 'Femenino' : v('sexo') === 'M' ? 'Masculino' : ''}
              />
              <Dato
                k="Segunda nacionalidad"
                v={d.segundaNacionalidad ? v('cualNacionalidad') || 'Sí' : 'No'}
              />
            </Rejilla>
          </Bloque>

          <Bloque titulo="Contacto y vivienda">
            <Rejilla>
              <Dato k="Dirección" v={v('direccion')} />
              <Dato k="Ciudad" v={[v('ciudad'), v('departamento')].filter(Boolean).join(', ')} />
              <Dato k="Teléfono fijo" v={v('telefono')} />
              <Dato k="Tipo de vivienda" v={v('tipoVivienda')} />
              <Dato k="Antigüedad domicilio" v={v('antiguedadDomicilio')} />
            </Rejilla>
          </Bloque>

          <Bloque titulo="Información laboral">
            <Rejilla>
              <Dato k="Ocupación" v={s.ocupacion} />
              <Dato k="Profesión" v={v('profesion')} />
              <Dato k="Actividad (CIIU)" v={v('actividadCIIU')} />
              <Dato k="Empresa" v={v('empresa')} />
              <Dato k="Cargo" v={v('cargo')} />
              <Dato k="Tipo de contrato" v={v('tipoContrato')} />
              <Dato
                k="Antigüedad"
                v={v('antiguedadMeses') ? `${v('antiguedadMeses')} meses` : ''}
              />
              <Dato k="Sector" v={v('sectorEconomico')} />
              <Dato
                k="Oficina"
                v={[v('direccionOficina'), v('barrioOficina'), v('ciudadOficina')]
                  .filter(Boolean)
                  .join(', ')}
              />
              <Dato k="Teléfono oficina" v={v('telefonoOficina')} />
              <Dato k="Empresa anterior" v={v('empresaAnterior')} />
            </Rejilla>
          </Bloque>

          <Bloque titulo="Ingresos y egresos mensuales">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Dato k="Salario" v={dinero('ingresoSalario')} />
                <Dato k="Comisiones y honorarios" v={dinero('ingresoComisiones')} />
                <Dato k="Arriendos" v={dinero('ingresoArriendo')} />
                <Dato k="Otros ingresos" v={dinero('ingresoOtros')} />
                <Dato k="Total ingresos" v={dinero('totalIngresos')} destacado />
              </div>
              <div>
                <Dato k="Hipotecas / arriendo" v={dinero('egresoHipotecas')} />
                <Dato k="Tarjetas de crédito" v={dinero('egresoTarjetas')} />
                <Dato k="Otros préstamos" v={dinero('egresoPrestamos')} />
                <Dato k="Sostenimiento" v={dinero('egresoSostenimiento')} />
                <Dato k="Total egresos" v={dinero('totalEgresos')} destacado />
              </div>
            </div>
            {v('detalleOtrosIngresos') && (
              <Dato k="Detalle otros ingresos" v={v('detalleOtrosIngresos')} />
            )}
            <Rejilla>
              <Dato k="Total activos" v={dinero('totalActivos')} />
              <Dato k="Total pasivos" v={dinero('totalPasivos')} />
              <Dato k="Patrimonio" v={dinero('totalPatrimonio')} />
            </Rejilla>
          </Bloque>

          {Array.isArray(d.propiedades) && d.propiedades.length > 0 && (
            <Bloque titulo="Propiedad raíz">
              {(d.propiedades as Record<string, unknown>[]).map((p, i) => (
                <Rejilla key={i}>
                  <Dato k={`Bien ${i + 1}`} v={valor(p.tipoBien)} />
                  <Dato
                    k="Dirección"
                    v={[valor(p.direccion), valor(p.ciudad)].filter(Boolean).join(', ')}
                  />
                  <Dato k="Participación" v={valor(p.participacion)} />
                  <Dato k="Hipoteca a favor de" v={valor(p.hipotecaFavorDe)} />
                  <Dato k="Valor" v={valor(p.valor) ? `$ ${formatoMiles(valor(p.valor))}` : ''} />
                </Rejilla>
              ))}
            </Bloque>
          )}

          {Array.isArray(d.vehiculos) && d.vehiculos.length > 0 && (
            <Bloque titulo="Vehículos que posee">
              {(d.vehiculos as Record<string, unknown>[]).map((p, i) => (
                <Rejilla key={i}>
                  <Dato
                    k={`Vehículo ${i + 1}`}
                    v={[valor(p.marca), valor(p.tipoVehiculo), valor(p.modelo)]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  <Dato k="Placa" v={valor(p.placa)} />
                  <Dato k="Prenda a favor de" v={valor(p.prendaFavorDe)} />
                  <Dato
                    k="Cuota mensual"
                    v={valor(p.cuotaMensual) ? `$ ${formatoMiles(valor(p.cuotaMensual))}` : ''}
                  />
                </Rejilla>
              ))}
            </Bloque>
          )}

          {(valor(c.nombres) || valor(c.apellidos)) && (
            <Bloque titulo="Cónyuge">
              <Rejilla>
                <Dato
                  k="Nombre"
                  v={[valor(c.nombres), valor(c.apellidos)].filter(Boolean).join(' ')}
                />
                <Dato
                  k="Documento"
                  v={[valor(c.tipoDocumento), formatoMiles(valor(c.numeroDocumento))]
                    .filter(Boolean)
                    .join(' ')}
                />
                <Dato k="Fecha de nacimiento" v={fechaPartida(c.fechaNacimiento)} />
                <Dato k="Celular" v={valor(c.celular)} />
                <Dato k="Correo" v={valor(c.email)} />
                <Dato
                  k="Dirección"
                  v={[valor(c.direccion), valor(c.ciudad)].filter(Boolean).join(', ')}
                />
              </Rejilla>
            </Bloque>
          )}

          <Bloque titulo="Referencias">
            {referencias(d.referenciasPersonales, 'Personal', 'relacion')}
            {referencias(d.referenciasComerciales, 'Comercial', 'direccion')}
            {sinReferencias && <p className="text-[13px] text-ink-300">Sin referencias.</p>}
          </Bloque>

          <Bloque titulo="Declaraciones (SARLAFT)">
            <Rejilla>
              <Dato k="Origen de los recursos" v={v('origenRecursos')} />
              <Dato
                k="Reconocimiento público"
                v={siNo(d.gozaReconocimiento, v('descripcionPep'))}
              />
              <Dato k="Administra recursos públicos" v={siNo(d.administraRecursos)} />
              <Dato
                k="Persona públicamente reconocida"
                v={siNo(d.personaReconocida, v('expliquePersonaReconocida'))}
              />
              <Dato k="Poder público" v={siNo(d.gradoPoderPublico, v('expliquePoderPublico'))} />
              <Dato k="A. Administra recursos públicos" v={siNo(d.declaracionA)} />
              <Dato k="B. Decisiones con impacto político" v={siNo(d.declaracionB)} />
              <Dato k="C. Personaje público" v={siNo(d.declaracionC)} />
              <Dato k="D. Ordenador de gastos" v={siNo(d.declaracionD)} />
              <Dato k="Moneda extranjera" v={siNo(d.transaccionesExtranjera, v('tipoOperaciones'))} />
            </Rejilla>
            {d.transaccionesExtranjera === true && (
              <Rejilla>
                <Dato k="Producto" v={v('tipoProducto')} />
                <Dato k="Entidad" v={v('entidadProducto')} />
                <Dato
                  k="País / ciudad"
                  v={[v('paisProducto'), v('ciudadProducto')].filter(Boolean).join(', ')}
                />
                <Dato k="Moneda" v={v('monedaProducto')} />
                <Dato k="Monto mensual" v={dinero('montoMensualProducto')} />
              </Rejilla>
            )}
          </Bloque>
        </div>
      </div>
    </Layout>
  );
};

export default CreditApplicationDetail;
