/* Store ficticio compartido por las pruebas de remuneraciones (remuneraciones.mjs y
   rollback-remuneraciones.mjs). Datos FICTICIOS. */
import { nuevoStore } from './fake.mjs';
function semanaHoy() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2])); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { semana: Math.ceil(((d - y0) / 86400000 + 1) / 7), año: d.getUTCFullYear() };
}
export const { semana, año } = semanaHoy();
export const SECRETOS = /Juan Pérez|María Soto|Pedro Borrador|Trabajador Semilla/;

export function armarStore() {
  const st = nuevoStore();
  const cred = st.pins.value['Angelo Huerta_h'];
  for (const n of ['Carol Machuca', 'Milagros Becerra', 'Michelle Garcia', 'Lucía Corbetto', 'Cristobal Ortiz']) st.pins.value[`${n}_h`] = cred;
  const fin = (extra) => ({ finanzas: { dashboard: 'sin_acceso', flujo: 'sin_acceso', bancos: 'sin_acceso', creditos: 'sin_acceso', reporte: 'sin_acceso', params: 'sin_acceso', auditoria: 'sin_acceso', eeff: 'sin_acceso', rendiciones: 'ver', ...extra } });
  st.usuarios = { updated_at: new Date(Date.now() - 44000).toISOString(), value: [
    { nombre: 'Milagros Becerra', rol: 'editor', modulos: ['tareas', 'finanzas'], rendVerTodas: true, tab_permisos: { ...fin({ nominas: 'editar' }), tareas: { config: 'editar' } } },
    { nombre: 'Carol Machuca', rol: 'editor', modulos: ['tareas', 'finanzas', 'contabilidad'], rendVerTodas: true, tab_permisos: { ...fin({ nominas: 'editar', bancos: 'editar' }), tareas: { config: 'editar' } } },
    { nombre: 'Michelle Garcia', rol: 'editor', modulos: ['tareas', 'finanzas', 'contabilidad', 'frisku'], rendVerTodas: true, tab_permisos: { ...fin({ nominas: 'ver' }), tareas: { config: 'editar' }, frisku: { liquidaciones: 'ver' } } },
    { nombre: 'Pablo Duran', rol: 'editor', modulos: ['tareas', 'finanzas', 'contabilidad'], rendVerTodas: true, tab_permisos: { ...fin({ nominas: 'ver' }), tareas: { config: 'editar' } } },
    { nombre: 'Angelo Huerta', rol: 'admin', esCFO: true, modulos: ['tareas', 'osiris', 'finanzas', 'contabilidad'] },
    { nombre: 'Nicolás Fuenzalida', rol: 'gerente_tecnico', modulos: ['osiris'] },
    { nombre: 'Lucía Corbetto', email: 'lucia@ficticio.cl', rol: 'consulta', modulos: ['finanzas', 'frisku'],
      tab_permisos: { finanzas: { flujo: 'editar', params: 'sin_acceso', nominas: 'ver' }, frisku: { liquidaciones: 'ver' } } },
    { nombre: 'Cristobal Ortiz', email: 'cristobal@ficticio.cl', rol: 'consulta', modulos: ['finanzas'], tab_permisos: { finanzas: { nominas: 'ver' } } },
    { nombre: 'Raimundo Valenzuela', email: 'raimundo@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
    { nombre: 'Carolina Lara', email: 'carolina@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
    { nombre: 'Denise Piaget', email: 'denise@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
    { nombre: 'José Tomás Silva', email: 'jts@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
  ] };
  const base = { fecha: '2026-10-08', tc: 950, revisadoPor: '', bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] };
  st.nominas = { updated_at: new Date(Date.now() - 40000).toISOString(), value: JSON.stringify({ nominas: [
    { ...base, id: 'nomG', empresa: 'Allegria Foods', semana, año, numero: 1, estado: 'aprobada', preparadoPor: 'Carol Machuca', aprobado1Por: 'Carol Machuca', aprobadoPor: 'Angelo Huerta', fechaAprobacion: '2026-10-07', items: [
      { id: 'a', seccion: 'proveedores', tipoDoc: 'Factura Electrónica', proveedor: 'Ferretería Sur', concepto: 'Materiales', montoCLP: 100000, estadoLinea: 'activa', documentos: [] },
      { id: 'b', seccion: 'anticipos', proveedor: 'Juan Pérez', concepto: 'Anticipo quincena', montoCLP: 200000, pagado: true, estadoLinea: 'activa',
        documentos: [{ id: 'doc1', nombre: 'vale.pdf', path: 'nominas/allegria_foods/nomG/b/doc1_vale.pdf', estado: 'activo' }] },
      { id: 'c', seccion: 'proveedores', tipoDoc: 'Remuneraciones', proveedor: 'María Soto', concepto: 'Sueldo septiembre', montoCLP: 900000, pagado: true, estadoLinea: 'activa', documentos: [] },
      { id: 'e', seccion: 'proveedores', tipoDoc: 'Factura Electrónica', proveedor: 'Agrícola Norte', concepto: 'Anticipo a proveedor', montoCLP: 1500000, estadoLinea: 'activa', documentos: [] },
    ] },
    { ...base, id: 'nomB', empresa: 'Allegria Service', semana, año, numero: 1, estado: 'borrador', preparadoPor: '', aprobado1Por: '', aprobadoPor: '', items: [
      { id: 'p', seccion: 'proveedores', tipoDoc: 'Factura Electrónica', proveedor: 'Transportes Uno', montoCLP: 50000, estadoLinea: 'activa', documentos: [] },
      { id: 'x', seccion: 'anticipos', proveedor: 'Pedro Borrador', concepto: 'Anticipo', montoCLP: 300000, estadoLinea: 'activa', documentos: [] },
    ] },
  ] }) };
  st.nominas_remuneraciones = { updated_at: new Date(Date.now() - 39000).toISOString(), value: JSON.stringify({ v: 1, clasificaciones: [], nominas: [{
    id: 'rem_seed', empresa: 'Allegria Service', periodo: '2026-09', numero: 1, estado: 'preparada',
    items: [{ id: 'ri1', clase: 'sueldo', trabajador: 'Trabajador Semilla', montoCLP: 700000, documentos: [] }],
    preparadoPor: 'Angelo Huerta', preparadoPorCorreo: 'ahuerta@grupomediterra.cl', autores: ['ahuerta@grupomediterra.cl'], historial: [] }] }) };
  return st;
}
