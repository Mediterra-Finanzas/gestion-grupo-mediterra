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
  for (const it of nom?.items || []) if (esClaseValida(it.clase)) porClase[it.clase] += Number(it.montoCLP) || 0;
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
// Palabras que hacen ambigua una línea antigua. "honorario" no está: los honorarios
// son pago a proveedores. Una línea con honorarios y otra palabra igual se lista.
const PALABRAS = ["sueldo", "remuneraci", "finiquito", "bono", "gratificaci", "aguinaldo", "indemnizaci",
  "anticipo", "liquidacion de sueldo", "vacaciones proporcionales", "descuento"];

export const esTrasladada = (it) => it?.estadoLinea === "trasladada";
// Decisión registrada sobre la línea (solo "no_remuneracion" se guarda en la general:
// una remuneración confirmada se traslada y deja un stub).
export const tieneDecision = (it) => !!it?.clasificacionRem?.valor;

// Motivos por los que una línea de la nómina general podría ser remuneración.
export function motivosCandidato(it, nom) {
  if (!it || esTrasladada(it) || tieneDecision(it)) return [];
  const m = [];
  if (it.seccion === "anticipos") m.push("sección «Anticipos de Sueldo»");
  if (norm(it.tipoDoc).includes("remuneraci")) m.push("tipo de documento «Remuneraciones»");
  const extra = (nom?.seccionesExtra || []).find(s => s.id === it.seccion);
  if (extra && PALABRAS.some(p => norm(extra.label).includes(p))) m.push(`sección «${extra.label}»`);
  // Las líneas creadas con la versión que separa remuneraciones (creadaV >= 2) ya no
  // pueden ir a "Anticipos" ni llevar tipo "Remuneraciones"; las palabras solo marcan
  // las ANTIGUAS, que no tuvieron esa restricción.
  if (!(it.creadaV >= 2)) {
    const texto = norm([it.proveedor, it.concepto, it.comentario].join(" "));
    const hits = PALABRAS.filter(p => texto.includes(p));
    if (hits.length) m.push(`texto: ${hits.join(", ")}`);
  }
  return m;
}
export const esRestringidaPendiente = (it, nom) => motivosCandidato(it, nom).length > 0;

// Listado para revisión (lo ve solo quien puede ver remuneraciones).
export function candidatosRemuneracion(nominas) {
  const out = [];
  for (const nom of nominas || []) for (const it of nom.items || []) {
    const motivos = motivosCandidato(it, nom);
    if (!motivos.length) continue;
    out.push({ nominaId: nom.id, empresa: nom.empresa, semana: nom.semana, año: nom.año, numero: nom.numero || 1,
      estadoNomina: nom.estado, nominaActiva: (nom.estadoNomina || "activa") !== "inactiva",
      itemId: it.id, seccion: it.seccion, proveedor: it.proveedor || "", concepto: it.concepto || "", tipoDoc: it.tipoDoc || "",
      montoCLP: Number(it.montoCLP) || 0, montoUSD: Number(it.montoUSD) || 0, montoPEN: Number(it.montoPEN) || 0,
      documentos: (it.documentos || []).filter(d => (d?.estado || "activo") === "activo").length,
      estadoLinea: it.estadoLinea || "activa", motivos });
  }
  return out;
}

const csvCelda = (v) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function candidatosCSV(lista) {
  const cab = ["empresa", "semana", "año", "n°", "estado nómina", "sección", "proveedor/trabajador", "concepto", "tipo doc", "monto CLP", "monto USD", "monto PEN", "documentos", "estado línea", "motivos", "nominaId", "itemId"];
  const filas = lista.map(c => [c.empresa, c.semana, c.año, c.numero, c.estadoNomina, c.seccion, c.proveedor, c.concepto, c.tipoDoc,
    c.montoCLP, c.montoUSD, c.montoPEN, c.documentos, c.estadoLinea, c.motivos.join(" | "), c.nominaId, c.itemId]);
  return [cab, ...filas].map(f => f.map(csvCelda).join(";")).join("\n");
}

// ── Vista para quien NO puede ver remuneraciones ──
// Quita de cada nómina las líneas restringidas pendientes y deja solo el conteo.
// Todo lo que se dibuja, suma, busca, imprime o exporta parte de esta vista.
export function vistaNominas(nominas, verRem) {
  if (verRem) return nominas;
  return (nominas || []).map(nom => {
    const items = nom.items || [];
    const visibles = items.filter(it => !esRestringidaPendiente(it, nom));
    if (visibles.length === items.length) return nom;
    return { ...nom, items: visibles, _restringidasPendientes: items.length - visibles.length };
  });
}

