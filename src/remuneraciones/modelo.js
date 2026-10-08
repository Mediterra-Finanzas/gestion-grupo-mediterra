/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════
// Nómina de REMUNERACIONES separada (decisión de Angelo Huerta, 08-10-2026).
// Lógica pura: sin React ni red. Pantalla en src/RemuneracionesNomina.jsx.
//
// · Remuneración = sueldo, anticipo de sueldo, descuento, bono o finiquito.
//   Los honorarios NO: siguen como pago a proveedores en la nómina general.
// · Vive en su propia fila `nominas_remuneraciones`, que solo se pide desde
//   el navegador de quien tiene la facultad remPreparar o remAprobar
//   (Angelo prepara; Lucía o Cristobal aprueban, basta uno; sin V°B°).
// · Clasificación EXPLÍCITA: cada línea lleva `clase` de la lista cerrada.
// · Registros existentes de la nómina general que podrían ser remuneraciones
//   (`candidatosRemuneracion`) se LISTAN para revisión. Nada se reclasifica
//   solo: mientras no haya decisión, se tratan como restringidos (no se
//   muestran a quien no puede ver remuneraciones) y NO se asumen no salariales.
// · Control de la aplicación. La base sigue abierta a la llave pública: esto
//   no es confidencialidad frente a acceso directo (docs/estado-rama-2026-10.md).
// ══════════════════════════════════════════════════════════════════════

export const FILA_REM = "nominas_remuneraciones";
export const CLASES_REM = Object.freeze([
  { id: "sueldo",    label: "Sueldo" },
  { id: "anticipo",  label: "Anticipo de sueldo" },
  { id: "descuento", label: "Descuento" },
  { id: "bono",      label: "Bono" },
  { id: "finiquito", label: "Finiquito" },
]);
const IDS_CLASE = CLASES_REM.map(c => c.id);
export const esClaseValida = (c) => IDS_CLASE.includes(c);

const normCorreo = (s) => String(s || "").trim().toLowerCase();
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ── Facultades (vienen de la fila permisos_facultades vía enriquecerUsuario) ──
export const puedeVerRem      = (u) => !!u && u._facultadesOk === true && (u.remPreparar === true || u.remAprobar === true);
export const puedePrepararRem = (u) => !!u && u._facultadesOk === true && u.remPreparar === true;
export const puedeAprobarRemFac = (u) => !!u && u._facultadesOk === true && u.remAprobar === true;

// ── Estructura ──
export function filaRemVacia() { return { v: 1, nominas: [], clasificaciones: [] }; }
export function normalizarFilaRem(f) {
  const b = filaRemVacia();
  if (!f || typeof f !== "object") return b;
  return { ...b, ...f, nominas: Array.isArray(f.nominas) ? f.nominas : [],
    clasificaciones: Array.isArray(f.clasificaciones) ? f.clasificaciones : [] };
}
const hist = (accion, u, extra = {}) => ({ accion, usuario: u?.nombre || "—", correo: normCorreo(u?.email), ts: new Date().toISOString(), ...extra });
const nuevoId = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function nominaRemVacia({ empresa, periodo, numero = 1 }, u) {
  return { id: nuevoId("rem"), empresa, periodo, numero, estado: "borrador", items: [],
    preparadoPor: u?.nombre || "", preparadoPorCorreo: normCorreo(u?.email),
    autores: [normCorreo(u?.email)].filter(Boolean), aprobadoPor: "", aprobadoPorCorreo: "", aprobadoEn: "",
    historial: [hist("creada", u)] };
}
export function lineaRemVacia(clase = "") {
  return { id: nuevoId("remit"), clase, trabajador: "", rut: "", concepto: "", montoCLP: 0, documentos: [], historial: [] };
}

// Total a pagar: todo suma salvo los descuentos, que restan.
export function totalesRem(nom) {
  const porClase = Object.fromEntries(IDS_CLASE.map(c => [c, 0]));
  for (const it of nom?.items || []) if (esClaseValida(it.clase) && !it.revertida) porClase[it.clase] += Number(it.montoCLP) || 0;
  const total = IDS_CLASE.reduce((s, c) => s + (c === "descuento" ? -porClase[c] : porClase[c]), 0);
  return { porClase, total };
}

