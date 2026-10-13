/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// persistContract.js — Contrato ÚNICO y autoritativo de persistencia a
// `calendario_data` (P0-1, GO-LIVE BLOCKER).
//
// POR QUÉ EXISTE
// Hoy conviven dos contratos de guardado (ver docs/persistencia-rca.md):
//   BUENO  = friskuHelpers.dbSaveGeneric + OsirisModule.dbSaveOsiris
//            (concurrencia optimista + confirmación por el servidor + fusión por
//             ítem + AvisoPersistencia). Cumple el invariante.
//   MALO   = FinanzasModule.dbSave / App.dbSave(main) / App.dbSavePins /
//            AllegriaModule / EEFF / Nóminas v1 (upsert LWW fire-and-forget,
//            error tragado, "✅ Guardado" sin escritura confirmada).
// El defecto es de CONTRATO, no de una fila: el invariante
//     UI "guardado" = el backend confirmó la persistencia autoritativa
// no está garantizado a nivel transversal. Este módulo lo garantiza en UN solo
// lugar reutilizable, y sirve tanto para las filas-blob (main/finanzas/pins/
// allegria/osiris/escenarios — objeto anidado no fusionable) como para las
// filas-colección (rendiciones/maestros — arreglo de ítems con `id`).
//
// EXTRACCIÓN, NO COPIA
// Se generaliza el contrato de Frisku/Osiris: la lógica de versión/base, la
// escritura condicionada+confirmada y la fusión por ítem se sacan a una fábrica
// con estado por-instancia (no globales de módulo) y transporte inyectable, para
// poder ejercerla offline en el harness PERSIST-01..15 sin levantar la app.
//
// LOS 15 REQUISITOS (mapa → dónde se cumplen)
//   1  "saved" solo tras confirmación del backend        → _escribirCondicionado + saveConfirmed
//   2  fallo de escritura ⇒ dirty/error, nunca saved      → saveConfirmed devuelve {ok:false}; marcarSucio
//   3  jamás resolver éxito sin escritura real            → sin gates que devuelvan true; superseded≠saved-a-backend
//   4  sin `.catch(()=>{})` silencioso                    → catch registra y devuelve {ok:false,motivo:"red"}
//   5  concurrencia optimista por updated_at/version      → PATCH ...&updated_at=eq.<version>
//   6  detectar conflicto ANTES de sobrescribir           → 0 filas devueltas ⇒ conflicto, no se pisa
//   7  sin LWW de fila completa silencioso                → conflicto explícito o fusión por ítem
//   8  dirty local protegido de realtime/poll             → reconcileIncoming respeta isDirty
//   9  save lento + edición nueva no se pierde            → cola serializada + coalescencia (último valor gana)
//   10 retry idempotente seguro                           → server ya igual ⇒ {ok:true,sinCambios:true}
//   11 el usuario se entera si no persistió               → construirAvisoDesde() (usa AvisoPersistencia)
//   12 navegación/unload nunca finge éxito                → flush() devuelve el resultado real; sin resolve(true)
//   13 401/403/timeout/red nunca es éxito                 → _escribirCondicionado {ok:false,motivo:"http"/"red"}
//   14 HTTP 2xx pero fila/versión no confirma ⇒ NO saved  → chequeo de representation (updated_at + id)
//   15 logs de diagnóstico sin datos sensibles            → solo id/estado/tamaño/versión truncada
//
// ───────────────────────────────────────────────────────────────────────────────
// CONFLICTO PENDIENTE (oct-2026) — por qué un conflicto NO se puede "olvidar"
// Antes, un conflicto de fila-blob dejaba la fila en un estado que habilitaba el
// siguiente guardado a PISAR en silencio el trabajo ajeno:
//   paso 1  dos sesiones cargan `finanzas` en la versión V1.
//   paso 2  la sesión 1 guarda → el servidor queda en V2.
//   paso 3  la sesión 2 guarda su estado (computeNext como VALOR, así lo llama
//           FinanzasModule.dbSave) → PATCH condicionado a V1 actualiza 0 filas →
//           CONFLICTO. Pero antes de devolverlo se hacía
//           `_registrarLectura(id, actual.valor, actual.updatedAt)`, que ADELANTABA
//           `_version` a V2.
//   paso 4  el auto-save de la sesión 2 reintenta el MISMO estado obsoleto → ahora
//           el PATCH está condicionado a V2 → pasa → el guardado de la sesión 1
//           desaparece sin que nadie se entere. LWW silencioso, justo lo que el
//           req 7 prohíbe.
// `reconcileIncoming` tenía el mismo defecto (hacía `_version.set(id, remoteVersion)`
// "para que el próximo saveConfirmed detecte el conflicto", cuando en realidad se lo
// quitaba de encima).
// AHORA: un conflicto de blob deja la fila en CONFLICTO PENDIENTE (`_conflicto`).
// Mientras ese estado esté puesto, `saveConfirmed` NO escribe y devuelve
// `MOTIVOS.CONFLICTO_PENDIENTE`; los cambios locales se conservan intactos (no se
// descartan, no se pisan, no se fusionan solos: son operaciones financieras, no se
// fusionan sin decisión humana). Se sale SOLO por una de dos puertas explícitas:
//   (a) recuperarDelServidor(id)         → releer y devolver el valor vigente para
//                                          que el caller lo aplique, DESCARTANDO lo local.
//   (b) reconciliarConservandoLocal(id, …) → el caller declara que quiere escribir
//                                          encima de la versión vigente; se relee para
//                                          conocerla y recién entonces se escribe
//                                          condicionado a ESA versión.
// Ninguna de las dos puede ser el camino por defecto de un auto-save: las dos las
// invoca el caller a pedido del usuario.
// ───────────────────────────────────────────────────────────────────────────────

import { fusionarPorId, clonarValor, valoresIguales, esListaFusionable } from "../friskuPersistencia.js";

// Constantes productivas (idénticas a friskuHelpers / módulos). El transporte es
// inyectable en el constructor para que el harness corra sin red.
const SUPA_URL_DEFAULT = (typeof process !== "undefined" && process.env && process.env.REACT_APP_SUPA_URL) ||
  "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY_DEFAULT = (typeof process !== "undefined" && process.env && process.env.REACT_APP_SUPA_KEY) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

