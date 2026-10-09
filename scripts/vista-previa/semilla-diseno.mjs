/* ─────────────────────────────────────────────────────────────────────────
   Datos FICTICIOS para revisar el hub y la navegación (rama de diseño).

   Seis perfiles con los NIVELES de permiso acordados el 08-10-2026. Las
   personas que ya figuran en el código (WORKERS_BASE) conservan su nombre;
   las demás se rotulan por su perfil, con correos de ejemplo. Ninguna
   credencial real: todos entran con el PIN de prueba de scripts/e2e/fake.mjs.
   Rendiciones y estados de tareas son inventados para que los contadores
   tengan algo que contar; las cifras salen de las reglas de la app.
   ───────────────────────────────────────────────────────────────────────── */
import { nuevoStore, PIN } from '../e2e/fake.mjs';

export { PIN };
const SIN = 'sin_acceso';
const finanzasTodoSin = { dashboard: SIN, flujo: SIN, bancos: SIN, creditos: SIN, nominas: SIN, reporte: SIN, params: SIN, auditoria: SIN, eeff: SIN };
const tareasEditar = { diaria: 'editar', semanal: 'editar', quincenal: 'editar', mensual: 'editar', anual: 'editar', config: 'editar' };
const osirisEditar = { contratos: 'editar', obtentores: 'editar', viveros: 'editar', opTecnica: 'editar', royalties: 'editar' };

export const PERFILES = [
  { clave: 'cfo', titulo: 'CFO (administrador)', email: 'ahuerta@grupomediterra.cl',
    u: { nombre: 'Angelo Huerta', cargo: 'Gerencia Adm. y Finanzas', email: 'ahuerta@grupomediterra.cl', rol: 'admin', esCFO: true,
      modulos: ['tareas', 'osiris', 'finanzas', 'contabilidad'] } },
  { clave: 'analista', titulo: 'Analista de finanzas (Carol)', email: 'cmachuca@grupomediterra.cl',
    u: { nombre: 'Carol Machuca', cargo: 'Analista Finanzas', email: 'cmachuca@grupomediterra.cl', rol: 'editor', rendVerTodas: true, rendPorOtros: true,
      modulos: ['tareas', 'osiris', 'finanzas', 'contabilidad'],
      tab_permisos: { tareas: tareasEditar, osiris: osirisEditar,
        finanzas: { ...finanzasTodoSin, bancos: 'editar', nominas: 'editar', rendiciones: 'ver' } } } },
  { clave: 'contadora', titulo: 'Contadora general (Michelle)', email: 'mgarcia@grupomediterra.cl',
    u: { nombre: 'Michelle Garcia', cargo: 'Contadora General', email: 'mgarcia@grupomediterra.cl', rol: 'editor', rendVerTodas: true,
      modulos: ['tareas', 'contabilidad', 'finanzas', 'frisku'],
      tab_permisos: { tareas: tareasEditar,
        finanzas: { ...finanzasTodoSin, bancos: 'editar', nominas: 'ver', rendiciones: 'ver' },
        frisku: { maestros: 'ver', dashboard: SIN, clientes: SIN, exportadoras: SIN, contratos: SIN, programa: 'ver', embarques: 'ver', liquidaciones: 'ver' } } } },
  { clave: 'socia', titulo: 'Socia (perfil consulta)', email: 'socia.consulta@ejemplo.cl',
    u: { nombre: 'Socia Consulta', cargo: 'Socia (perfil de ejemplo)', email: 'socia.consulta@ejemplo.cl', rol: 'consulta',
      modulos: ['tareas', 'osiris', 'finanzas', 'allegria', 'frisku'],
      tab_permisos: {
        tareas: { diaria: 'ver', semanal: 'ver', quincenal: 'ver', mensual: 'ver', anual: 'ver' },
        finanzas: { dashboard: 'ver', flujo: 'editar', bancos: 'ver', creditos: 'ver', nominas: 'ver', reporte: 'ver', params: SIN, auditoria: SIN, eeff: 'ver' } } } },
  { clave: 'frisku', titulo: 'Gerente Frisku (perfil comercial)', email: 'gerente.frisku@ejemplo.cl',
    u: { nombre: 'Gerente Frisku', cargo: 'CEO Frisku (perfil de ejemplo)', email: 'gerente.frisku@ejemplo.cl', rol: 'editor',
      modulos: ['frisku', 'finanzas'], empresas_permitidas: ['Frisku Foods', 'Frisku Foods Perú'],
      tab_permisos: { frisku: { clientes: 'editar', contratos: 'editar', dashboard: 'editar', exportadoras: 'editar' },
        finanzas: { ...finanzasTodoSin, bancos: 'ver', rendiciones: 'editar' } } } },
  { clave: 'operario', titulo: 'Personal que solo rinde gastos', email: 'operario.planta@ejemplo.cl',
    u: { nombre: 'Operario Planta', cargo: 'Operador línea de proceso (ejemplo)', email: 'operario.planta@ejemplo.cl', rol: 'editor',
      modulos: ['finanzas'], tab_permisos: { finanzas: { ...finanzasTodoSin, rendiciones: 'ver' } } } },
];