// Validación para enviar a aprobación: clase explícita, trabajador y monto en cada línea.
export function erroresParaEnviar(nom) {
  const e = [];
  if (!(nom?.items || []).length) e.push("La nómina no tiene líneas.");
  (nom?.items || []).forEach((it, i) => {
    if (!esClaseValida(it.clase)) e.push(`Línea ${i + 1}: falta la clasificación (sueldo, anticipo, descuento, bono o finiquito).`);
    if (!String(it.trabajador || "").trim()) e.push(`Línea ${i + 1}: falta el trabajador.`);
    if (!(Number(it.montoCLP) > 0)) e.push(`Línea ${i + 1}: el monto debe ser mayor que cero.`);
  });
  return e;
}

// ── Circuito: borrador → preparada → aprobada · devolución → borrador · anulada ──
// Cada guarda revisa la facultad DENTRO de la acción (no solo en la pantalla).
export function puedeEditarRem(u, nom) { return puedePrepararRem(u) && nom?.estado === "borrador"; }
export function puedeAprobarRem(u, nom) {
  if (!puedeAprobarRemFac(u) || nom?.estado !== "preparada") return false;
  const yo = normCorreo(u.email);
  return !!yo && !(nom.autores || []).includes(yo) && nom.preparadoPorCorreo !== yo;   // nadie aprueba lo que preparó
}

export function enviarAAprobacion(nom, u) {
  if (!puedeEditarRem(u, nom)) throw new Error("Solo quien prepara remuneraciones puede enviar un borrador a aprobación.");
  const errs = erroresParaEnviar(nom); if (errs.length) throw new Error(errs.join(" "));
  return { ...nom, estado: "preparada", enviadaEn: new Date().toISOString(), historial: [...(nom.historial || []), hist("enviada", u)] };
}
export function aprobarRem(nom, u) {
  if (!puedeAprobarRem(u, nom)) throw new Error("No puedes aprobar esta nómina (requiere la facultad de aprobar, estado preparada y no ser su autor).");
  return { ...nom, estado: "aprobada", aprobadoPor: u.nombre, aprobadoPorCorreo: normCorreo(u.email), aprobadoEn: new Date().toISOString(),
    historial: [...(nom.historial || []), hist("aprobada", u)] };
}
export function devolverRem(nom, u, motivo) {
  if (!puedeAprobarRem(u, nom)) throw new Error("No puedes devolver esta nómina.");
  if (!String(motivo || "").trim()) throw new Error("Devolver exige un motivo.");
  return { ...nom, estado: "borrador", historial: [...(nom.historial || []), hist("devuelta", u, { motivo })] };
}
export function anularRem(nom, u, motivo) {
  if (!puedePrepararRem(u) || !["borrador", "preparada"].includes(nom?.estado)) throw new Error("Solo quien prepara puede anular una nómina en borrador o preparada.");
  if (!String(motivo || "").trim()) throw new Error("Anular exige un motivo.");
  return { ...nom, estado: "anulada", historial: [...(nom.historial || []), hist("anulada", u, { motivo })] };
}
export function editarLineas(nom, u, items) {
  if (!puedeEditarRem(u, nom)) throw new Error("Solo se editan borradores, y solo quien prepara remuneraciones.");
  const yo = normCorreo(u.email);
  const autores = (nom.autores || []).includes(yo) ? nom.autores : [...(nom.autores || []), yo];
  return { ...nom, items, autores };
}

// ══════════════════════════════════════════════════════════════════════
// Registros EXISTENTES de la nómina general
// ══════════════════════════════════════════════════════════════════════
// Dos cosas distintas (decisión 08-10, segunda revisión):
//  · Clasificación EXPLÍCITA: quien cargó la línea la puso en la sección «Anticipos de
//    Sueldo» o le dio el tipo de documento «Remuneraciones». Es remuneración: su detalle
//    se restringe y se traslada.
//  · Sugerencia POR PALABRAS: «anticipo», «descuento», «bono»… en el texto. NO se trata
//    como remuneración: no se oculta, no cambia ningún total; solo se lista para revisar.
//    («anticipo a proveedor» y «descuento comercial» no son remuneraciones.)
const PALABRAS = ["sueldo", "remuneraci", "finiquito", "bono", "gratificaci", "aguinaldo", "indemnizaci",
  "anticipo", "liquidacion de sueldo", "vacaciones proporcionales", "descuento"];
