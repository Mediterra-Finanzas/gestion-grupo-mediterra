#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────
   Script asistido: aplicar la conciliación de Créditos exportada desde la
   vista previa local, operación por operación, sobre el estado VIGENTE.

   ESTA VERSIÓN SOLO ACEPTA DESTINOS LOCALES (127.0.0.1 / localhost).
   Rechaza producción (*.supabase.co). Habilitar otro destino requiere cambiar
   el código, con autorización explícita del CFO.

   1) Ensayo (no escribe nada):
        node scripts/conciliacion/aplicar.mjs ensayo \
          --resultado conciliacion_creditos_X.json --destino http://127.0.0.1:3901 \
          --salida carpeta [--decisiones decisiones.json]
      Genera: ensayo_<sello>.txt (informe), ensayo_<sello>.json y
      decisiones_plantilla.json (a completar: firma y cada posible duplicado).

   2) Aplicar (solo lo aprobado):
        node scripts/conciliacion/aplicar.mjs aplicar \
          --resultado conciliacion_creditos_X.json --decisiones decisiones.json \
          --destino http://127.0.0.1:3901 --usuario "Nombre" --salida carpeta
      Relee SIEMPRE el estado actual y vuelve a clasificar cada operación.
      Escribe cada fila con PATCH condicionado (id + updated_at leído): si la
      fila cambió después de leerla, PostgREST no actualiza ninguna fila y el
      script se detiene sin escribir las siguientes. Luego relee y verifica.
      Registro de auditoría: auditoria_<sello>.json + auditoria.jsonl.

   Llave del destino (si la necesita): variable DESTINO_KEY. No envía correos.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { planificar, verificar, decodificarFila, codificarValor, filaDeOp, rutasCambiadas, sha256,
  FORMATO_DECISIONES, UMBRAL_DIAS_RESPALDO } from './motor.mjs';

// ── destino ───────────────────────────────────────────────────────────
export function validarDestino(url) {
  let u; try { u = new URL(url); } catch (e) { throw new Error(`Destino inválido: ${url}`); }
  if (/supabase\.co$/i.test(u.hostname) || /bywovqayuzodbzwsriet/i.test(url)) throw new Error('Destino de PRODUCCIÓN rechazado: esta versión del script solo se ejecuta contra una base local de prueba.');
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname)) throw new Error(`Destino no local rechazado (${u.hostname}): esta versión solo admite 127.0.0.1 / localhost.`);
  return u.origin;
}

