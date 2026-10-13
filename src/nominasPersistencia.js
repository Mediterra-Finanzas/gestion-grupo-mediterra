/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// nominasPersistencia.js — guardado CONDICIONADO de Nóminas (puro + transporte
// inyectable, para probarlo sin navegador). Diseño: docs/nominas-guardado-condicionado.md
//
// Cada empresa vive en su fila calendario_data id="nominas_<slug>" como TEXTO JSON
// { nominas:[…], empresa }. Reglas:
//   · Se escriben SOLO las filas cuyo contenido cambió respecto de lo leído (base).
//   · Una fila existente se escribe con PATCH condicionado a la versión leída
//     (updated_at); una fila nueva, con una inserción que FALLA si ya existe (409).
//   · Si alguien escribió entretanto (0 filas / 409): se relee y se combina a tres
//     bandas (base = lo que leí, mío = lo local, servidor = lo recién leído):
//       - nóminas distintas → se combinan;
//       - en una misma nómina cambiada por ambos: la cabecera campo a campo y las
//         líneas por id;
//       - el MISMO campo o la MISMA línea con valores distintos, una TRANSICIÓN de
//         estado o una ANULACIÓN (de nómina o de línea) junto con otro cambio del
//         otro lado → CONFLICTO: esa fila NO se escribe y se informa con detalle
//         (resolución explícita del usuario).
//   · Si al releer el servidor ya tiene exactamente lo que se quería guardar (la
//     respuesta anterior se perdió), se toma como guardado: no se duplica.
// ═══════════════════════════════════════════════════════════════════════════════

// ── igualdad independiente del orden de las claves ─────────────────────────────
function canon(x) {
  return JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((o, kk) => { o[kk] = v[kk]; return o; }, {}) : v));
}
export const iguales = (a, b) => canon(a) === canon(b);
const clon = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

// Campos que representan una TRANSICIÓN de estado o una ANULACIÓN de la nómina.
// Si uno de los dos lados los cambió y el otro también cambió la nómina, nunca se
// combinan solos.
export const CAMPOS_TRANSICION = ["estado"];
export const CAMPOS_ANULACION = ["estadoNomina"];
// Campos que la app escribe JUNTO con una transición (avanzarEstado / retrocederEstado).
// Si ambos lados hicieron la MISMA transición, se toman del servidor, donde ya quedó hecha.
export const CAMPOS_DE_TRANSICION = ["preparadoPor", "revisadoPor", "revisorAsignado", "aprobado1Por", "fechaAprobacion1",
  "aprobadoPor", "fechaAprobacion", "ultimaDevolucion"];
const SIN_CAMPO_A_CAMPO = new Set(["items", "historial"]);

function etiquetaNomina(n) {
  if (!n) return "";
  return `${n.empresa || ""} S${n.semana ?? "?"}/${n.año ?? "?"} N°${n.numero ?? "?"}`;
}
function etiquetaLinea(it) {
  if (!it) return "";
  return [it.proveedor, it.concepto, it.nDoc ? `doc ${it.nDoc}` : ""].filter(Boolean).join(" · ") || String(it.id);
}
const anulada = (it) => !!it && it.estadoLinea === "inactiva";

// ── fusión de listas por id (genérica) ─────────────────────────────────────────
// Devuelve { valor, conflictos } . alResolverAmbos(b, m, s, id) decide qué hacer
// cuando el mismo elemento cambió en los dos lados.
function fusionarPorId(base, mio, servidor, alResolverAmbos) {
  const B = new Map((base || []).map((x) => [String(x.id), x]));
  const M = new Map((mio || []).map((x) => [String(x.id), x]));
  const S = new Map((servidor || []).map((x) => [String(x.id), x]));
  const conflictos = [];
  const decidido = new Map();   // id -> valor | null (ausente)
  const ids = new Set([...S.keys(), ...M.keys(), ...B.keys()]);
  ids.forEach((id) => {
    const b = B.get(id), m = M.get(id), s = S.get(id);
    if (iguales(m, b)) { decidido.set(id, s === undefined ? null : s); return; }      // no lo toqué
    if (iguales(s, b)) { decidido.set(id, m === undefined ? null : m); return; }      // solo lo cambié yo
    if (iguales(m, s)) { decidido.set(id, m === undefined ? null : m); return; }      // los dos igual
    const r = alResolverAmbos(b, m, s, id);
    if (r.conflictos && r.conflictos.length) { conflictos.push(...r.conflictos); decidido.set(id, s === undefined ? null : s); return; }
    decidido.set(id, r.valor === undefined ? null : r.valor);
  });
  // Orden: el del servidor, y al final lo nuevo mío en mi orden.
  const valor = [];
  const puestos = new Set();
  (servidor || []).forEach((x) => { const id = String(x.id); const v = decidido.get(id); if (v) { valor.push(v); } puestos.add(id); });
  (mio || []).forEach((x) => { const id = String(x.id); if (puestos.has(id)) return; const v = decidido.get(id); if (v) valor.push(v); puestos.add(id); });
  (base || []).forEach((x) => { const id = String(x.id); if (puestos.has(id)) return; const v = decidido.get(id); if (v) valor.push(v); });
  return { valor, conflictos };
}