export const ETIQUETA_AGREGADO = "Remuneraciones (detalle restringido)";
// Sección del agregado (UNO por nómina, no por sección: por sección, una sección con una
// sola línea dejaba ver ese monto individual). Es «anticipos» a propósito: la versión
// publicada (main) solo suma en el total las secciones que conoce; con una sección nueva,
// un rollback de código haría bajar el total de la nómina en silencio.
export const SECCION_AGREGADO = "anticipos";

export const esTrasladada = (it) => it?.estadoLinea === "trasladada";
export const esAgregadoRemLinea = (it) => !!(it?.agregadoRem || it?._agregadoVista);
export const tieneDecision = (it) => !!it?.clasificacionRem?.valor;

// Clasificación explícita de una línea de la nómina general, o null.
export function clasificacionExplicita(it) {
  if (!it || esAgregadoRemLinea(it) || esTrasladada(it)) return null;
  if (it.seccion === "anticipos") return { clase: "anticipo", motivo: "sección «Anticipos de Sueldo»" };
  if (norm(it.tipoDoc).includes("remuneraci")) return { clase: null, motivo: "tipo de documento «Remuneraciones»" };
  return null;
}
// Sugerencias por palabras (solo informativas). Las líneas creadas con la versión que
// separa remuneraciones (creadaV >= 2) no se sugieren.
export function sugerenciasPalabras(it, nom) {
  if (!it || esAgregadoRemLinea(it) || esTrasladada(it) || tieneDecision(it) || clasificacionExplicita(it) || it.creadaV >= 2) return [];
  const m = [];
  const extra = (nom?.seccionesExtra || []).find(s => s.id === it.seccion);
  if (extra && PALABRAS.some(p => norm(extra.label).includes(p))) m.push(`sección «${extra.label}»`);
  const hits = PALABRAS.filter(p => norm([it.proveedor, it.concepto, it.comentario].join(" ")).includes(p));
  if (hits.length) m.push(`texto: ${hits.join(", ")}`);
  return m;
}
// Restringida = remuneración por clasificación explícita, aún en la nómina general.
export const esRestringidaPendiente = (it) => !!clasificacionExplicita(it) && !tieneDecision(it);

// Listado para revisión (solo quien puede ver remuneraciones).
export function candidatosRemuneracion(nominas) {
  const out = [];
  for (const nom of nominas || []) for (const it of nom.items || []) {
    const ex = tieneDecision(it) ? null : clasificacionExplicita(it);
    const sug = ex ? [] : sugerenciasPalabras(it, nom);
    if (!ex && !sug.length) continue;
    out.push({ tipo: ex ? "explicita" : "sugerencia", claseSugerida: ex?.clase || null,
      nominaId: nom.id, empresa: nom.empresa, semana: nom.semana, año: nom.año, numero: nom.numero || 1,
      estadoNomina: nom.estado, nominaActiva: (nom.estadoNomina || "activa") !== "inactiva",
      itemId: it.id, seccion: it.seccion, proveedor: it.proveedor || "", concepto: it.concepto || "", tipoDoc: it.tipoDoc || "",
      montoCLP: Number(it.montoCLP) || 0, montoUSD: Number(it.montoUSD) || 0, montoPEN: Number(it.montoPEN) || 0,
      documentos: (it.documentos || []).filter(d => (d?.estado || "activo") === "activo").length,
      estadoLinea: it.estadoLinea || "activa", motivos: ex ? [ex.motivo] : sug });
  }
  return out;
}

