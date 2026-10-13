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
// GIF animado de prueba (generado con ImageMagick; no es un dato del negocio).
export const GIF_PRUEBA = 'data:image/gif;base64,R0lGODlhYAAwAPUtAC59MsA5K8A6LcE7LsE8LsRFOMRHOcRHOsVHO8VIO89nXc9oXc9oXs9pXs9pX89qX9BqX9JyaNJzadNzadN0atN0a96Ykd6Zkt+Zkt+akt+ak+i4s+m5tOm6te/Mye/Nye/Nyu/OyvLX1fPY1fPY1vPZ1vfm5Pfm5ffn5fv08/z08/z09Pz19P///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQEHgAAACH/C0ltYWdlTWFnaWNrDmdhbW1hPTAuNDU0NTQ1ACwAAAAAYAAwAAAG/0CAcEgsGo/IpHLJbDqf0Kh0Sq1ar9isdmtseb/gsHhMLpvP6LR6zW673/C4fE6v2+9tVkgDSRASEBohLHiFdiUUAYqLjAEUJYaRbigLjZaMCyiSm2ccl5+MHJyjYRqgp4oapKSmqKiqq5Kerq4bsYYotLqat3cQurQLvYfAupDDc4nFrhTIcirLuoTObyHRtCHUb63Xp7DabJXdpxDgbQjjpwnmbAPpp+xrCe+fCPFq4vSNCvdp3PqLvvUrYw0go2wDzbAwyEhFwjMTGAaY8PBMCYkiKp7JR0+YRjO5APL6WGbWO1Ekz/y7JjBlmZXFWroseQ3lzDQofunKdLMNIiVUE471dJNizwIEAxAsEDRtqNOnUKMa4kK1qtWrWLNq3cq1a5UgACH5BAUeAC4AIf8LSW1hZ2VNYWdpY2sOZ2FtbWE9MC40NTQ1NDUALAAACAA5ACEAAAb/QJdwSHS1jshkq8gUskIaSIKQgGhCrKa2qOwmtyVKYEwuByilbdPL/hJRC7O8vECph+38cciZ+8scanqDRxp/h2MaS2uEeYaIiBqMjWyBkJAbXJRsdkKXiJ1Cm2wQQ5+HC3ijXWlEp3+tq10URa9+tLJKKk22cyy5SSG8vWYhwEiSTMRmisctqcrLZBDOLQjD0gEJ1QNa2WPVCdjSCNXQtd8K1cno2c3HwtHZxs5Z8tK71RPt0vtGzq1MfROh6ti5bwHO/TsWCmEoUc4sfQvEZN03dpqcPSKmSFAuPsQo3pFVBAWEU3XuZBwERsyhCQFVrvQiMwWUBQgGIFhwxd6WASAAIfkEBR4ALgAh/wtJbWFnZU1hZ2ljaw5nYW1tYT0wLjQ1NDU0NQAsGAAIADkAIQAABv9Al3BIdLWOyGSryBSyQhpIgpCAaEKsprao7Ca3JUpgTC4HKKVt08v+ElELs7y8QKmH7fxxyJn7yxxqeoNHGn+HYxpLa4R5hoiIGoyNbIGQkBtclGx2QpeInUKbbBBDn4cLeKNdaUSnf62rXRRFr360skoqTbZzLLlJIby9ZiHASJJMxGaKxy2pystkEM4tCMPSAQnVA1rZY9UJ2NII1dC13wrVyejZzcfC0dnGzlny0rvVE+3S+0bOrUx9E6Hq2LlvAc79OxYKYShRzix9C8Rk3Td2mpw9IqZIUC4+xCjekVUEBYRTde5kHARGzKEJAVWu9CIzBZQFCAYgWHDF3pYBIAAh+QQFHgAuACH/C0ltYWdlTWFnaWNrDmdhbW1hPTAuNDU0NTQ1ACwwAAgAMAAhAAAG6ECXcEh0tY7IZKvICmkgCUICogmxitisUclFukqUgHhMDlBK2mx33UItynDyApUesrucYXwfyGvvXRpFfHEaS1iASoJYhHCLRIlJflmNZRuQkUd0dZVkm1uZEHUunWMLQplHaKOkpQFoqS0UrK2lFLEqtEKuAbEhurWdsY+svLGnusapCMDKmQPAwY2xzMmux83XqcSjzpG/1qWxV+GdoJETtLzpsavdriKoqchpvPSxn1q8+bGTjK7+5GXitssVwXORuPEylKafHoCs8EFwNQdYqi9hCE1wFw1QkRROFiAYgGBBFXJaggAAOw==';
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
const leerJSON = (f) => (f ? (typeof f.value === 'string' ? JSON.parse(f.value) : f.value) : null);
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
  // Respaldo ficticio: imagen embebida (data:), sin ninguna petición de red.
  const DOC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const g = (id, monto, glosa, categoria = 'movilizacion', doc = true) => ({ id, fecha: hace(10).slice(0, 10), monto, moneda: 'CLP', categoria, glosa,
    docTipo: 'Boleta', docNumero: String(1000 + monto % 997), adjuntoUrl: doc ? DOC : '', adjuntoNombre: doc ? `boleta-${id}.png` : '' });
  const gastos = (folio, completo = true) => [g(`g${folio}a`, 18000 + folio * 1000, 'Peaje Ruta 5 (ida y vuelta)'),
    g(`g${folio}b`, 32500, 'Almuerzo con proveedor de embalaje', 'alimentacion'), g(`g${folio}c`, 12990, 'Materiales de oficina', 'otros', completo)];
  const r = (folio, trabajador, email, estado, extra = {}) => ({ id: `r${folio}`, folio, titulo: `Rendición de ejemplo ${folio}`, trabajador, trabajadorEmail: email,
    creadaPor: trabajador, empresa: 'Allegria Service', periodo: hace(12).slice(0, 10), monedaPago: 'CLP', fechaTC: hace(12).slice(0, 10), estado,
    gastos: gastos(folio, folio !== 1), historial: [{ accion: 'creada', usuario: trabajador, fecha: hace(12), comentario: '' }],
    creadoEn: hace(12), enviadoEn: estado === 'borrador' ? null : hace(8), ...extra });
  st.rendiciones = { updated_at: hace(0.3), value: [
    r(1, 'Operario Planta', 'operario.planta@ejemplo.cl', 'borrador'),
    r(2, 'Operario Planta', 'operario.planta@ejemplo.cl', 'rechazada', { devuelta: true, comentarioRevisor: 'Falta la boleta del peaje' }),
    r(3, 'Operario Planta', 'operario.planta@ejemplo.cl', 'enviada', { cadena: [{ email: 'cmachuca@grupomediterra.cl', nombre: 'Carol Machuca' }, { email: 'ahuerta@grupomediterra.cl', nombre: 'Angelo Huerta' }], nivelActual: 1,
      aprobaciones: [{ email: 'cmachuca@grupomediterra.cl', nombre: 'Carol Machuca', fecha: hace(6), comentario: '', nivel: 0 }] }),
    r(4, 'Operario Planta', 'operario.planta@ejemplo.cl', 'pagada'),
    r(5, 'Carol Machuca', 'cmachuca@grupomediterra.cl', 'borrador'),
    r(6, 'Gerente Frisku', 'gerente.frisku@ejemplo.cl', 'enviada'),
    r(7, 'Michelle Garcia', 'mgarcia@grupomediterra.cl', 'aprobada', { revisadoEn: hace(2), revisadoPor: 'Angelo Huerta' }),
  ] };
  st.rendiciones_config = { updated_at: hace(0.3), value: { valorKm: 0, aprobadores: {} } };
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
  // Maestro de Especies (Osiris) con un GIF de PRUEBA embebido (4 cuadros, 96×48, sin red):
  // sirve para comprobar que la imagen se ve completa (no cuadrada, sin recorte) y animada.
  st.osiris = { updated_at: hace(0.3), value: { especies: [
    { id: 'esp-gif', nombre: 'Cerezo', color: '#c0392b', imagen: GIF_PRUEBA, observaciones: 'GIF de prueba (ficticio)' },
    { id: 'esp-emoji', nombre: 'Arándano', color: '#3b5bdb', imagen: '', observaciones: 'Sin imagen: usa el emoji' },
  ] } };
  // Franja ejecutiva (inicio del CFO): saldos y créditos FICTICIOS con el modelo vigente
  // de src/creditos.js. Una cuenta en EUR sin TC guardado (la caja sale INCOMPLETA),
  // un crédito vencido, uno en CLP valorizado con maestro_tc y uno de Allpa Chile
  // (fuera del perímetro: se informa aparte, no suma).
  const dia = (n) => iso(new Date(hoy.getTime() + n * 86400000)).slice(0, 10);
  const bancos = leerJSON(st.finanzas_bancos) || { saldos: {} };
  Object.assign(bancos.saldos, {
    'Mediterra||Banco Ficticio A||usd': { monto: 85000, fecha: dia(-3), moneda: 'usd' },
    'Osiris||Banco Ficticio B||clp': { monto: 47500000, usd: 50000, fecha: dia(-2), moneda: 'clp' },
    'Integrity Farms||Banco Ficticio A||usd': { monto: 22000, fecha: dia(-5), moneda: 'usd' },
    'Allegria Service||Banco Ficticio C||usd': { monto: 31000, fecha: dia(-1), moneda: 'usd' },
    'Frisku Foods||Banco Ficticio D||eur': { monto: 12000, fecha: dia(-4), moneda: 'eur' },
  });
  st.finanzas_bancos = { ...(st.finanzas_bancos || {}), value: JSON.stringify(bancos), updated_at: st.finanzas_bancos?.updated_at || hace(0.3) };
  const cr = (uid, empresa, moneda, monto, venc) => ({ uid, n: uid, tipo_credito: 'contrato', empresa, acreedor: `Banco ficticio ${uid}`, moneda, monto,
    fecha_desembolso: dia(-200), vencimiento_final: venc, modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 0, base: 'act360' });
  const finRow = leerJSON(st.finanzas) || {};
  finRow.creditos_data = [cr('F1', 'Mediterra', 'USD', 1000000, dia(170)), cr('F2', 'Allegria Foods', 'USD', 400000, dia(-20)),
    cr('F3', 'Osiris', 'CLP', 190000000, dia(260)), cr('F4', 'Allpa Farms', 'USD', 300000, dia(200))];
  st.finanzas.value = typeof st.finanzas.value === 'string' ? JSON.stringify(finRow) : finRow;
  st.maestro_tc = { updated_at: hace(0.3), value: { 'USD-CLP': [{ fecha: dia(-2), valor: 950, fuente: 'manual' }] } };
  st.nominas_v2_done = { value: JSON.stringify({ migrado: true }), updated_at: hace(0.3) };
  st.nominas_osiris = { updated_at: hace(0.3), value: JSON.stringify({ nominas: [nom('NOMP', 3, 'preparada', 41), nom('NOMR', 2, 'aprobada1', 40), nom('NOMA', 1, 'aprobada', 39)] }) };
  // Registro de auditoría FICTICIO (fila `audit_log`): permite probar el listado y
  // su exportación a Excel. Incluye caracteres que el XML debe escapar (& < > ")
  // y acentos, para comprobar que llegan intactos al archivo.
  const ev = (n, horas, usuario, rol, accion, modulo, seccion, descripcion, campo = '', antes = '', despues = '') => ({
    id: `ev_ficticio_${n}`, timestamp: new Date(hoy.getTime() - horas * 3600e3).toISOString(),
    usuario, email: `${usuario.split(' ')[0].toLowerCase()}@ejemplo.test`, rol, accion, modulo, seccion, descripcion,
    registroId: '', campo, valorAnterior: antes, valorNuevo: despues });
  st.audit_log = { updated_at: hace(0.2), value: { eventos: [
    ev(1, 50, 'Angelo Huerta', 'admin', 'login', 'sistema', 'acceso', 'Inicio de sesión'),
    ev(2, 49, 'Carol Ejemplo', 'editor', 'editar', 'finanzas', 'Saldos Bancos', 'Actualizó saldo Banco Ficticio A', 'monto', '80000', '85000'),
    ev(3, 30, 'Michelle Ejemplo', 'editor', 'crear', 'finanzas', 'Nóminas', 'Creó nómina semana 41 — Osiris'),
    ev(4, 26, 'Angelo Huerta', 'admin', 'aprobar', 'finanzas', 'Nóminas', 'Aprobó nómina NOMA (1.ª firma)'),
    ev(5, 20, 'Pablo Ejemplo', 'editor', 'editar', 'finanzas', 'Créditos', 'Tasa & plazo del crédito F1 <ficticio>', 'tasa', '8,5%', '"9,0%"'),
    ev(6, 12, 'Lucía Ejemplo', 'consulta', 'consultar', 'finanzas', 'Dashboard', 'Revisó el Dashboard'),
    ev(7, 6, 'Angelo Huerta', 'admin', 'exportar', 'finanzas', 'Flujo Consolidado Waterfall', 'Exportó flujo consolidado waterfall — Temporada 2026-2027'),
    ev(8, 3, 'Carol Ejemplo', 'editor', 'rechazar', 'rendiciones', 'Por Aprobar', 'Devolvió rendición R-003: falta boleta'),
    ev(9, 1, 'Angelo Huerta', 'admin', 'cambio_permiso', 'sistema', 'usuarios', 'Cambió permiso de Lucía Ejemplo', 'bancos', 'sin_acceso', 'ver'),
  ] } };
  return st;
}