// ── fusión de UNA nómina cambiada por los dos lados ────────────────────────────
function fusionarUnaNomina(b, m, s, pref) {
  const ref = m || s || b;
  const etiqueta = etiquetaNomina(ref);
  const conflictos = [];
  const c = (tipo, extra) => conflictos.push({ tipo, nominaId: ref && ref.id, etiqueta, ...extra });
  // pref === "mio": resolución EXPLÍCITA del usuario ("mantener lo mío"): en cada
  // punto en conflicto prevalece lo local; lo independiente del otro se conserva.
  if (pref === "mio" && (!b || !m || !s)) return { valor: m };
  if (!b) {   // los dos la crearon con el mismo id y contenido distinto
    c("nomina_creada_por_ambos", { mio: m, servidor: s });
    return { conflictos };
  }
  if (!m || !s) {   // uno la quitó y el otro la cambió (la app no quita nóminas: se informa)
    c("nomina_quitada_y_editada", { mio: m || null, servidor: s || null });
    return { conflictos };
  }
  // Transición o anulación de un lado + cualquier cambio del otro → resolución explícita.
  const cambioCampos = (x, campos) => campos.some((k) => !iguales(x[k], b[k]));
  const transM = cambioCampos(m, CAMPOS_TRANSICION), transS = cambioCampos(s, CAMPOS_TRANSICION);
  const anulM = cambioCampos(m, CAMPOS_ANULACION), anulS = cambioCampos(s, CAMPOS_ANULACION);
  // La MISMA transición en ambos lados (p. ej. el reintento de una aprobación cuya
  // respuesta se perdió) no es conflicto: ya está hecha.
  const mismaTrans = transM && transS && CAMPOS_TRANSICION.every((k) => iguales(m[k], s[k]));
  const mismaAnul = anulM && anulS && CAMPOS_ANULACION.every((k) => iguales(m[k], s[k]));
  if ((transM || transS) && !mismaTrans) c("transicion", { campo: "estado", base: b.estado, mio: m.estado, servidor: s.estado });
  if ((anulM || anulS) && !mismaAnul) c("anulacion_nomina", { campo: "estadoNomina", base: b.estadoNomina, mio: m.estadoNomina, servidor: s.estadoNomina });
  // Anulación de una línea (en cualquiera de los dos lados) mientras ambos cambiaban
  // esta nómina → resolución explícita, aunque el otro haya tocado otra línea.
  const lineasB = new Map((b.items || []).map((x) => [String(x.id), x]));
  const anuladasCambio = (lista) => (lista || []).filter((x) => anulada(x) !== anulada(lineasB.get(String(x.id))));
  [...anuladasCambio(m.items), ...anuladasCambio(s.items)].forEach((x) => {
    if (!conflictos.some((k) => k.lineaId === String(x.id)))
      c("anulacion_linea", { lineaId: String(x.id), linea: etiquetaLinea(x), base: lineasB.get(String(x.id)) || null,
        mio: (m.items || []).find((y) => String(y.id) === String(x.id)) || null, servidor: (s.items || []).find((y) => String(y.id) === String(x.id)) || null });
  });
  if (conflictos.length && pref !== "mio") return { conflictos };
  conflictos.length = 0;
  // Con una transición o anulación en juego, la cabecera va COMPLETA desde un solo
  // lado (estado, aprobadores y fechas van juntos): con "mantener lo mío", la mía.
  const cabeceraMia = pref === "mio" && (transM || transS || anulM || anulS);

  const out = {};
  // Cabecera: campo a campo
  const campos = new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(s)].filter((k) => !SIN_CAMPO_A_CAMPO.has(k)));
  campos.forEach((k) => {
    const bv = b[k], mv = m[k], sv = s[k];
    let v;
    if (cabeceraMia) { if (mv !== undefined) out[k] = clon(mv); return; }
    if (iguales(mv, bv)) v = sv;
    else if (iguales(sv, bv)) v = mv;
    else if (iguales(mv, sv)) v = mv;
    else if (pref === "mio") v = mv;
    else if ((mismaTrans || mismaAnul) && CAMPOS_DE_TRANSICION.includes(k)) v = sv;
    else { c("campo", { campo: k, base: bv, mio: mv, servidor: sv }); v = sv; }
    if (v !== undefined) out[k] = clon(v);
  });
  // Historial: solo se agrega al final → lo del servidor + lo mío que no estaba
  const hb = b.historial || [], hm = m.historial || [], hs = s.historial || [];
  // Una entrada "equivalente" (misma acción, mismo estado destino, mismo usuario) que
  // el servidor ya agregó no se repite: el reintento de una transición no la duplica.
  const claveH = (h) => `${h && h.accion}|${h && h.estadoHacia || ""}|${h && h.usuario || ""}`;
  const nuevosSrv = hs.filter((h) => !hb.some((x) => iguales(x, h)));
  const nuevosMios = hm.filter((h) => !hb.some((x) => iguales(x, h)) && !hs.some((x) => iguales(x, h))
    && !(h && (h.accion === "avance" || h.accion === "devolucion" || h.accion === "inactivada") && nuevosSrv.some((x) => claveH(x) === claveH(h))));
  if (b.historial !== undefined || m.historial !== undefined || s.historial !== undefined) out.historial = [...clon(hs), ...clon(nuevosMios)];
  // Líneas: por id
  const li = fusionarPorId(b.items, m.items, s.items, (lb, lm, ls, id) => {
    if (pref === "mio") return { valor: lm };
    const tipo = (anulada(lm) !== anulada(lb) || anulada(ls) !== anulada(lb)) ? "anulacion_linea"
      : (!lb ? "linea_creada_por_ambos" : (!lm || !ls) ? "linea_quitada_y_editada" : "linea");
    return { conflictos: [{ tipo, nominaId: ref.id, etiqueta, lineaId: id, linea: etiquetaLinea(lm || ls || lb), base: lb || null, mio: lm || null, servidor: ls || null }] };
  });
  conflictos.push(...li.conflictos);
  if (b.items !== undefined || m.items !== undefined || s.items !== undefined) out.items = li.valor;
  return conflictos.length ? { conflictos } : { valor: out };
}