export function transportePostgrest(base, key = process.env.DESTINO_KEY || '') {
  const origen = validarDestino(base);
  const H = { 'Content-Type': 'application/json', ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {}) };
  const raiz = `${origen}/rest/v1/calendario_data`;
  return {
    destino: origen,
    async leer(ids) {
      const lista = ids.map((x) => `"${x.replace(/"/g, '\\"')}"`).join(',');
      const r = await fetch(`${raiz}?id=in.(${encodeURIComponent(lista)})&select=id,value,updated_at`, { headers: H });
      if (!r.ok) throw new Error(`Lectura HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return r.json();
    },
    // Escritura atómica: UPDATE … WHERE id = $1 AND updated_at = $2 (una sola sentencia).
    async escribirCondicionado(id, version, value, nuevoTs) {
      const url = `${raiz}?id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(version)}`;
      const r = await fetch(url, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ value, updated_at: nuevoTs }) });
      if (!r.ok) return { ok: false, motivo: 'http', status: r.status, texto: (await r.text()).slice(0, 300) };
      const filas = await r.json();
      if (!Array.isArray(filas) || filas.length === 0) return { ok: false, motivo: 'conflicto' };
      if (filas.length !== 1 || filas[0].id !== id || !filas[0].updated_at) return { ok: false, motivo: 'sin_confirmacion' };
      return { ok: true, updatedAt: filas[0].updated_at };
    },
  };
}

// Raíces de la fila finanzas que una operación de Créditos puede tocar.
const RUTA_PERMITIDA = /^(creditos_data|creditos_saldos_informados|creditos_config)(\.|$)|^finanzas_real\.[^.]+(\.(_coberturasManual|_resolucionesCreditos)(\.|$)|\._proyOverrides\.[^.]*(Pago Préstamos|Renovaciones)|$)/;
function rutasFueraDeAlcance(e, valorLeido) {
  const rutas = rutasCambiadas(valorLeido, e.valorNuevo);
  if (e.id === 'finanzas') return rutas.filter((r) => !RUTA_PERMITIDA.test(r));
  if (e.id === 'maestro_tc') return rutas.filter((r) => !/^[A-Z]{2,3}-[A-Z]{3}(\.|$)/.test(r));
  if (/^nominas_/.test(e.id)) return rutas.filter((r) => !/^nominas\.\d+\.items\.\d+\.creditoVinculo(\.|$)/.test(r));
  return rutas;
}

const sello = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const leerJSON = (f) => { const t = fs.readFileSync(f, 'utf8'); return { texto: t, json: JSON.parse(t), sha: sha256(t) }; };

async function leerFilas(transporte, resultado) {
  const ids = new Set(['finanzas']);
  (resultado.operaciones || []).forEach((o) => ids.add(filaDeOp(o)));
  const crudas = await transporte.leer([...ids]);
  const filas = {};
  [...ids].forEach((id) => { filas[id] = decodificarFila(crudas.find((r) => r.id === id)); });
  return filas;
}

// ── informe legible ───────────────────────────────────────────────────
const ORDEN = ['aplicable', 'aprobada', 'posible_duplicado', 'pendiente_decision', 'omitida', 'no_aprobada', 'ya_aplicada', 'conflicto', 'no_encontrada', 'bloqueada', 'no_aplicable'];
const TITULO = { aplicable: 'APLICABLES', aprobada: 'POSIBLES DUPLICADOS APROBADOS (decisión individual)', posible_duplicado: 'POSIBLES DUPLICADOS', pendiente_decision: 'POSIBLES DUPLICADOS SIN DECISIÓN (no se aplican)',
  omitida: 'OMITIDAS POR DECISIÓN', no_aprobada: 'APLICABLES NO APROBADAS (no se aplican)', ya_aplicada: 'YA APLICADAS (se omiten)', conflicto: 'CONFLICTOS (no se aplican)',
  no_encontrada: 'NO ENCONTRADAS', bloqueada: 'BLOQUEADAS POR DEPENDENCIA', no_aplicable: 'ALERTAS / NO APLICABLES' };
const breve = (x) => { const s = JSON.stringify(x); return s && s.length > 220 ? s.slice(0, 220) + '…' : s; };

export function informeTexto({ modo, plan, resultado, shaResultado, destino, filas }) {
  const L = [];
  L.push(`CONCILIACIÓN DE CRÉDITOS — ${modo === 'ensayo' ? 'ENSAYO (no escribe nada)' : 'APLICACIÓN'}`);
  L.push(`Destino: ${destino}   Fecha: ${new Date().toISOString()}`);
  L.push(`Resultado: SHA-256 ${shaResultado}`);
  L.push(`Respaldo: ${(resultado.respaldo || {}).archivo || 's/n'} · ${(resultado.respaldo || {}).fecha || 's/f'} · SHA-256 ${(resultado.respaldo || {}).sha256 || 's/d'}`);
  L.push(`Antigüedad del respaldo: ${plan.diasRespaldo ?? 's/d'} día(s). Umbral de advertencia: ${UMBRAL_DIAS_RESPALDO} (no es garantía: cada operación se comprobó contra el estado leído ahora).`);
  L.push(`Versiones leídas: ${Object.entries(filas).map(([id, f]) => `${id}=${f.existe ? f.updated_at : 'NO EXISTE'}`).join(' · ')}`);
  if (plan.filasCambiadasDesdeRespaldo.length) L.push(`Filas modificadas en producción después del respaldo: ${plan.filasCambiadasDesdeRespaldo.join(', ')}`);
  plan.advertencias.forEach((a) => L.push(`ADVERTENCIA: ${a}`));
  L.push('', 'RESUMEN: ' + ORDEN.filter((k) => plan.resumen[k]).map((k) => `${k} ${plan.resumen[k]}`).join(' · '));
  ORDEN.forEach((k) => {
    const its = plan.items.filter((it) => it.estado === k);
    if (!its.length) return;
    L.push('', `── ${TITULO[k]} (${its.length})`);
    its.forEach((it) => {
      L.push(`  • ${it.clave}${it.etiqueta ? '  [' + it.etiqueta + ']' : ''}`);
      if (it.motivo) L.push(`      ${it.motivo}`);
      if (it.fijaUid) L.push(`      Crédito antiguo ubicado por huella: se le fija el uid ${it.fijaUid}.`);
      if (it.produccion !== undefined) L.push(`      En producción: ${breve(it.produccion)}`);
      if (it.decision) L.push(`      Decisión: ${it.decision.decision} · ${it.decision.motivo || ''}`);
    });
  });
  if (plan.posterioresAlRespaldo.length) {
    L.push('', `── REGISTRADO EN PRODUCCIÓN DESPUÉS DEL RESPALDO en los créditos afectados (${plan.posterioresAlRespaldo.length}) — se conserva`);
    plan.posterioresAlRespaldo.forEach((p) => L.push(`  • ${p.etiqueta} · ${p.tipo} · ${p.registro.id} · ${p.registro.fecha || p.registro.vencKey || ''}${p.registro.anulado ? ' (anulado)' : ''}`));
  }
  L.push('', `Filas que se escribirían: ${plan.escrituras.map((e) => `${e.id} (${e.ops.length} op.)`).join(', ') || 'ninguna'}`);
  return L.join('\n');
}

// ── ensayo ────────────────────────────────────────────────────────────
export async function ensayo({ resultadoPath, decisionesPath = null, transporte, salida, ahora = new Date() }) {
  const R = leerJSON(resultadoPath);
  const D = decisionesPath ? leerJSON(decisionesPath).json : null;
  if (D && D.resultadoSha256 !== R.sha) throw new Error('Las decisiones corresponden a otro archivo de resultado (SHA-256 distinto).');
  const filas = await leerFilas(transporte, R.json);
  const plan = planificar(R.json, filas, { decisiones: D, modo: 'ensayo', ahora });
  fs.mkdirSync(salida, { recursive: true });
  const s = sello(ahora);
  const texto = informeTexto({ modo: 'ensayo', plan, resultado: R.json, shaResultado: R.sha, destino: transporte.destino, filas });
  const json = { tipo: 'ensayo', fecha: ahora.toISOString(), destino: transporte.destino, resultadoSha256: R.sha,
    versionesLeidas: Object.fromEntries(Object.entries(filas).map(([id, f]) => [id, f.existe ? f.updated_at : null])), ...plan,
    escrituras: plan.escrituras.map((e) => ({ id: e.id, version: e.version, ops: e.ops })) };
  const jsonTxt = JSON.stringify(json, null, 2);
  fs.writeFileSync(path.join(salida, `ensayo_${s}.txt`), texto);
  fs.writeFileSync(path.join(salida, `ensayo_${s}.json`), jsonTxt);
  const plantilla = {
    formato: FORMATO_DECISIONES,
    instrucciones: 'Revisa el informe del ensayo. "aprobadas": deja SOLO las operaciones que apruebas. "duplicados": para cada posible duplicado indica decision "aplicar" u "omitir" y un motivo (sin motivo no cuenta). Firma con aprobadoPor y fechaAprobacion.',
    resultadoSha256: R.sha, ensayoSha256: sha256(jsonTxt), aprobadoPor: '', fechaAprobacion: '',
    aprobadas: plan.items.filter((it) => it.clase === 'aplicable').map((it) => it.clave),
    duplicados: Object.fromEntries(plan.items.filter((it) => it.clase === 'posible_duplicado').map((it) => [it.clave, {
      decision: (D && D.duplicados && D.duplicados[it.clave] && D.duplicados[it.clave].decision) || null,
      motivo: (D && D.duplicados && D.duplicados[it.clave] && D.duplicados[it.clave].motivo) || '',
      referencia: it.motivo, produccion: it.produccion }])),
  };
  fs.writeFileSync(path.join(salida, 'decisiones_plantilla.json'), JSON.stringify(plantilla, null, 2));
  return { plan, texto, archivos: { informe: `ensayo_${s}.txt`, json: `ensayo_${s}.json`, plantilla: 'decisiones_plantilla.json' } };
}

// ── aplicar ───────────────────────────────────────────────────────────
// hooks.antesDeEscribir(id) permite a las pruebas simular otro guardado
// entre la lectura y la escritura.
export async function aplicar({ resultadoPath, decisionesPath, transporte, salida, usuario, ahora = new Date(), hooks = {} }) {
  if (!String(usuario || '').trim()) throw new Error('Falta --usuario.');
  const R = leerJSON(resultadoPath);
  if (!decisionesPath) throw new Error('Falta --decisiones: sin aprobación no se aplica nada.');
  const DD = leerJSON(decisionesPath); const D = DD.json;
  if (D.formato !== FORMATO_DECISIONES) throw new Error('El archivo de decisiones no tiene el formato esperado.');
  if (D.resultadoSha256 !== R.sha) throw new Error('Las decisiones corresponden a otro archivo de resultado (SHA-256 distinto). No se aplica nada.');
  if (!String(D.aprobadoPor || '').trim() || !String(D.fechaAprobacion || '').trim()) throw new Error('Las decisiones no están firmadas (aprobadoPor / fechaAprobacion). No se aplica nada.');
  fs.mkdirSync(salida, { recursive: true });
  const s = sello(ahora);
  const audit = { tipo: 'aplicacion', inicio: new Date().toISOString(), usuario, destino: transporte.destino,
    resultado: { archivo: path.basename(resultadoPath), sha256: R.sha }, decisiones: { archivo: path.basename(decisionesPath), sha256: DD.sha, aprobadoPor: D.aprobadoPor, fechaAprobacion: D.fechaAprobacion, ensayoSha256: D.ensayoSha256 || null },
    respaldo: R.json.respaldo ? { archivo: R.json.respaldo.archivo, sha256: R.json.respaldo.sha256, fecha: R.json.respaldo.fecha } : null };

  // 1) relectura y clasificación con el estado actual (siempre)
  const filas = await leerFilas(transporte, R.json);
  const plan = planificar(R.json, filas, { decisiones: D, modo: 'aplicar', ahora });
  audit.versionesLeidas = Object.fromEntries(Object.entries(filas).map(([id, f]) => [id, f.existe ? f.updated_at : null]));
  audit.advertencias = plan.advertencias; audit.resumen = plan.resumen;
  audit.operaciones = plan.items.map((it) => ({ clave: it.clave, estado: it.estado, motivo: it.motivo || '', ...(it.decision ? { decision: it.decision } : {}), ...(it.fijaUid ? { fijaUid: it.fijaUid } : {}), ...(it.estado === 'bloqueada' ? { depende: it.depende } : {}) }));

  // 2) escritura atómica fila por fila
  audit.escrituras = [];
  let detenido = null;
  for (const e of plan.escrituras) {
    const fuera = rutasFueraDeAlcance(e, filas[e.id].valor);
    if (fuera.length) { detenido = { fila: e.id, motivo: 'fuera_de_alcance', rutas: fuera.slice(0, 20) }; break; }
    if (!e.version) { detenido = { fila: e.id, motivo: 'sin_version', detalle: 'La fila no tiene updated_at: no se puede escribir de forma condicionada.' }; break; }
    if (hooks.antesDeEscribir) await hooks.antesDeEscribir(e.id);
    let nuevoTs = new Date().toISOString();
    if (nuevoTs === e.version) nuevoTs = new Date(Date.parse(nuevoTs) + 1).toISOString();
    const r = await transporte.escribirCondicionado(e.id, e.version, codificarValor(e.valorNuevo, e.enc), nuevoTs);
    audit.escrituras.push({ fila: e.id, versionLeida: e.version, versionNueva: r.ok ? r.updatedAt : null, ok: r.ok, motivo: r.ok ? '' : r.motivo, ops: e.ops });
    if (!r.ok) { detenido = { fila: e.id, motivo: r.motivo, detalle: r.motivo === 'conflicto' ? 'La fila cambió después de leerla: la base rechazó la escritura (0 filas). Repite el ensayo.' : (r.texto || '') }; break; }
    e.versionNueva = r.updatedAt;
  }
  audit.detenido = detenido;
  const escritas = plan.escrituras.filter((e) => e.versionNueva);
  const aplicadas = escritas.flatMap((e) => e.ops);
  audit.aplicadas = aplicadas;
  audit.noEscritas = plan.escrituras.filter((e) => !e.versionNueva).map((e) => ({ fila: e.id, ops: e.ops }));

  // 3) verificación posterior (relectura)
  const filasDespues = await leerFilas(transporte, R.json);
  audit.verificacion = verificar(R.json, filasDespues, aplicadas, escritas);
  audit.fin = new Date().toISOString();
  audit.estado = detenido ? (aplicadas.length ? 'parcial_detenido' : 'detenido_sin_cambios') : (audit.verificacion.ok ? 'ok' : 'verificacion_fallida');

  const texto = informeTexto({ modo: 'aplicar', plan, resultado: R.json, shaResultado: R.sha, destino: transporte.destino, filas })
    + `\n\nRESULTADO: ${audit.estado}` + (detenido ? `\nDetenido en ${detenido.fila}: ${detenido.motivo}. ${detenido.detalle || ''}` : '')
    + `\nFilas escritas: ${escritas.map((e) => `${e.id} ${e.version} → ${e.versionNueva}`).join(' · ') || 'ninguna'}`
    + `\nVerificación: ${audit.verificacion.ok ? 'OK' : 'FALLÓ: ' + audit.verificacion.fallas.join(' | ')}`;
  const auditTxt = JSON.stringify(audit, null, 2);
  fs.writeFileSync(path.join(salida, `auditoria_${s}.json`), auditTxt);
  fs.writeFileSync(path.join(salida, `auditoria_${s}.txt`), texto);
  fs.appendFileSync(path.join(salida, 'auditoria.jsonl'), JSON.stringify({ fecha: audit.fin, usuario, destino: audit.destino, estado: audit.estado,
    resultadoSha256: R.sha, decisionesSha256: DD.sha, aplicadas: aplicadas.length, filas: audit.escrituras.map((x) => `${x.fila}:${x.ok ? 'ok' : x.motivo}`), archivo: `auditoria_${s}.json`, sha256: sha256(auditTxt) }) + '\n');
  return { audit, plan, texto };
}

// ── CLI ───────────────────────────────────────────────────────────────
function args(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (k.startsWith('--')) a[k.slice(2)] = argv[++i]; else a._.push(k); }
  return a;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = args(process.argv.slice(2));
  const modo = a._[0];
  try {
    if (!['ensayo', 'aplicar'].includes(modo)) throw new Error('Uso: aplicar.mjs ensayo|aplicar --resultado X.json --destino http://127.0.0.1:PUERTO --salida carpeta [--decisiones D.json] [--usuario "Nombre"]');
    if (!a.resultado || !a.destino || !a.salida) throw new Error('Faltan --resultado, --destino o --salida.');
    const transporte = transportePostgrest(a.destino);
    if (modo === 'ensayo') {
      const r = await ensayo({ resultadoPath: a.resultado, decisionesPath: a.decisiones || null, transporte, salida: a.salida });
      console.log(r.texto); console.log(`\nArchivos en ${a.salida}: ${Object.values(r.archivos).join(', ')}`);
    } else {
      const r = await aplicar({ resultadoPath: a.resultado, decisionesPath: a.decisiones, transporte, salida: a.salida, usuario: a.usuario });
      console.log(r.texto);
      process.exit(r.audit.estado === 'ok' ? 0 : 3);
    }
  } catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
}