// Motivos canónicos de fallo (para que la UI y el harness razonen igual).
export const MOTIVOS = Object.freeze({
  RED: "red",                       // fetch lanzó (offline/timeout/DNS)      req 13
  HTTP: "http",                     // status ≠ 2xx (incluye 401/403 RLS)     req 13
  CONFLICTO: "conflicto",           // la fila cambió; no fusionable          req 6/7
  CONFLICTO_ITEM: "conflicto_item", // los dos tocaron el mismo ítem          req 7
  // La fila quedó en conflicto y nadie lo resolvió todavía: NO se escribe hasta
  // que el caller elija recuperarDelServidor() o reconciliarConservandoLocal().
  CONFLICTO_PENDIENTE: "conflicto_pendiente",
  SIN_CONFIRMACION: "sin_confirmacion", // 2xx sin representation válida       req 14
  SIN_CARGA: "sin_carga",           // Regla 9: no hubo carga previa exitosa
  REINTENTOS: "reintentos_agotados",
});

// Logger por defecto: consola, SIN volcar `value` (datos sensibles). req 15
const LOGGER_DEFAULT = {
  info: (...a) => { try { console.log(...a); } catch {} },
  warn: (...a) => { try { console.warn(...a); } catch {} },
  error: (...a) => { try { console.error(...a); } catch {} },
};

function _bytesDe(str) {
  try { return new TextEncoder().encode(str).length; } catch { return (str && str.length ? str.length * 2 : 0); }
}
function _versionCorta(v) { const s = String(v || ""); return s.length > 8 ? s.slice(11, 19) : s; }

// ── Saneo para jsonb OBJETO (HF-JSONB) ────────────────────────────────────────
// Postgres jsonb NO admite en texto ni U+0000 ni sustitutos UTF-16 sueltos. Al
// escribir una fila como OBJETO jsonb (hoy solo `main`), esos caracteres — que
// llegan del texto tipeado por el usuario (comentarios/estados de Tareas) — hacen
// que el PATCH falle con HTTP 400 (22P05 "unsupported Unicode escape sequence" o
// PGRST102 "Empty or invalid json"), y `main` deja de guardarse en CADA ciclo. Las
// filas string-encoded (usuarios/pins/finanzas) NO sufren esto porque el doble
// JSON.stringify guarda el escape como texto literal, nunca como carácter jsonb.
// Se sanea SOLO el camino OBJETO (ver _codificarValue) para no alterar un solo byte
// de las filas string-encoded ya certificadas. U+0000 se elimina (jsonb no puede
// almacenarlo de ninguna forma); un sustituto suelto se reemplaza por U+FFFD (el
// par válido de un emoji se conserva intacto). Devuelve copia; no muta la entrada.
function _sanearStrJsonb(s) {
  var necesita = false;
  for (var j = 0; j < s.length; j++) { var cc = s.charCodeAt(j); if (cc === 0 || (cc >= 0xD800 && cc <= 0xDFFF)) { necesita = true; break; } }
  if (!necesita) return s;
  var REPL = String.fromCharCode(0xFFFD); // U+FFFD, sin escapes en fuente
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c === 0) continue;                                    // U+0000 -> dropear
    if (c >= 0xD800 && c <= 0xDBFF) {                         // high surrogate
      var n = s.charCodeAt(i + 1);
      if (n >= 0xDC00 && n <= 0xDFFF) { out += s[i] + s[i + 1]; i++; continue; } // par valido
      out += REPL; continue;                                  // high suelto
    }
    if (c >= 0xDC00 && c <= 0xDFFF) { out += REPL; continue; } // low suelto
    out += s[i];
  }
  return out;
}
function _sanearJsonb(v) {
  if (typeof v === "string") return _sanearStrJsonb(v);
  if (Array.isArray(v)) return v.map(_sanearJsonb);
  if (v && typeof v === "object") {
    var o = {};
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[_sanearStrJsonb(k)] = _sanearJsonb(v[k]);
    return o;
  }
  return v; // number/boolean/null/undefined -> tal cual
}