const iso = (d) => d.toISOString();
const hace = (dias) => iso(new Date(Date.now() - dias * 86400000));

export function storeDiseno(hoy = new Date()) {
  const st = nuevoStore();
  const cred = st.pins.value['Angelo Huerta_h'];
  for (const p of PERFILES) st.pins.value[`${p.u.nombre}_h`] = cred;
  st.usuarios = { updated_at: hace(0.5), value: PERFILES.map(p => p.u) };
  // Tareas: el resto queda en gris (sin marcar) → vencen según la fecha real.
  st.main.value.estados = {
    m3: { estadoResp: 'verde', estadoSup: 'gris', aprobado: false },   // Carol la hizo; Angelo revisa
    m15: { estadoResp: 'verde', estadoSup: 'gris', aprobado: false },  // Michelle la hizo; Angelo revisa
    'm13__Allegria Foods': { estadoResp: 'verde', estadoSup: 'gris', aprobado: false }, // Michelle → revisa Carol
    m5: { estadoResp: 'verde', estadoSup: 'verde', aprobado: true },
  };
  const g = (id, monto, desc) => ({ id, fecha: hace(10).slice(0, 10), monto, moneda: 'CLP', categoria: 'otros', descripcion: desc, tipoDoc: 'Boleta', adjuntoUrl: '' });
  const r = (folio, trabajador, email, estado, extra = {}) => ({ id: `r${folio}`, folio, titulo: `Rendición de ejemplo ${folio}`, trabajador, trabajadorEmail: email,
    creadaPor: trabajador, empresa: 'Allegria Service', periodo: hace(12).slice(0, 10), monedaPago: 'CLP', fechaTC: hace(12).slice(0, 10), estado,
    gastos: [g(`g${folio}`, 18000 + folio * 1000, 'Gasto de ejemplo')], historial: [{ accion: 'creada', usuario: trabajador, fecha: hace(12), comentario: '' }],
    creadoEn: hace(12), enviadoEn: estado === 'borrador' ? null : hace(8), ...extra });
  st.rendiciones = { updated_at: hace(0.3), value: [
    r(1, 'Operario Planta', 'operario.planta@ejemplo.cl', 'borrador'),
    r(2, 'Operario Planta', 'operario.planta@ejemplo.cl', 'rechazada', { devuelta: true, comentarioRevisor: 'Falta la boleta del peaje' }),
    r(3, 'Operario Planta', 'operario.planta@ejemplo.cl', 'enviada'),
    r(4, 'Operario Planta', 'operario.planta@ejemplo.cl', 'pagada'),
    r(5, 'Carol Machuca', 'cmachuca@grupomediterra.cl', 'borrador'),
    r(6, 'Gerente Frisku', 'gerente.frisku@ejemplo.cl', 'enviada'),
    r(7, 'Michelle Garcia', 'mgarcia@grupomediterra.cl', 'aprobada', { revisadoEn: hace(2), revisadoPor: 'Angelo Huerta' }),
  ] };
  st.rendiciones_config = { updated_at: hace(0.3), value: { valorKm: 0, aprobadores: {} } };
  st.maestro_tc = { updated_at: hace(0.3), value: {} };
  // Nóminas ficticias de Osiris en tres estados, para recorrer aprobación y devolución.
  // NOMR está con V°B° (aprobada1): es la que el CFO puede devolver (en «revision» devuelven Carol o Michelle).
  const hoyISO = iso(hoy).slice(0, 10);
  const item = (id, concepto, usd) => ({ id, seccion: 'pagos_usd', tipoDoc: 'Factura', proveedor: 'Proveedor ficticio', rut: '', nDoc: '1', fDoc: hoyISO, fVenc: '', semVenc: '',
    concepto, montoCLP: 0, montoUSD: usd, montoPEN: 0, comentario: '', pagado: false, anticipo: 0, estadoLinea: 'activa', historial: [],
    documentos: [{ id: `d-${id}`, nombre: 'respaldo.pdf', path: `nominas/osiris/${id}/respaldo.pdf`, estado: 'activo', hash: 'ficticio' }] });
  const nom = (id, numero, estado, semana) => ({ id, empresa: 'Osiris', semana, 'año': hoy.getFullYear(), numero, fecha: hoyISO, tc: 955, estado,
    preparadoPor: 'Carol Machuca', revisadoPor: estado === 'preparada' ? '' : 'Carol Machuca', aprobadoPor: estado === 'aprobada' ? 'Angelo Huerta' : '',
    aprobado1Por: (estado === 'aprobada' || estado === 'aprobada1') ? 'Michelle Garcia' : '', fechaAprobacion: '', fechaAprobacion1: '',
    items: [item(`${id}-1`, 'Servicio ficticio', 1200), item(`${id}-2`, 'Arriendo ficticio', 800)], bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] });
  st.nominas_v2_done = { value: JSON.stringify({ migrado: true }), updated_at: hace(0.3) };
  st.nominas_osiris = { updated_at: hace(0.3), value: JSON.stringify({ nominas: [nom('NOMP', 3, 'preparada', 41), nom('NOMR', 2, 'aprobada1', 40), nom('NOMA', 1, 'aprobada', 39)] }) };
  return st;
}