const csvCelda = (v) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function candidatosCSV(lista) {
  const cab = ["tipo", "empresa", "semana", "año", "n°", "estado nómina", "sección", "proveedor/trabajador", "concepto", "tipo doc", "monto CLP", "monto USD", "monto PEN", "documentos", "estado línea", "motivos", "nominaId", "itemId"];
  const filas = lista.map(c => [c.tipo === "explicita" ? "clasificación explícita" : "sugerencia por palabras", c.empresa, c.semana, c.año, c.numero, c.estadoNomina, c.seccion, c.proveedor, c.concepto, c.tipoDoc,
    c.montoCLP, c.montoUSD, c.montoPEN, c.documentos, c.estadoLinea, c.motivos.join(" | "), c.nominaId, c.itemId]);
  return [cab, ...filas].map(f => f.map(csvCelda).join(";")).join("\n");
}

// ── Vista para quien NO puede ver remuneraciones ──
// Las líneas de clasificación explícita se reemplazan por UNA línea agregada de solo
// lectura por sección, con la suma: el total de la nómina NO cambia. Todo lo que se
// dibuja, suma, busca, imprime o exporta parte de esta vista. (El detalle sigue en la
// fila `nominas` hasta que se traslade: control de pantalla, no de datos.)
const sumar = (its, k) => its.reduce((s, x) => s + (Number(x[k]) || 0), 0);
export function vistaNominas(nominas, verRem) {
  if (verRem) return nominas;
  return (nominas || []).map(nom => {
    const items = nom.items || [];
    const ocultas = items.filter(it => esRestringidaPendiente(it) && (it.estadoLinea || "activa") === "activa");
    if (!ocultas.length) return nom;
    const idsOcultas = new Set(ocultas.map(x => x.id));
    // Si ya hay un agregado persistido (traslados anteriores), se suma a ese mismo.
    const persistido = items.find(it => it.agregadoRem);
    const base = persistido ? [persistido] : [];
    const todas = [...base, ...ocultas];
    const agregado = { id: persistido ? persistido.id : `_agrvista_${nom.id}`, _agregadoVista: true, seccion: SECCION_AGREGADO, estadoLinea: "activa",
      proveedor: ETIQUETA_AGREGADO, tipoDoc: "", documentos: [],
      lineas: (persistido?.lineas || 0) + ocultas.length,
      montoCLP: sumar(todas, "montoCLP"), montoUSD: sumar(todas, "montoUSD"), montoPEN: sumar(todas, "montoPEN"),
      pagado: todas.every(x => x.pagado), _incluyePersistido: !!persistido };
    return { ...nom, items: [...items.filter(it => !idsOcultas.has(it.id) && !it.agregadoRem), agregado], _restringidasPendientes: ocultas.length };
  });
}

// Al guardar desde la vista: se quitan los agregados de vista y se reponen las líneas
// ocultas en su lugar. Una línea que viene en la versión editada manda.
export function reinsertarRestringidas(original, editada) {
  const { _restringidasPendientes, ...resto } = editada || {};
  // El agregado de vista nunca se guarda; el persistido (si lo había) vuelve tal cual.
  const sinVista = (resto.items || []).filter(it => !it._agregadoVista);
  if (!original) return { ...resto, items: sinVista };
  const ed = new Map(sinVista.map(it => [it.id, it]));
  const items = [];
  for (const it of original.items || []) {
    if (ed.has(it.id)) { items.push(ed.get(it.id)); ed.delete(it.id); }
    else if (esRestringidaPendiente(it) || it.agregadoRem) items.push(it);
  }
  for (const it of ed.values()) items.push(it);
  return { ...resto, items };
}