// Fusión a tres bandas de la lista de nóminas de UNA fila (empresa).
// → { ok:true, valor } | { ok:false, conflictos:[…] }
export function fusionarNominas(base, mio, servidor, opciones = {}) {
  const r = fusionarPorId(base || [], mio || [], servidor || [], (b, m, s) => fusionarUnaNomina(b, m, s, opciones.preferir));
  return r.conflictos.length ? { ok: false, conflictos: r.conflictos } : { ok: true, valor: r.valor };
}

// ── qué filas hay que escribir ────────────────────────────────────────────────
// filas: { [fila]: { empresa, estado:"ok"|"inexistente"|"error", version, base:[…], conflicto? } }
// Devuelve { escrituras:[{fila, empresa, mio, base, version, existe}], bloqueadas:[{fila, empresa, motivo}] }
export function planGuardado(locales, filas, filaDe) {
  const grupos = new Map();
  (locales || []).forEach((n) => { if (n && n.empresa) { if (!grupos.has(n.empresa)) grupos.set(n.empresa, []); grupos.get(n.empresa).push(n); } });
  const escrituras = [], bloqueadas = [];
  const vistas = new Set();
  grupos.forEach((mio, empresa) => {
    const fila = filaDe(empresa);
    vistas.add(fila);
    const f = filas[fila];
    if (!f) { bloqueadas.push({ fila, empresa, motivo: "sin_lectura" }); return; }
    if (f.estado === "error") { bloqueadas.push({ fila, empresa, motivo: "carga_fallida", detalle: f.error }); return; }
    if (f.conflicto) { bloqueadas.push({ fila, empresa, motivo: "conflicto_pendiente" }); return; }
    if (iguales(mio, f.base || [])) return;
    escrituras.push({ fila, empresa, mio, base: f.base || [], version: f.version || null, existe: f.estado === "ok" });
  });
  // Una empresa leída con nóminas y que localmente quedó vacía: nunca se escribe
  // vacía (la app no borra nóminas; sería una pérdida).
  Object.entries(filas || {}).forEach(([fila, f]) => {
    if (vistas.has(fila) || f.estado !== "ok" || !(f.base || []).length) return;
    bloqueadas.push({ fila, empresa: f.empresa, motivo: "quedaria_vacia" });
  });
  return { escrituras, bloqueadas };
}