// ═══════════════════════════════════════════════════════════════════════════════
// FÁBRICA — una instancia por app (o por test). Estado (versión/base/dirty/cola)
// vive en la instancia, no en globales de módulo.
// ═══════════════════════════════════════════════════════════════════════════════
// JSON canónico (claves ordenadas) para comparar CONTENIDO sin depender del orden
// de las claves. `undefined` se omite en objetos (JSON.stringify hace lo mismo al
// serializar) y se normaliza a "null" en los escalares, así el canónico coincide
// con lo que realmente viaja a la columna `value`.
export function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(",")}}`;
  return v === undefined ? "null" : JSON.stringify(v);
}

export function crearPersistencia(opts = {}) {
  const fetchImpl = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
  const SUPA_URL = opts.supaUrl || SUPA_URL_DEFAULT;
  const SUPA_KEY = opts.supaKey || SUPA_KEY_DEFAULT;
  const log = opts.logger || LOGGER_DEFAULT;
  if (!fetchImpl) throw new Error("persistContract: no hay fetch disponible (inyecta opts.fetch en tests)");

  // ── Estado por fila ──────────────────────────────────────────────────────────
  const _version = new Map();  // id -> updated_at con el que leí (base del optimistic lock)
  const _base = new Map();     // id -> valor tal como vino del servidor (para fusión 3-vías)
  const _cargaOk = new Map();  // id -> true solo tras una carga exitosa (Regla 9)
  const _dirty = new Map();    // id -> true si hay edición local sin confirmar (req 8)
  // Codificación FÍSICA de la columna `value` por fila (F0-C). Las filas vivas
  // conviven en dos formatos: string-encoded (un JSON string DENTRO del jsonb) u
  // objeto jsonb. Se preserva el formato de CADA fila en cada escritura para no
  // migrar a ciegas (una pestaña en el bundle VIEJO que hiciera JSON.parse(value)
  // se rompería si un objeto jsonb apareciera donde antes había string).
  const _encoding = new Map(); // id -> 'string' | 'object'
  // Último valor CONFIRMADO POR EL SERVIDOR: lo que una LECTURA real trajo o lo que
  // una escritura confirmada dejó. Es la única referencia válida del guardia "sin
  // cambios efectivos".
  //
  // POR QUÉ CONTRA `_servidor` Y NUNCA CONTRA `_base`: `_base` es el ancestro que usa
  // la fusión/recomputación y puede ser un valor TRANSFORMADO EN MEMORIA. Caso real:
  // App.jsx registra `usuarios` con la lista ya fusionada con WORKERS_BASE
  // (App.jsx:2222 → permisosUsuariosStore.registrarCarga), que NO es lo que hay en la
  // fila. Si el guardia comparara contra `_base`, esa migración (dar acceso a
  // `rendiciones`) se vería "sin cambios" y NUNCA se escribiría. Por eso
  // `registrarCarga` SIN el parámetro `valorServidor` deja el servidor como
  // DESCONOCIDO (borra la entrada) y el guardia no actúa hasta que haya una lectura
  // o una escritura confirmada: preferimos un PATCH de más antes que una migración
  // perdida.
  const _servidor = new Map();  // id -> valor confirmado por el servidor (o ausente = desconocido)
  // Conflicto sin resolver por fila (ver cabecera "CONFLICTO PENDIENTE").
  // id -> { version, valorServidor, ts, motivoOrigen }
  const _conflicto = new Map();
  const _ultimoMotivo = new Map(); // id -> último motivo de fallo (para la UI)
  const _enVuelo = new Map();      // id -> guardados encolados/en vuelo (indicador "guardando…")
  // Cola de coalescencia por id (req 9/10): cadena de promesas + último valor deseado + generación.
  const _cadena = new Map();   // id -> Promise
  const _deseado = new Map();  // id -> { value, opts }
  const _gen = new Map();      // id -> número de la última solicitud encolada

  const cab = () => ({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` });
  const cabJson = () => ({ ...cab(), "Content-Type": "application/json" });

  // ── Lectura cruda (lanza ante red/HTTP: Regla 9 / req 13) ─────────────────────
  async function _leerFila(id) {
    const res = await fetchImpl(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&select=value,updated_at`, {
      headers: { ...cab(), "Cache-Control": "no-cache" },
    });
    if (!res.ok) throw new Error(`lectura ${id} HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`lectura ${id}: respuesta inesperada`);
    if (rows.length === 0) return { existe: false, valor: null, updatedAt: null, encoding: null };
    const v = rows[0].value;
    // F0-C: la codificación física de la fila = cómo vino `value` del servidor.
    // string → string-encoded; cualquier otra cosa (objeto/array) → jsonb objeto.
    // Se registra SIEMPRE que se lee una fila existente, para preservarla al escribir.
    const encoding = typeof v === "string" ? "string" : "object";
    _encoding.set(id, encoding);
    return { existe: true, valor: typeof v === "string" ? JSON.parse(v) : v, updatedAt: rows[0].updated_at || null, encoding };
  }

  // `delServidor` = true cuando `valor` viene de una LECTURA real de la fila (load,
  // relectura por conflicto, detección de codificación). Solo en ese caso se puede
  // afirmar qué tiene el servidor.
  function _registrarLectura(id, valor, updatedAt, delServidor) {
    _version.set(id, updatedAt === undefined ? null : updatedAt);
    _base.set(id, clonarValor(valor));
    if (delServidor) _servidor.set(id, clonarValor(valor));
  }

  // F0-C: codifica el objeto para la columna `value` respetando la codificación
  // física de la fila. 'string' → un ÚNICO JSON.stringify (jamás doble). 'object'
  // → el objeto tal cual (jsonb). Fila nueva sin codificación conocida → 'string'
  // por defecto (legacy-dominante, seguro para rollback del frontend).
  function _codificarValue(id, obj) {
    const enc = _encoding.get(id) || "string";
    // HF-JSONB: al escribir como OBJETO jsonb se sanea U+0000 / sustitutos sueltos
    // (Postgres los rechaza con 400). El camino string queda byte-idéntico.
    return enc === "object" ? _sanearJsonb(obj) : JSON.stringify(obj);
  }

  // ── Escritura CONDICIONADA + CONFIRMADA ───────────────────────────────────────
  // No se declara guardado porque el fetch no lanzó: se declara porque el servidor
  // devolvió la fila escrita con un updated_at nuevo. (req 1/5/6/13/14)
  async function _escribirCondicionado(id, value, version) {
    const nuevoTs = new Date().toISOString();
    // F0-C: preserva la codificación física de ESTA fila (string-encoded vs objeto
    // jsonb). `valueField` es lo que va literalmente a la columna `value`.
    const valueField = _codificarValue(id, value);
    const body = JSON.stringify({ id, value: valueField, updated_at: nuevoTs });
    let res;
    if (version) {
      // PATCH condicionado: si la fila ya no está en `version`, PostgREST actualiza 0
      // filas y devuelve []. Eso es un CONFLICTO, no un éxito: no se pisa nada. (req 5/6)
      const url = `${SUPA_URL}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(version)}`;
      res = await fetchImpl(url, { method: "PATCH", headers: { ...cabJson(), Prefer: "return=representation" },
        body: JSON.stringify({ value: valueField, updated_at: nuevoTs }) });
    } else {
      // Sin versión conocida: la fila no existía al cargar. Se crea (upsert). El
      // merge-duplicates cubre la carrera de dos "primeras" escrituras.
      res = await fetchImpl(`${SUPA_URL}/rest/v1/calendario_data`, { method: "POST",
        headers: { ...cabJson(), Prefer: "resolution=merge-duplicates,return=representation" }, body });
    }
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      return { ok: false, motivo: MOTIVOS.HTTP, status: res.status, detalle: detalle.slice(0, 200) };
    }
    const filas = await res.json().catch(() => []);
    // 0 filas en un PATCH condicionado = la versión ya no existe = conflicto. (req 6)
    if (!Array.isArray(filas) || filas.length === 0) {
      return version ? { ok: false, motivo: MOTIVOS.CONFLICTO } : { ok: false, motivo: MOTIVOS.SIN_CONFIRMACION };
    }
    // 2xx pero la representación no confirma la fila/versión ⇒ NO es éxito. (req 14)
    const fila = filas[0];
    if (!fila.updated_at) return { ok: false, motivo: MOTIVOS.SIN_CONFIRMACION };
    if (fila.id != null && String(fila.id) !== String(id)) return { ok: false, motivo: MOTIVOS.SIN_CONFIRMACION };
    return { ok: true, updatedAt: fila.updated_at };
  }

  // ── CARGA pública. Lanza ante fallo (Regla 9). Registra versión/base. ──────────
  // Nota: `load` declara el estado del servidor como la verdad vigente de la sesión
  // (ya ponía `dirty=false` antes de oct-2026), así que también retira un conflicto
  // pendiente: el caller recibe el valor del servidor y lo aplica. `recuperarDelServidor`
  // es exactamente esta operación con la semántica explicitada (salida (a)).
  async function load(id) {
    const { existe, valor, updatedAt } = await _leerFila(id);
    _registrarLectura(id, existe ? valor : null, updatedAt, true);
    _cargaOk.set(id, true);
    _dirty.set(id, false);
    _conflicto.delete(id);
    _ultimoMotivo.delete(id);
    return { ok: true, existe, value: existe ? valor : null, version: updatedAt };
  }

  // Si otra ruta ya cargó la fila (p. ej. App.jsx carga `main` una vez), permite
  // registrar esa lectura para habilitar el guardado sin releer.
  // `encoding` (F0-C, opcional): pista de la codificación física CRUDA que leyó el
  // caller — 'string'/'object', o un booleano `esString`. IMPORTANTE: los call sites
  // pasan `typeof raw.value === "string"`, que da `false` TANTO para una fila objeto
  // COMO para una fila inexistente/vacía. Por eso `false` NO significa 'object': se
  // trata como DESCONOCIDO y se resuelve por detección perezosa en el primer write
  // (lee la fila → si es objeto, 'object'; si no existe, default 'string'). Solo el
  // literal 'object' fija 'object' de forma explícita. Así nunca se migra objeto→string
  // ni string→objeto por accidente, y una fila nueva queda 'string' (rollback-safe).
  // `valorServidor` (opcional, oct-2026): lo que vino REALMENTE de la fila cuando
  // `valor` es una versión transformada en memoria (p. ej. `usuarios` fusionado con
  // WORKERS_BASE). Sin él, el servidor queda DESCONOCIDO y el guardia "sin cambios
  // efectivos" no actúa sobre esta fila hasta que haya una lectura (`load`) o una
  // escritura confirmada: así una migración nunca se confunde con "no hay nada que
  // guardar". Pasarlo habilita el guardia desde el primer auto-save.
  function registrarCarga(id, valor, version, encoding, valorServidor) {
    _registrarLectura(id, valor, version);
    if (valorServidor !== undefined) _servidor.set(id, clonarValor(valorServidor));
    else _servidor.delete(id); // servidor desconocido → guardia apagado (ver _servidor)
    if (encoding === true || encoding === "string") _encoding.set(id, "string");
    else if (encoding === "object") _encoding.set(id, "object");
    // encoding === false / undefined → NO se fija: detección perezosa (o el default
    // 'string' si la fila resulta inexistente/nueva).
    _cargaOk.set(id, true);
    _dirty.set(id, false);
    _conflicto.delete(id);  // carga nueva declarada por el caller: estado limpio
    _ultimoMotivo.delete(id);
  }

  // ── Núcleo del guardado: read-version → conditional write → confirm → merge. ──
  // `computeNext` puede ser un valor o una función (baseConocida) => valor. La forma
  // función permite recomputar contra la base fresca tras un conflicto (retry seguro).
  async function _guardarUnaVez(id, computeNext, o) {
    if (!_cargaOk.get(id)) {
      log.error(`[persist:${id}] ❌ GUARDADO BLOQUEADO: sin carga previa exitosa (Regla 9).`);
      return { ok: false, motivo: MOTIVOS.SIN_CARGA };
    }
    // ── PUERTA 1: conflicto pendiente ⇒ no se escribe NADA. ─────────────────────
    // Mientras la fila esté en conflicto sin resolver, ni este guardado ni los
    // auto-saves que vengan detrás pueden tocar el servidor (era justo así como el
    // segundo intento pisaba en silencio el trabajo ajeno). Los cambios locales se
    // conservan: `dirty` sigue en true y nada los sobrescribe. Se sale SOLO por
    // recuperarDelServidor() o reconciliarConservandoLocal().
    const cfl = _conflicto.get(id);
    if (cfl) {
      _ultimoMotivo.set(id, MOTIVOS.CONFLICTO_PENDIENTE);
      log.warn(`[persist:${id}] ⛔ guardado bloqueado: conflicto sin resolver (v${_versionCorta(cfl.version)}). Hay que elegir recuperar del servidor o reconciliar conservando lo local.`);
      return {
        ok: false, motivo: MOTIVOS.CONFLICTO_PENDIENTE, conflictoPendiente: true,
        version: cfl.version, valorServidor: clonarValor(cfl.valorServidor),
        motivoOrigen: cfl.motivoOrigen, conflictos: cfl.conflictos || [],
      };
    }

    const esColeccion = !!o.merge;
    const maxIntentos = o.intentos == null ? 2 : o.intentos;
    const producir = (base) => (typeof computeNext === "function" ? computeNext(base) : computeNext);

    let fusionado = false, cambios = null;
    let aGuardar = producir(_base.get(id));

    // ── PUERTA 2: sin cambios efectivos ⇒ no se escribe. ────────────────────────
    // Solo cuando la fila EXISTE con versión conocida y el valor es idéntico (JSON
    // canónico) a lo último CONFIRMADO POR EL SERVIDOR. Una fila nueva, una siembra o
    // una migración (servidor desconocido o versión ausente) se escriben como siempre;
    // `o.forzar` escribe igual. No se compara contra `_base`: ver el comentario de
    // `_servidor` (una base transformada en memoria haría pasar una migración por
    // "sin cambios").
    if (!o.forzar && _version.get(id) && _servidor.has(id) && _servidor.get(id) != null
        && canonico(_servidor.get(id)) === canonico(aGuardar)) {
      log.info(`[persist:${id}] = sin cambios respecto del servidor: no se escribe (v${_versionCorta(_version.get(id))})`);
      return { ok: true, value: aGuardar, version: _version.get(id), fusionado: false, cambios: null, sinCambios: true, noEscrito: true };
    }

    try {
      // F0-C: si la codificación física de la fila aún no se conoce (registrada por
      // otra ruta SIN pista) pero SÍ tenemos versión (no vamos a releer en el loop),
      // hacemos una lectura de detección para preservarla. `_leerFila` fija _encoding
      // como efecto lateral; lanza ante red → lo captura el catch de abajo (no se
      // intenta escribir a ciegas). Si la fila no existe, quedará el default 'string'.
      if (!_encoding.has(id) && _version.has(id)) {
        await _leerFila(id);
      }
      for (let intento = 0; intento <= maxIntentos; intento++) {
        if (!_version.has(id)) {
          const actual = await _leerFila(id);
          _registrarLectura(id, actual.valor, actual.updatedAt, true);
          aGuardar = producir(_base.get(id));
        }
        const r = await _escribirCondicionado(id, aGuardar, _version.get(id));
        if (r.ok) {
          _version.set(id, r.updatedAt);
          _base.set(id, clonarValor(aGuardar));
          _servidor.set(id, clonarValor(aGuardar)); // confirmado por el servidor
          _ultimoMotivo.delete(id);
          const kb = Math.round(_bytesDe(JSON.stringify(aGuardar)) / 1024);
          log.info(`[persist:${id}] ✅ guardado y confirmado (${kb} KB · v${_versionCorta(r.updatedAt)}${fusionado ? " · fusionado" : ""})`);
          return { ok: true, value: aGuardar, version: r.updatedAt, fusionado, cambios };
        }
        if (r.motivo !== MOTIVOS.CONFLICTO) {
          log.error(`[persist:${id}] ❌ NO SE GUARDÓ — ${r.motivo}${r.status ? " HTTP " + r.status : ""}`);
          _ultimoMotivo.set(id, r.motivo);
          return r; // http (401/403/5xx), sin_confirmacion, red → NO es éxito (req 2/13/14)
        }

        // CONFLICTO: alguien escribió después de nuestra última lectura. (req 6/7)
        const actual = await _leerFila(id);
        const base = _base.has(id) ? _base.get(id) : null;

        if (valoresIguales(actual.valor, aGuardar)) {
          // Lo que queríamos ya está en el servidor (retry idempotente). (req 10)
          _registrarLectura(id, actual.valor, actual.updatedAt, true);
          _ultimoMotivo.delete(id);
          return { ok: true, value: actual.valor, version: actual.updatedAt, fusionado, cambios, sinCambios: true };
        }

        if (esColeccion && esListaFusionable(aGuardar) && esListaFusionable(actual.valor)) {
          // Filas-colección: fusión por ítem. Nadie pierde salvo edición del MISMO ítem.
          const f = fusionarPorId(base, aGuardar, actual.valor);
          if (f.ok && f.conflictos.length === 0) {
            _version.set(id, actual.updatedAt);
            _base.set(id, clonarValor(actual.valor));
            _servidor.set(id, clonarValor(actual.valor));
            aGuardar = f.valor; fusionado = true; cambios = f.cambios;
            log.info(`[persist:${id}] ↻ fusionado (${f.cambios.ajenosPreservados} ítems ajenos preservados). Reintentando.`);
            continue;
          }
          // Colección que NO se puede fusionar (los dos tocaron el mismo ítem): el
          // servidor queda intacto y la fila entra en conflicto pendiente, por el MISMO
          // motivo que el blob: antes se adelantaba la versión y el reintento siguiente
          // pisaba el ítem ajeno sin avisar.
          const motivo = f.ok ? MOTIVOS.CONFLICTO_ITEM : MOTIVOS.CONFLICTO;
          _marcarConflicto(id, actual.updatedAt, actual.valor, motivo, f.ok ? f.conflictos : []);
          log.warn(`[persist:${id}] ⚠️ CONFLICTO (${motivo}). No se sobrescribió nada.`);
          return { ok: false, motivo, conflictoPendiente: true, conflictos: f.ok ? f.conflictos : [], valorServidor: actual.valor, version: actual.updatedAt };
        }

        // Filas-blob (objeto anidado no fusionable): NO se pisa a ciegas (req 7).
        // Si el caller pasó `computeNext` como FUNCIÓN, recomputamos contra la base
        // fresca del servidor y reintentamos (eeffHelpers / permisosUsuariosStore:
        // la función ES la política de fusión, así que adoptar la versión fresca es
        // parte del contrato y no un clobber).
        if (typeof computeNext === "function") {
          _registrarLectura(id, actual.valor, actual.updatedAt, true);
          aGuardar = producir(actual.valor); fusionado = true;
          log.info(`[persist:${id}] ↻ recomputado contra la versión fresca del servidor. Reintentando.`);
          continue;
        }
        // computeNext como VALOR (FinanzasModule.dbSave, App.dbSave/dbSavePins,
        // AllegriaModule): no hay política de fusión posible. La fila queda en
        // CONFLICTO PENDIENTE y NO se adelanta `_version`, así ningún reintento del
        // auto-save puede pasar el PATCH condicionado con el estado obsoleto.
        _marcarConflicto(id, actual.updatedAt, actual.valor, MOTIVOS.CONFLICTO, []);
        log.warn(`[persist:${id}] ⚠️ CONFLICTO (blob). No se sobrescribió nada; se conservó el servidor. La fila queda bloqueada hasta resolverlo.`);
        return { ok: false, motivo: MOTIVOS.CONFLICTO, conflictoPendiente: true, valorServidor: actual.valor, version: actual.updatedAt };
      }
      log.error(`[persist:${id}] ❌ NO SE GUARDÓ — reintentos agotados`);
      _ultimoMotivo.set(id, MOTIVOS.REINTENTOS);
      return { ok: false, motivo: MOTIVOS.REINTENTOS };
    } catch (e) {
      // req 4/13: la excepción de red NUNCA se traga en silencio.
      log.error(`[persist:${id}] ❌ Error de red al guardar:`, String((e && e.message) || e));
      _ultimoMotivo.set(id, MOTIVOS.RED);
      return { ok: false, motivo: MOTIVOS.RED, detalle: String((e && e.message) || e) };
    }
  }

  // Deja la fila en CONFLICTO PENDIENTE. NO toca `_base` (los cambios locales del
  // caller se conservan) ni `_version` (la versión conocida sigue siendo la vieja, así
  // que ni un PATCH accidental podría pasar). SÍ actualiza `_servidor`: eso es lo que
  // la fila tiene AHORA, y el guardia "sin cambios" no debe dar por guardado algo que
  // el servidor ya no tiene.
  function _marcarConflicto(id, version, valorServidor, motivoOrigen, conflictos) {
    _conflicto.set(id, { version: version == null ? null : version, valorServidor: clonarValor(valorServidor), ts: Date.now(), motivoOrigen, conflictos: conflictos || [] });
    if (valorServidor !== undefined) _servidor.set(id, clonarValor(valorServidor));
    _dirty.set(id, true);
    _ultimoMotivo.set(id, motivoOrigen || MOTIVOS.CONFLICTO);
  }

  // ── saveConfirmed — API pública. Serializa y COALESCE por id. ─────────────────
  // req 9/10: mientras un guardado está en vuelo, una edición nueva no se pierde;
  // se registra como el "último valor deseado" y se guarda al terminar el actual.
  // Solo la última solicitud encolada llega a escribir; las anteriores se marcan
  // `superseded` (NO "guardado a backend", pero tampoco pérdida: el último valor las
  // contiene). El estado dirty se limpia solo cuando el servidor confirma.
  function saveConfirmed(id, computeNext, options = {}) {
    _dirty.set(id, true);
    _enVuelo.set(id, (_enVuelo.get(id) || 0) + 1);   // "guardando…" desde el encolado
    const miGen = (_gen.get(id) || 0) + 1;
    _gen.set(id, miGen);
    _deseado.set(id, { value: computeNext, opts: options });

    const previa = _cadena.get(id) || Promise.resolve();
    const corrida = previa.then(async () => {
      try {
        // ¿Me superó una edición posterior mientras esperaba en la cola?
        if (_gen.get(id) !== miGen) {
          return { ok: true, superseded: true, id };
        }
        const d = _deseado.get(id);
        const res = await _guardarUnaVez(id, d.value, d.opts || {});
        // Solo se limpia el "sucio" si YO era la última solicitud y el backend confirmó.
        if (_gen.get(id) === miGen) {
          if (res.ok) _dirty.set(id, false);
          else _dirty.set(id, true); // sigue sucio hasta que alguien logre confirmar (req 2)
        }
        return { ...res, id };
      } finally {
        _enVuelo.set(id, Math.max(0, (_enVuelo.get(id) || 1) - 1));
      }
    });
    // La cadena nunca rechaza (los errores viajan como {ok:false}), para no romper
    // la serialización del id.
    _cadena.set(id, corrida.catch(() => {}));
    return corrida;
  }

  // ── flush — para beforeunload/visibilitychange y para "salir del módulo sin
  // perder una operación pendiente" (req 12). Espera a que la cola de ESTA fila
  // termine y devuelve el resultado REAL; jamás finge éxito.
  //   { ok, confirmado, pendiente, conflicto, motivo, version, id }
  //   confirmado=true  → la cola quedó vacía y el servidor confirmó todo.
  //   pendiente=true   → hay cambios locales que el servidor NO tiene.
  //   conflicto=true   → está en conflicto pendiente: la cola NO se vacía escribiendo
  //                      lo obsoleto; hay que resolverlo (ver las dos salidas).
  // El caller decide si advertir al usuario (no cerrar la pestaña) cuando ok=false.
  async function flush(id) {
    const previa = _cadena.get(id) || Promise.resolve();
    try {
      await previa;
      const sucio = !!_dirty.get(id);
      const cfl = _conflicto.get(id) || null;
      return { ok: !sucio, confirmado: !sucio, pendiente: sucio, conflicto: !!cfl,
        motivo: sucio ? (_ultimoMotivo.get(id) || null) : null,
        version: _version.get(id), id };
    } catch {
      return { ok: false, confirmado: false, pendiente: !!_dirty.get(id), conflicto: !!_conflicto.get(id), motivo: _ultimoMotivo.get(id) || null, id };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SALIDAS EXPLÍCITAS DEL CONFLICTO PENDIENTE — son las DOS únicas, y las invoca
  // el caller a pedido del usuario. Ningún auto-save llega acá.
  // ═══════════════════════════════════════════════════════════════════════════

  // (a) RECUPERAR EL ESTADO VIGENTE DEL SERVIDOR — DESCARTA lo local.
  // Relee la fila (no devuelve la copia cacheada del conflicto: el servidor pudo
  // moverse otra vez), registra versión/base/servidor, limpia el conflicto y deja la
  // fila limpia. Devuelve el valor para que el CALLER lo aplique a la pantalla; este
  // módulo no toca React.
  //   → { ok:true, value, version, existe, descartaLocal:true }
  //   → { ok:false, motivo:RED|HTTP, ... }  (el conflicto NO se limpia si falla)
  async function recuperarDelServidor(id) {
    try {
      const r = await load(id);
      log.info(`[persist:${id}] ⇩ recuperado del servidor (v${_versionCorta(r.version)}). Lo local se descarta.`);
      return { ...r, descartaLocal: true, id };
    } catch (e) {
      const msg = String((e && e.message) || e);
      log.error(`[persist:${id}] ❌ no se pudo recuperar del servidor:`, msg);
      _ultimoMotivo.set(id, /HTTP/.test(msg) ? MOTIVOS.HTTP : MOTIVOS.RED);
      return { ok: false, motivo: /HTTP/.test(msg) ? MOTIVOS.HTTP : MOTIVOS.RED, detalle: msg, id };
    }
  }

  // (b) RECONCILIAR CONSERVANDO LO LOCAL — el caller DECLARA que quiere escribir
  // encima de la versión vigente. Se relee la fila SOLO para conocer esa versión (y
  // la base, por si `computeNext` es función) y recién entonces se escribe condicionado
  // a ESA versión: si el servidor se movió otra vez en el medio, vuelve a quedar en
  // conflicto pendiente en vez de pisar.
  //   reconciliarConservandoLocal(id)                → solo desbloquea: { ok:true, desbloqueado:true, version, valorServidor }
  //   reconciliarConservandoLocal(id, valor, opts?)  → desbloquea Y guarda: resultado de saveConfirmed
  // NO fusiona nada por su cuenta: con `computeNext` como valor, lo local manda
  // completo (es la decisión humana que el conflicto estaba esperando).
  async function reconciliarConservandoLocal(id, computeNext, options = {}) {
    if (!_cargaOk.get(id)) {
      log.error(`[persist:${id}] ❌ reconciliar: sin carga previa exitosa (Regla 9).`);
      return { ok: false, motivo: MOTIVOS.SIN_CARGA, id };
    }
    let actual;
    try { actual = await _leerFila(id); }
    catch (e) {
      const msg = String((e && e.message) || e);
      log.error(`[persist:${id}] ❌ reconciliar: no se pudo leer la versión vigente:`, msg);
      _ultimoMotivo.set(id, /HTTP/.test(msg) ? MOTIVOS.HTTP : MOTIVOS.RED);
      return { ok: false, motivo: /HTTP/.test(msg) ? MOTIVOS.HTTP : MOTIVOS.RED, detalle: msg, id };
    }
    const valorServidor = actual.existe ? actual.valor : null;
    _registrarLectura(id, valorServidor, actual.updatedAt, true);
    _conflicto.delete(id);
    _ultimoMotivo.delete(id);
    log.warn(`[persist:${id}] ⇧ reconciliación declarada por el usuario: se escribirá sobre la versión vigente v${_versionCorta(actual.updatedAt)} (lo del servidor se reemplaza).`);
    if (computeNext === undefined) {
      _dirty.set(id, true); // sigue habiendo cambios locales sin confirmar
      return { ok: true, desbloqueado: true, version: actual.updatedAt, valorServidor, id };
    }
    return await saveConfirmed(id, computeNext, options);
  }

  // ── Dirty-guard para realtime/poll (req 8). ───────────────────────────────────
  // Aplica el estado entrante SOLO si no hay edición local sucia. Si está sucio:
  //  - colección con localValue → intenta fusión no destructiva.
  //  - si no se puede fusionar → NO aplica (protege lo local) y señala conflicto.
  function reconcileIncoming(id, remoteValue, remoteVersion, o = {}) {
    if (!_dirty.get(id)) {
      // Sin edición local que proteger: el servidor es la verdad. Se adopta (y si
      // quedaba un conflicto marcado, se retira: no hay nada local que perder).
      _registrarLectura(id, remoteValue, remoteVersion, true);
      _conflicto.delete(id);
      _ultimoMotivo.delete(id);
      return { apply: true, value: remoteValue, version: remoteVersion };
    }
    // Hay edición local sin confirmar.
    if (o.merge && o.localValue !== undefined && esListaFusionable(o.localValue) && esListaFusionable(remoteValue)) {
      const base = _base.has(id) ? _base.get(id) : null;
      const f = fusionarPorId(base, o.localValue, remoteValue);
      if (f.ok && f.conflictos.length === 0) {
        _registrarLectura(id, remoteValue, remoteVersion, true); // base = servidor; el diff local se re-aplica
        return { apply: true, value: f.valor, version: remoteVersion, fusionado: true, cambios: f.cambios };
      }
      // Colección con conflicto por ítem: NO se adelanta la versión (el próximo
      // guardado re-intenta la fusión por ítem contra la versión real), pero el
      // servidor ya tiene `remoteValue` → el guardia "sin cambios" se compara contra él.
      if (remoteValue !== undefined) _servidor.set(id, clonarValor(remoteValue));
      return { apply: false, dirty: true, motivo: MOTIVOS.CONFLICTO_ITEM, conflictos: f.ok ? f.conflictos : [], valorServidor: remoteValue, version: remoteVersion };
    }
    // Blob sucio (o sin localValue): nunca se clobbea la edición local. (req 8)
    // ANTES acá se hacía `_version.set(id, remoteVersion)` "para que el próximo
    // saveConfirmed detecte el conflicto": en realidad lo HABILITABA (el PATCH
    // condicionado pasaba y el estado obsoleto pisaba el ajeno). AHORA la fila queda en
    // CONFLICTO PENDIENTE con la versión vieja intacta, y se devuelve `valorServidor`
    // para que el caller lo aplique o lo compare (no se guarda solo el token de versión
    // dejando el contenido anterior en memoria). `_servidor` pasa a ser el valor remoto.
    _marcarConflicto(id, remoteVersion, remoteValue, MOTIVOS.CONFLICTO, []);
    return { apply: false, dirty: true, motivo: MOTIVOS.CONFLICTO, conflictoPendiente: true,
      valorServidor: remoteValue, version: remoteVersion, versionLocal: _version.get(id) };
  }

  // ── utilidades ───────────────────────────────────────────────────────────────
  function isDirty(id) { return !!_dirty.get(id); }
  // Filas con edición local que el servidor aún NO confirmó. Para el "¿salís sin
  // guardar?" y para el indicador global de la UI. Solo lectura.
  function idsSucios() { return [..._dirty.entries()].filter(([, v]) => v).map(([k]) => k); }
  // Filas en conflicto pendiente (nadie eligió todavía entre las dos salidas).
  function idsEnConflicto() { return [..._conflicto.keys()]; }
  // El conflicto pendiente de una fila, o null. Incluye el valor del servidor para
  // que la UI pueda mostrar/comparar sin volver a leer.
  function conflictoPendiente(id) {
    const c = _conflicto.get(id);
    return c ? { version: c.version, valorServidor: clonarValor(c.valorServidor), ts: c.ts, motivoOrigen: c.motivoOrigen, conflictos: c.conflictos } : null;
  }
  function marcarSucio(id) { _dirty.set(id, true); }
  function marcarLimpio(id) { _dirty.set(id, false); }
  // Estado por fila para la UI (guardando/guardado/error). Las claves viejas
  // (version/base/cargaOk/dirty/encoding) se conservan; las nuevas son aditivas.
  function estado(id) {
    const c = _conflicto.get(id) || null;
    return {
      version: _version.get(id), base: _base.get(id), cargaOk: !!_cargaOk.get(id),
      dirty: !!_dirty.get(id), encoding: _encoding.get(id) || null,
      sucio: !!_dirty.get(id),
      conflictoPendiente: !!c,
      conflicto: c ? { version: c.version, ts: c.ts, motivoOrigen: c.motivoOrigen, conflictos: c.conflictos } : null,
      ultimoMotivo: _ultimoMotivo.get(id) || null,
      enVuelo: (_enVuelo.get(id) || 0) > 0,
      guardadosEnVuelo: _enVuelo.get(id) || 0,
      servidorConocido: _servidor.has(id),
    };
  }
  function reset(id) {
    if (id === undefined) { _version.clear(); _base.clear(); _servidor.clear(); _conflicto.clear(); _ultimoMotivo.clear(); _cargaOk.clear(); _dirty.clear(); _cadena.clear(); _deseado.clear(); _gen.clear(); _encoding.clear(); _enVuelo.clear(); }
    else { _version.delete(id); _base.delete(id); _servidor.delete(id); _conflicto.delete(id); _ultimoMotivo.delete(id); _cargaOk.delete(id); _dirty.delete(id); _cadena.delete(id); _deseado.delete(id); _gen.delete(id); _encoding.delete(id); _enVuelo.delete(id); }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA (lo agregado en oct-2026 va marcado NUEVO; nada cambió de firma)
  //
  //  load(id)                                  → {ok,existe,value,version}  · lanza
  //  registrarCarga(id, valor, version, encoding[, valorServidor])
  //        NUEVO 5º argumento OPCIONAL: el valor CRUDO de la fila cuando `valor` está
  //        transformado en memoria. Sin él, el guardia "sin cambios" no actúa.
  //  saveConfirmed(id, computeNext, options)    → {ok, motivo?, value?, version?,
  //        fusionado?, sinCambios?, noEscrito?, superseded?, conflictoPendiente?,
  //        valorServidor?}
  //        options: { merge?, intentos?, forzar? }   · NUEVO `forzar`: escribe aunque
  //        el valor sea idéntico al confirmado por el servidor (siembras/migraciones).
  //  flush(id)                                  → {ok, confirmado, pendiente,
  //        conflicto, motivo, version, id}      · NUEVO: `confirmado`/`conflicto`/`motivo`
  //  reconcileIncoming(id, remoteValue, remoteVersion, o)
  //                                             → {apply, value?, version,
  //        motivo?, conflictoPendiente?, valorServidor?}
  //
  //  NUEVO · salidas explícitas del conflicto pendiente (las DOS únicas):
  //  recuperarDelServidor(id)                   → {ok, value, version, existe,
  //        descartaLocal:true} | {ok:false, motivo}        (a) descarta lo local
  //  reconciliarConservandoLocal(id[, computeNext][, options])
  //        sin computeNext → {ok:true, desbloqueado:true, version, valorServidor}
  //        con computeNext → resultado de saveConfirmed sobre la versión vigente
  //                                                        (b) conserva lo local
  //
  //  NUEVO · lo que la pantalla necesita para "guardando / guardado / error":
  //  estado(id) → { version, base, cargaOk, dirty, encoding,          (ya existían)
  //                 sucio, conflictoPendiente, conflicto:{version,ts,motivoOrigen,
  //                 conflictos}|null, ultimoMotivo, enVuelo, guardadosEnVuelo,
  //                 servidorConocido }
  //  idsSucios()          → [id]   filas con cambios locales sin confirmar
  //  idsEnConflicto()     → [id]   filas bloqueadas esperando decisión
  //  conflictoPendiente(id) → {version, valorServidor, ts, motivoOrigen, conflictos}|null
  //  canonico(v)          → huella JSON de claves ordenadas (comparar sin orden)
  //  MOTIVOS.CONFLICTO_PENDIENTE = "conflicto_pendiente"
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    load, registrarCarga, saveConfirmed, flush, reconcileIncoming,
    // Salidas explícitas del conflicto pendiente (las DOS únicas).
    recuperarDelServidor, reconciliarConservandoLocal,
    isDirty, idsSucios, idsEnConflicto, conflictoPendiente,
    marcarSucio, marcarLimpio, estado, reset,
    // helpers expuestos (fusión por ítem para casos avanzados)
    fusionarPorId, esListaFusionable, MOTIVOS, canonico,
    _leerFila, // solo diagnóstico/test
  };
}

// ── Puente con la UI: traduce un resultado de saveConfirmed al aviso de pantalla
// (mismo contrato que AvisoPersistencia.construirAviso). req 11.
export function construirAvisoDesde(id, resultado, etiqueta) {
  const nombre = etiqueta || id;
  const r = resultado || {};
  if (r.ok) {
    if (r.superseded || r.sinCambios) return null;
    if (!r.fusionado) return null;
    return { id, tipo: "fusion",
      texto: `Otra persona estaba trabajando en ${nombre} al mismo tiempo. Se combinaron los dos trabajos y no se perdió nada.` };
  }
  if (r.motivo === MOTIVOS.CONFLICTO_ITEM) {
    const n = (r.conflictos || []).length;
    return { id, tipo: "conflicto", conflictos: r.conflictos || [],
      texto: `No se guardó ${nombre}: otra persona editó al mismo tiempo ${n === 1 ? "el mismo registro" : "los mismos registros"} que tú. ` +
             `Para no borrar su trabajo se conservó lo que está en el servidor. Anota tu cambio, recarga la página y vuelve a aplicarlo.` };
  }
  if (r.motivo === MOTIVOS.CONFLICTO_PENDIENTE) {
    // La fila está bloqueada a propósito: ya hubo un conflicto y nadie eligió qué
    // hacer. El texto no dice "recargá" porque recargar perdería lo local: dice que
    // hay que decidir (las dos salidas las ofrece el caller).
    return { id, tipo: "conflicto", conflictoPendiente: true,
      texto: `No se guardó ${nombre}: otra persona lo modificó y el conflicto sigue sin resolver. ` +
             `Tus cambios siguen en pantalla y NO se están guardando. Tenés que elegir: traer la versión del ` +
             `servidor (se descarta lo tuyo) o guardar lo tuyo encima de la versión del servidor.` };
  }
  if (r.motivo === MOTIVOS.CONFLICTO) {
    // Si el conflicto dejó la fila BLOQUEADA, decir "recarga la página" es falso
    // y además peligroso: recargar descarta lo local sin avisarlo. El primer
    // conflicto de una fila-blob llega con motivo CONFLICTO y `conflictoPendiente`
    // en true, así que se trata igual que el reintento.
    if (r.conflictoPendiente) {
      return { id, tipo: "conflicto", conflictoPendiente: true,
        texto: `No se guardó ${nombre}: otra persona lo modificó mientras trabajabas y no se puede combinar ` +
               `automáticamente. Tus cambios siguen en pantalla y NO se están guardando. Tenés que elegir: traer ` +
               `la versión del servidor (se descarta lo tuyo) o guardar lo tuyo encima de la versión del servidor.` };
    }
    return { id, tipo: "conflicto",
      texto: `No se guardó ${nombre}: otra persona lo modificó mientras trabajabas y no se puede combinar automáticamente. ` +
             `Anota tu cambio, recarga la página y vuelve a aplicarlo.` };
  }
  return { id, tipo: "error",
    texto: `No se pudo guardar ${nombre}${r.motivo === MOTIVOS.HTTP && r.status ? ` (error ${r.status})` : ""}. ` +
           `Tus cambios siguen en pantalla: no cierres esta pestaña y reintenta.` };
}

export default crearPersistencia;