// ── Huella de una versión (FNV-1a sobre JSON canónico). Identifica, no es criptográfica. ──
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}
export function huella(v) {
  let h = 0x811c9dc5; const t = canon(v);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

// ── Decisiones sobre registros existentes ──
export function marcarNoRemuneracion(nomGeneral, itemId, u, motivo) {
  if (!puedePrepararRem(u)) throw new Error("Solo quien prepara remuneraciones clasifica registros existentes.");
  const it = (nomGeneral.items || []).find(x => x.id === itemId);
  if (it && clasificacionExplicita(it) && !String(motivo || "").trim())
    throw new Error("La línea tiene clasificación explícita de remuneración: cambiarla exige un motivo.");
  const ts = new Date().toISOString();
  return { ...nomGeneral,
    items: (nomGeneral.items || []).map(x => x.id !== itemId ? x : {
      ...x, clasificacionRem: { valor: "no_remuneracion", por: u.nombre, correo: normCorreo(u.email), ts, motivo: motivo || "" },
      historial: [...(x.historial || []), { accion: "clasificada_no_remuneracion", usuario: u.nombre, fecha: ts, motivo: motivo || "" }] }),
    rectificaciones: it && clasificacionExplicita(it)
      ? [...(nomGeneral.rectificaciones || []), { id: nuevoId("rect"), tipo: "reclasificacion_no_remuneracion", itemId, por: u.nombre, ts, motivo }]
      : (nomGeneral.rectificaciones || []) };
}

// Modo del traslado según el estado de la nómina general de origen:
//  · "historica": ya entró a un circuito de aprobación (preparada, revisión, V°B°,
//    aprobada). Se CONSERVA su versión aprobada (copia + huella en la fila restringida)
//    y su total: la línea se reemplaza por un agregado de solo lectura. No se vuelve a pagar.
//  · "circuito": borrador. La línea pasa a una nómina de remuneraciones en borrador y se
//    paga por ese circuito (Angelo prepara, Lucía o Cristobal aprueban). Sale de la general.
export const modoTraslado = (nomGeneral) => (nomGeneral?.estado || "borrador") === "borrador" ? "circuito" : "historica";

// Paso 1: copia completa (con historial y documentos) a la fila restringida. Idempotente.
export function trasladarAFilaRem(filaRem, nomGeneral, itemId, clase, u) {
  if (!puedePrepararRem(u)) throw new Error("Solo quien prepara remuneraciones traslada registros.");
  if (!esClaseValida(clase)) throw new Error("Elige la clasificación (sueldo, anticipo, descuento, bono o finiquito).");
  const f = normalizarFilaRem(filaRem);
  f.versionesAprobadas = Array.isArray(f.versionesAprobadas) ? f.versionesAprobadas : [];
  const it = (nomGeneral.items || []).find(x => x.id === itemId);
  if (!it || esTrasladada(it) || esAgregadoRemLinea(it)) throw new Error("La línea ya no está en la nómina general.");
  const ya = buscarTrasladada(f, itemId);
  const modo = modoTraslado(nomGeneral);
  if (ya) return { fila: f, remNominaId: ya.nom.id, remItemId: ya.it.id, yaEstaba: true, modo: ya.nom.estado === "historica" ? "historica" : "circuito" };
  const ts = new Date().toISOString();
  // Versión aprobada: se congela la PRIMERA vez que se toca esa nómina (antes de cualquier traslado).
  let hv = null;
  if (modo === "historica") {
    const prev = f.versionesAprobadas.find(v => v.nominaId === nomGeneral.id);
    if (prev) hv = prev.huella;
    else {
      hv = huella(nomGeneral);
      f.versionesAprobadas = [...f.versionesAprobadas, { nominaId: nomGeneral.id, empresa: nomGeneral.empresa, semana: nomGeneral.semana, año: nomGeneral.año,
        estado: nomGeneral.estado, aprobadoPor: nomGeneral.aprobadoPor || "", aprobado1Por: nomGeneral.aprobado1Por || "",
        fechaAprobacion: nomGeneral.fechaAprobacion || "", huella: hv, copia: JSON.parse(JSON.stringify(nomGeneral)), por: u.nombre, ts }];
    }
  }
  const clave = `${modo === "historica" ? "hist" : "circ"}::${nomGeneral.empresa}::${nomGeneral.año}::${nomGeneral.semana}`;
  let nom = f.nominas.find(n => n.claveTraslado === clave && (modo === "historica" || n.estado === "borrador"));
  const linea = { ...it, id: nuevoId("remit"), clase, trabajador: it.proveedor || "",
    origen: { fila: "nominas", nominaId: nomGeneral.id, itemId, seccion: it.seccion, semana: nomGeneral.semana, año: nomGeneral.año,
      estadoNominaOrigen: nomGeneral.estado, modo, huellaVersionAprobada: hv },
    historial: [...(it.historial || []), { accion: "trasladada_desde_nomina_general", usuario: u.nombre, fecha: ts, clase, modo }] };
  delete linea.clasificacionRem;
  if (!nom) {
    nom = modo === "historica"
      ? { id: nuevoId("rem"), empresa: nomGeneral.empresa, periodo: `${nomGeneral.año}-S${nomGeneral.semana}`, numero: 1, estado: "historica",
          claveTraslado: clave, items: [], autores: [], preparadoPor: "", preparadoPorCorreo: "",
          historial: [hist("creada_historica", u, { motivo: "Trasladadas desde una nómina general ya tramitada: se pagaron en ese circuito, no se vuelven a pagar" })] }
      : { ...nominaRemVacia({ empresa: nomGeneral.empresa, periodo: `${nomGeneral.año}-S${nomGeneral.semana}` }, u), claveTraslado: clave,
          historial: [hist("creada_desde_traslado", u, { motivo: "Líneas de una nómina general en borrador: se pagan por el circuito de remuneraciones" })] };
    f.nominas = [...f.nominas, nom];
  }
  const nomNueva = { ...nom, items: [...nom.items, linea], historial: [...nom.historial, hist("linea_trasladada", u, { clase, modo })] };
  f.nominas = f.nominas.map(n => n.id === nom.id ? nomNueva : n);
  f.clasificaciones = [...f.clasificaciones, { itemId, nominaId: nomGeneral.id, clase, modo, por: u.nombre, correo: normCorreo(u.email), ts }];
  return { fila: f, remNominaId: nom.id, remItemId: linea.id, yaEstaba: false, modo, huellaVersionAprobada: hv };
}
export function buscarTrasladada(filaRem, itemIdOrigen) {
  for (const nom of normalizarFilaRem(filaRem).nominas) for (const it of nom.items || [])
    if (it.origen?.itemId === itemIdOrigen && !it.revertida) return { nom, it };
  return null;
}

// Paso 2 (solo DESPUÉS de que el servidor confirmó el paso 1): en la nómina general la
// línea queda como rastro SIN montos, nombres ni documentos; en modo "historica" su monto
// pasa a la línea agregada de la sección, así el total aprobado no cambia. Queda una
// rectificación visible en la nómina (sin montos) y una entrada en su historial.
export function stubTrasladada(nomGeneral, itemId, ref, u) {
  const it = (nomGeneral.items || []).find(x => x.id === itemId);
  if (!it || esTrasladada(it)) return nomGeneral;
  const modo = ref.modo || modoTraslado(nomGeneral);
  const ts = new Date().toISOString();
  let items = (nomGeneral.items || []).map(x => x.id !== itemId ? x : {
    id: x.id, seccion: x.seccion, estadoLinea: "trasladada", montoCLP: 0, montoUSD: 0, montoPEN: 0, documentos: [],
    trasladada: { fila: FILA_REM, modo, remNominaId: ref.remNominaId, remItemId: ref.remItemId, por: u.nombre, ts } });
  if (modo === "historica") {
    const idAgr = "agrem";
    const agr = items.find(x => x.id === idAgr);
    const base = agr || { id: idAgr, agregadoRem: true, seccion: SECCION_AGREGADO, estadoLinea: "activa", proveedor: ETIQUETA_AGREGADO,
      tipoDoc: "", montoCLP: 0, montoUSD: 0, montoPEN: 0, documentos: [], lineas: 0, pagado: true, historial: [] };
    const nuevo = { ...base, montoCLP: (Number(base.montoCLP) || 0) + (Number(it.montoCLP) || 0), montoUSD: (Number(base.montoUSD) || 0) + (Number(it.montoUSD) || 0),
      montoPEN: (Number(base.montoPEN) || 0) + (Number(it.montoPEN) || 0), lineas: (base.lineas || 0) + 1, pagado: !!base.pagado && !!it.pagado,
      concepto: `${(base.lineas || 0) + 1} línea${(base.lineas || 0) + 1 === 1 ? "" : "s"} trasladada${(base.lineas || 0) + 1 === 1 ? "" : "s"}` };
    items = agr ? items.map(x => x.id === idAgr ? nuevo : x) : [...items, nuevo];
  }
  return { ...nomGeneral, items,
    rectificaciones: [...(nomGeneral.rectificaciones || []), { id: nuevoId("rect"), tipo: "traslado_remuneraciones", modo, itemId, seccion: it.seccion,
      estadoNomina: nomGeneral.estado, huellaVersionAprobada: ref.huellaVersionAprobada || null, por: u.nombre, ts }],
    historial: [...(nomGeneral.historial || []), { accion: "linea_trasladada_remuneraciones", usuario: u.nombre, fecha: ts, detalle: modo === "historica" ? "total conservado (agregado)" : "pasa al circuito de remuneraciones" }] };
}

// ── Reversión de DATOS (distinta del rollback de código) ──
// Devuelve la línea a la nómina general tal como estaba (vuelve a ser una remuneración
// pendiente de traslado). Orden: (1) marcar la copia restringida como revertida (no se
// borra) · (2) restaurar en la general. Si (2) falla, la línea revertida se ofrece para
// completar. No se revierte una línea cuya nómina de remuneraciones ya fue aprobada.
export function revertirEnFilaRem(filaRem, itemIdOrigen, u, motivo) {
  if (!puedePrepararRem(u)) throw new Error("Solo quien prepara remuneraciones revierte traslados.");
  if (!String(motivo || "").trim()) throw new Error("Revertir un traslado exige un motivo.");
  const f = normalizarFilaRem(filaRem);
  const ya = buscarTrasladada(f, itemIdOrigen);
  if (!ya) throw new Error("No hay un traslado vigente de esa línea.");
  if (ya.nom.estado === "aprobada" || ya.nom.estado === "preparada") throw new Error("La nómina de remuneraciones ya está en aprobación o aprobada: devuélvela a borrador antes de revertir.");
  const ts = new Date().toISOString();
  const copia = ya.it;
  f.nominas = f.nominas.map(n => n.id !== ya.nom.id ? n : { ...n,
    items: n.items.map(x => x.id === copia.id ? { ...x, revertida: { por: u.nombre, ts, motivo } } : x),
    historial: [...(n.historial || []), hist("traslado_revertido", u, { motivo })] });
  return { fila: f, copia };
}
export function restaurarEnGeneral(nomGeneral, copia, u, motivo) {
  const itemId = copia.origen?.itemId;
  const stub = (nomGeneral.items || []).find(x => x.id === itemId);
  if (!stub || !esTrasladada(stub)) return nomGeneral;   // ya restaurada
  const modo = copia.origen?.modo || stub.trasladada?.modo;
  const { clase, origen, revertida, trabajador, ...orig } = copia;
  const restaurada = { ...orig, id: itemId, estadoLinea: "activa",
    historial: [...(copia.historial || []), { accion: "traslado_revertido", usuario: u.nombre, fecha: new Date().toISOString(), motivo }] };
  let items = (nomGeneral.items || []).map(x => x.id === itemId ? restaurada : x);
  if (modo === "historica") {
    const idAgr = "agrem";
    items = items.map(x => x.id !== idAgr ? x : { ...x, montoCLP: (Number(x.montoCLP) || 0) - (Number(restaurada.montoCLP) || 0),
      montoUSD: (Number(x.montoUSD) || 0) - (Number(restaurada.montoUSD) || 0), montoPEN: (Number(x.montoPEN) || 0) - (Number(restaurada.montoPEN) || 0),
      lineas: (x.lineas || 1) - 1 }).filter(x => !(x.id === idAgr && x.lineas <= 0));
  }
  return { ...nomGeneral, items,
    rectificaciones: [...(nomGeneral.rectificaciones || []), { id: nuevoId("rect"), tipo: "reversion_traslado", modo, itemId, por: u.nombre, ts: new Date().toISOString(), motivo }],
    historial: [...(nomGeneral.historial || []), { accion: "traslado_revertido", usuario: u.nombre, fecha: new Date().toISOString(), motivo }] };
}
// Traslados vigentes y revertidos pendientes de completar, para la pantalla.
export function trasladosDeFila(filaRem) {
  const out = [];
  for (const nom of normalizarFilaRem(filaRem).nominas) for (const it of nom.items || [])
    if (it.origen?.fila === "nominas") out.push({ remNominaId: nom.id, estadoRem: nom.estado, it });
  return out;
}