// ── escritura de UNA fila, con relectura y fusión ante conflicto ──────────────
// transporte: {
//   leer(fila) → { existe, valor:{nominas,empresa}, version }   (lanza ante red/HTTP)
//   patch(fila, version, valorTexto) → { ok, version } | { ok:false, motivo:"conflicto"|"http"|"sello"|"red", status }
//   insertar(fila, valorTexto) → { ok, version } | { ok:false, motivo:"existe"|"http"|"sello"|"red", status }
// }
export async function guardarFila({ fila, empresa, mio, base, version, existe, transporte, maxFusiones = 2, opciones = {} }) {
  let b = base || [], v = version, ex = !!existe, deseado = mio, fusionado = false;
  for (let intento = 0; ; intento++) {
    const texto = JSON.stringify({ nominas: deseado, empresa });
    let r;
    try { r = ex ? await transporte.patch(fila, v, texto, opciones) : await transporte.insertar(fila, texto, opciones); }
    catch (e) { r = { ok: false, motivo: "red", detalle: String((e && e.message) || e) }; }
    if (r.ok) return { ok: true, fila, empresa, version: r.version, base: deseado, fusionado };
    if (r.motivo === "red") {
      // Sin respuesta: no se sabe si el servidor guardó. Se VERIFICA releyendo: si ya
      // tiene exactamente lo enviado (la respuesta se perdió), está guardado; si no se
      // puede verificar, se informa como error de red (el reintento no duplica).
      try {
        const v2 = await transporte.leer(fila);
        if (v2.existe && iguales((v2.valor && v2.valor.nominas) || [], deseado))
          return { ok: true, fila, empresa, version: v2.version, base: deseado, fusionado, yaEstaba: true, verificadoTrasRed: true };
      } catch (e) { /* sin red también para leer: se informa abajo */ }
      return { ok: false, fila, empresa, motivo: "red", detalle: r.detalle };
    }
    if (r.motivo !== "conflicto" && r.motivo !== "existe") return { ok: false, fila, empresa, motivo: r.motivo, status: r.status, detalle: r.detalle };
    // Otra persona escribió (o creó la fila) después de nuestra lectura: releer.
    let actual;
    try { actual = await transporte.leer(fila); }
    catch (e) { return { ok: false, fila, empresa, motivo: "red", detalle: "no se pudo releer tras un conflicto: " + String((e && e.message) || e) }; }
    const srv = actual.existe ? ((actual.valor && actual.valor.nominas) || []) : [];
    if (actual.existe && iguales(srv, deseado)) {
      // Ya está exactamente lo que queríamos (p. ej. la respuesta anterior se perdió).
      return { ok: true, fila, empresa, version: actual.version, base: srv, fusionado, yaEstaba: true };
    }
    if (intento >= maxFusiones) return { ok: false, fila, empresa, motivo: "conflicto", conflictos: [], reintentosAgotados: true, servidor: { nominas: srv, version: actual.version, existe: actual.existe } };
    const f = fusionarNominas(b, deseado, srv);
    if (!f.ok) return { ok: false, fila, empresa, motivo: "conflicto", conflictos: f.conflictos, servidor: { nominas: srv, version: actual.version, existe: actual.existe } };
    if (actual.existe && iguales(f.valor, srv)) {
      // Lo combinado ya es lo que hay en el servidor (p. ej. la misma transición ya
      // aplicada): no se escribe de nuevo.
      return { ok: true, fila, empresa, version: actual.version, base: srv, fusionado: true, yaEstaba: true };
    }
    deseado = f.valor; b = srv; v = actual.version; ex = actual.existe; fusionado = true;
  }
}

// Resumen de varios resultados de fila (para la pantalla).
export function resumirGuardado(resultados, bloqueadas = []) {
  const filas = [...resultados, ...bloqueadas.map((x) => ({ ...x, ok: false, motivo: "bloqueada", motivoBloqueo: x.motivo }))];
  const fallidas = filas.filter((f) => !f.ok);
  const prioridad = ["conflicto", "sello", "http", "red", "bloqueada"];
  const motivo = fallidas.length ? prioridad.find((m) => fallidas.some((f) => f.motivo === m)) || fallidas[0].motivo : null;
  const conStatus = fallidas.find((f) => f.motivo === motivo && f.status);
  return {
    ok: fallidas.length === 0, motivo, status: conStatus ? conStatus.status : null, filas,
    empresasFallidas: fallidas.map((f) => f.empresa).filter(Boolean),
    empresasGuardadas: filas.filter((f) => f.ok).map((f) => f.empresa).filter(Boolean),
    conflictos: fallidas.flatMap((f) => (f.conflictos || []).map((c) => ({ ...c, empresa: f.empresa, fila: f.fila }))),
  };
}
