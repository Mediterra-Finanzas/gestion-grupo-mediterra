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
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// FÁBRICA — una instancia por app (o por test). Estado (versión/base/dirty/cola)
// vive en la instancia, no en globales de módulo.
// ═══════════════════════════════════════════════════════════════════════════════
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

  function _registrarLectura(id, valor, updatedAt) {
    _version.set(id, updatedAt === undefined ? null : updatedAt);
    _base.set(id, clonarValor(valor));
  }

  // F0-C: codifica el objeto para la columna `value` respetando la codificación
  // física de la fila. 'string' → un ÚNICO JSON.stringify (jamás doble). 'object'
  // → el objeto tal cual (jsonb). Fila nueva sin codificación conocida → 'string'
  // por defecto (legacy-dominante, seguro para rollback del frontend).
  function _codificarValue(id, obj) {
    const enc = _encoding.get(id) || "string";
    return enc === "object" ? obj : JSON.stringify(obj);
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
  async function load(id) {
    const { existe, valor, updatedAt } = await _leerFila(id);
    _registrarLectura(id, existe ? valor : null, updatedAt);
    _cargaOk.set(id, true);
    _dirty.set(id, false);
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
  function registrarCarga(id, valor, version, encoding) {
    _registrarLectura(id, valor, version);
    if (encoding === true || encoding === "string") _encoding.set(id, "string");
    else if (encoding === "object") _encoding.set(id, "object");
    // encoding === false / undefined → NO se fija: detección perezosa (o el default
    // 'string' si la fila resulta inexistente/nueva).
    _cargaOk.set(id, true);
    _dirty.set(id, false);
  }

  // ── Núcleo del guardado: read-version → conditional write → confirm → merge. ──
  // `computeNext` puede ser un valor o una función (baseConocida) => valor. La forma
  // función permite recomputar contra la base fresca tras un conflicto (retry seguro).
  async function _guardarUnaVez(id, computeNext, o) {
    if (!_cargaOk.get(id)) {
      log.error(`[persist:${id}] ❌ GUARDADO BLOQUEADO: sin carga previa exitosa (Regla 9).`);
      return { ok: false, motivo: MOTIVOS.SIN_CARGA };
    }
    const esColeccion = !!o.merge;
    const maxIntentos = o.intentos == null ? 2 : o.intentos;
    const producir = (base) => (typeof computeNext === "function" ? computeNext(base) : computeNext);

    let fusionado = false, cambios = null;
    let aGuardar = producir(_base.get(id));

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
          _registrarLectura(id, actual.valor, actual.updatedAt);
          aGuardar = producir(_base.get(id));
        }
        const r = await _escribirCondicionado(id, aGuardar, _version.get(id));
        if (r.ok) {
          _version.set(id, r.updatedAt);
          _base.set(id, clonarValor(aGuardar));
          const kb = Math.round(_bytesDe(JSON.stringify(aGuardar)) / 1024);
          log.info(`[persist:${id}] ✅ guardado y confirmado (${kb} KB · v${_versionCorta(r.updatedAt)}${fusionado ? " · fusionado" : ""})`);
          return { ok: true, value: aGuardar, version: r.updatedAt, fusionado, cambios };
        }
        if (r.motivo !== MOTIVOS.CONFLICTO) {
          log.error(`[persist:${id}] ❌ NO SE GUARDÓ — ${r.motivo}${r.status ? " HTTP " + r.status : ""}`);
          return r; // http (401/403/5xx), sin_confirmacion, red → NO es éxito (req 2/13/14)
        }

        // CONFLICTO: alguien escribió después de nuestra última lectura. (req 6/7)
        const actual = await _leerFila(id);
        const base = _base.has(id) ? _base.get(id) : null;

        if (valoresIguales(actual.valor, aGuardar)) {
          // Lo que queríamos ya está en el servidor (retry idempotente). (req 10)
          _registrarLectura(id, actual.valor, actual.updatedAt);
          return { ok: true, value: actual.valor, version: actual.updatedAt, fusionado, cambios, sinCambios: true };
        }

        if (esColeccion && esListaFusionable(aGuardar) && esListaFusionable(actual.valor)) {
          // Filas-colección: fusión por ítem. Nadie pierde salvo edición del MISMO ítem.
          const f = fusionarPorId(base, aGuardar, actual.valor);
          if (f.ok && f.conflictos.length === 0) {
            _version.set(id, actual.updatedAt);
            _base.set(id, clonarValor(actual.valor));
            aGuardar = f.valor; fusionado = true; cambios = f.cambios;
            log.info(`[persist:${id}] ↻ fusionado (${f.cambios.ajenosPreservados} ítems ajenos preservados). Reintentando.`);
            continue;
          }
          _registrarLectura(id, actual.valor, actual.updatedAt);
          const motivo = f.ok ? MOTIVOS.CONFLICTO_ITEM : MOTIVOS.CONFLICTO;
          log.warn(`[persist:${id}] ⚠️ CONFLICTO (${motivo}). No se sobrescribió nada.`);
          return { ok: false, motivo, conflictos: f.ok ? f.conflictos : [], valorServidor: actual.valor };
        }

        // Filas-blob (objeto anidado no fusionable): NO se pisa a ciegas (req 7).
        // Si el caller pasó `computeNext` como función, recomputamos contra la base
        // fresca del servidor y reintentamos (útil para blobs con secciones ajenas).
        _registrarLectura(id, actual.valor, actual.updatedAt);
        if (typeof computeNext === "function") {
          aGuardar = producir(actual.valor); fusionado = true;
          log.info(`[persist:${id}] ↻ recomputado contra la versión fresca del servidor. Reintentando.`);
          continue;
        }
        log.warn(`[persist:${id}] ⚠️ CONFLICTO (blob). No se sobrescribió nada; se conservó el servidor.`);
        return { ok: false, motivo: MOTIVOS.CONFLICTO, valorServidor: actual.valor };
      }
      log.error(`[persist:${id}] ❌ NO SE GUARDÓ — reintentos agotados`);
      return { ok: false, motivo: MOTIVOS.REINTENTOS };
    } catch (e) {
      // req 4/13: la excepción de red NUNCA se traga en silencio.
      log.error(`[persist:${id}] ❌ Error de red al guardar:`, String((e && e.message) || e));
      return { ok: false, motivo: MOTIVOS.RED, detalle: String((e && e.message) || e) };
    }
  }

  // ── saveConfirmed — API pública. Serializa y COALESCE por id. ─────────────────
  // req 9/10: mientras un guardado está en vuelo, una edición nueva no se pierde;
  // se registra como el "último valor deseado" y se guarda al terminar el actual.
  // Solo la última solicitud encolada llega a escribir; las anteriores se marcan
  // `superseded` (NO "guardado a backend", pero tampoco pérdida: el último valor las
  // contiene). El estado dirty se limpia solo cuando el servidor confirma.
  function saveConfirmed(id, computeNext, options = {}) {
    _dirty.set(id, true);
    const miGen = (_gen.get(id) || 0) + 1;
    _gen.set(id, miGen);
    _deseado.set(id, { value: computeNext, opts: options });

    const previa = _cadena.get(id) || Promise.resolve();
    const corrida = previa.then(async () => {
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
    });
    // La cadena nunca rechaza (los errores viajan como {ok:false}), para no romper
    // la serialización del id.
    _cadena.set(id, corrida.catch(() => {}));
    return corrida;
  }

  // ── flush — para beforeunload/visibilitychange (req 12). Devuelve el resultado
  // REAL del último guardado pendiente; jamás finge éxito. El caller decide si
  // advertir al usuario (no cerrar la pestaña) cuando {ok:false}.
  async function flush(id) {
    const previa = _cadena.get(id) || Promise.resolve();
    try { return await previa.then(() => ({ ok: !_dirty.get(id), pendiente: !!_dirty.get(id), id })); }
    catch { return { ok: false, id }; }
  }

  // ── Dirty-guard para realtime/poll (req 8). ───────────────────────────────────
  // Aplica el estado entrante SOLO si no hay edición local sucia. Si está sucio:
  //  - colección con localValue → intenta fusión no destructiva.
  //  - si no se puede fusionar → NO aplica (protege lo local) y señala conflicto.
  function reconcileIncoming(id, remoteValue, remoteVersion, o = {}) {
    if (!_dirty.get(id)) {
      _registrarLectura(id, remoteValue, remoteVersion);
      return { apply: true, value: remoteValue, version: remoteVersion };
    }
    // Hay edición local sin confirmar.
    if (o.merge && o.localValue !== undefined && esListaFusionable(o.localValue) && esListaFusionable(remoteValue)) {
      const base = _base.has(id) ? _base.get(id) : null;
      const f = fusionarPorId(base, o.localValue, remoteValue);
      if (f.ok && f.conflictos.length === 0) {
        _registrarLectura(id, remoteValue, remoteVersion); // base = servidor; el diff local se re-aplica
        return { apply: true, value: f.valor, version: remoteVersion, fusionado: true, cambios: f.cambios };
      }
      return { apply: false, dirty: true, motivo: MOTIVOS.CONFLICTO_ITEM, conflictos: f.ok ? f.conflictos : [], valorServidor: remoteValue, version: remoteVersion };
    }
    // Blob sucio (o sin localValue): nunca se clobbea la edición local. (req 8)
    // Se actualiza SOLO la versión conocida para que el próximo saveConfirmed
    // detecte el conflicto contra la versión real (y no pise en silencio).
    _version.set(id, remoteVersion);
    return { apply: false, dirty: true, motivo: MOTIVOS.CONFLICTO, valorServidor: remoteValue, version: remoteVersion };
  }

  // ── utilidades ───────────────────────────────────────────────────────────────
  function isDirty(id) { return !!_dirty.get(id); }
  function marcarSucio(id) { _dirty.set(id, true); }
  function marcarLimpio(id) { _dirty.set(id, false); }
  function estado(id) { return { version: _version.get(id), base: _base.get(id), cargaOk: !!_cargaOk.get(id), dirty: !!_dirty.get(id), encoding: _encoding.get(id) || null }; }
  function reset(id) {
    if (id === undefined) { _version.clear(); _base.clear(); _cargaOk.clear(); _dirty.clear(); _cadena.clear(); _deseado.clear(); _gen.clear(); _encoding.clear(); }
    else { _version.delete(id); _base.delete(id); _cargaOk.delete(id); _dirty.delete(id); _cadena.delete(id); _deseado.delete(id); _gen.delete(id); _encoding.delete(id); }
  }

  return {
    load, registrarCarga, saveConfirmed, flush, reconcileIncoming,
    isDirty, marcarSucio, marcarLimpio, estado, reset,
    // helpers expuestos (fusión por ítem para casos avanzados)
    fusionarPorId, esListaFusionable, MOTIVOS,
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
  if (r.motivo === MOTIVOS.CONFLICTO) {
    return { id, tipo: "conflicto",
      texto: `No se guardó ${nombre}: otra persona lo modificó mientras trabajabas y no se puede combinar automáticamente. ` +
             `Anota tu cambio, recarga la página y vuelve a aplicarlo.` };
  }
  return { id, tipo: "error",
    texto: `No se pudo guardar ${nombre}${r.motivo === MOTIVOS.HTTP && r.status ? ` (error ${r.status})` : ""}. ` +
           `Tus cambios siguen en pantalla: no cierres esta pestaña y reintenta.` };
}

export default crearPersistencia;