// Al guardar una nómina editada desde la vista, se reponen las líneas ocultas en su
// lugar original. Sin esto, guardar quitaría del servidor las líneas que el usuario no ve.
export function reinsertarRestringidas(original, editada) {
  const { _restringidasPendientes, ...resto } = editada || {};
  if (!original) return resto;
  // Una línea que viene en la versión editada manda (quien la ve la pudo editar, trasladar
  // o clasificar). Solo se repone la que NO viene y estaba oculta (restringida pendiente):
  // quien no la ve no pudo quitarla.
  const ed = new Map((resto.items || []).map(it => [it.id, it]));
  const items = [];
  for (const it of original.items || []) {
    if (ed.has(it.id)) { items.push(ed.get(it.id)); ed.delete(it.id); }
    else if (esRestringidaPendiente(it, original)) items.push(it);
    // si no viene y no estaba oculta, la quitó quien la veía: se respeta (comportamiento de siempre)
  }
  for (const it of ed.values()) items.push(it);
  return { ...resto, items };
}

// ── Decisiones sobre registros existentes ──
export function marcarNoRemuneracion(nomGeneral, itemId, u) {
  if (!puedePrepararRem(u)) throw new Error("Solo quien prepara remuneraciones clasifica registros existentes.");
  return { ...nomGeneral, items: (nomGeneral.items || []).map(it => it.id !== itemId ? it : {
    ...it, clasificacionRem: { valor: "no_remuneracion", por: u.nombre, correo: normCorreo(u.email), ts: new Date().toISOString() },
    historial: [...(it.historial || []), { accion: "clasificada_no_remuneracion", usuario: u.nombre, fecha: new Date().toISOString() }] }) };
}

// Paso 1 del traslado: copia COMPLETA de la línea a la fila de remuneraciones, en una nómina
// "histórica" por empresa/semana. Idempotente: si ya está (origen.itemId), no duplica.
export function trasladarAFilaRem(filaRem, nomGeneral, itemId, clase, u) {
  if (!puedePrepararRem(u)) throw new Error("Solo quien prepara remuneraciones traslada registros.");
  if (!esClaseValida(clase)) throw new Error("Elige la clasificación (sueldo, anticipo, descuento, bono o finiquito).");
  const f = normalizarFilaRem(filaRem);
  const it = (nomGeneral.items || []).find(x => x.id === itemId);
  if (!it) throw new Error("La línea ya no está en la nómina general.");
  const ya = buscarTrasladada(f, itemId);
  if (ya) return { fila: f, remNominaId: ya.nom.id, remItemId: ya.it.id, yaEstaba: true };
  const clave = `hist::${nomGeneral.empresa}::${nomGeneral.año}::${nomGeneral.semana}`;
  let nom = f.nominas.find(n => n.claveHistorica === clave);
  const linea = { ...it, id: nuevoId("remit"), clase,
    trabajador: it.proveedor || "", origen: { fila: "nominas", nominaId: nomGeneral.id, itemId, seccion: it.seccion,
      semana: nomGeneral.semana, año: nomGeneral.año, estadoNominaOrigen: nomGeneral.estado },
    historial: [...(it.historial || []), { accion: "trasladada_desde_nomina_general", usuario: u.nombre, fecha: new Date().toISOString(), clase }] };
  delete linea.clasificacionRem;
  if (!nom) {
    nom = { id: nuevoId("rem"), empresa: nomGeneral.empresa, periodo: `${nomGeneral.año}-S${nomGeneral.semana}`, numero: 1,
      estado: "historica", claveHistorica: clave, items: [], autores: [], preparadoPor: "", preparadoPorCorreo: "",
      historial: [hist("creada_historica", u, { motivo: "Registros trasladados desde la nómina general (ya tramitados en ese circuito)" })] };
    f.nominas = [...f.nominas, nom];
  }
  const nomNueva = { ...nom, items: [...nom.items, linea], historial: [...nom.historial, hist("linea_trasladada", u, { clase })] };
  f.nominas = f.nominas.map(n => n.id === nom.id ? nomNueva : n);
  f.clasificaciones = [...f.clasificaciones, { itemId, nominaId: nomGeneral.id, clase, por: u.nombre, correo: normCorreo(u.email), ts: new Date().toISOString() }];
  return { fila: f, remNominaId: nom.id, remItemId: linea.id, yaEstaba: false };
}
export function buscarTrasladada(filaRem, itemIdOrigen) {
  for (const nom of normalizarFilaRem(filaRem).nominas) for (const it of nom.items || [])
    if (it.origen?.itemId === itemIdOrigen) return { nom, it };
  return null;
}

// Paso 2 (solo DESPUÉS de que el servidor confirmó el paso 1): en la nómina general la
// línea se reemplaza por un registro mínimo SIN montos, nombres ni documentos, para que
// el detalle no siga llegando a quien no puede verlo. La trazabilidad queda en ambos lados.
export function stubTrasladada(nomGeneral, itemId, ref, u) {
  return { ...nomGeneral,
    items: (nomGeneral.items || []).map(it => it.id !== itemId ? it : {
      id: it.id, seccion: it.seccion, estadoLinea: "trasladada", montoCLP: 0, montoUSD: 0, montoPEN: 0, documentos: [],
      trasladada: { fila: FILA_REM, remNominaId: ref.remNominaId, remItemId: ref.remItemId, por: u.nombre, ts: new Date().toISOString() } }),
    historial: [...(nomGeneral.historial || []), { accion: "linea_trasladada_remuneraciones", usuario: u.nombre, fecha: new Date().toISOString() }] };
}
