// ═══════════════════════════════════════════════════════════════════
// RESUMEN DE INICIO — contadores del hub calculados SOLO con datos leídos
// y autorizados. Sin datos (carga en curso o fallida) devuelve null: la
// pantalla muestra «no disponible», nunca un cero inventado.
// Reglas tomadas de los módulos (no se replican):
//   · rendiciones: meTocaAprobar de RendicionesModule; «por pagar» con la
//     regla de main (ve todas = admin, CFO o rendVerTodas).
//   · tareas: estaVencida / estaProxima de App (las instancias llegan ya
//     evaluadas por quien llama).
// ═══════════════════════════════════════════════════════════════════
import { meTocaAprobar } from "../RendicionesModule.jsx";
import { capacidadesRendiciones } from "./capacidades";

const n = (s) => String(s || "").trim().toLowerCase();

// facultades: ver capacidades.js (null = esta versión no tiene la fila de facultades).
export function resumenRendiciones(rendiciones, usuario, facultades = null) {
  if (!Array.isArray(rendiciones) || !usuario) return null;
  const nombre = usuario.nombre || "";
  const admin = usuario.rol === "admin";
  const esCFO = !!usuario.esCFO;
  const cap = capacidadesRendiciones(usuario, facultades);
  const miEmail = n(usuario.email);
  const mias = rendiciones.filter(r => r && (r.trabajador === nombre || r.creadaPor === nombre));
  const de = (f) => mias.filter(f).length;
  return {
    mias: {
      total: mias.length,
      borrador: de(r => r.estado === "borrador"),
      enviada: de(r => r.estado === "enviada"),
      devuelta: de(r => r.estado === "rechazada" && r.devuelta),
      rechazada: de(r => r.estado === "rechazada" && !r.devuelta),
      aprobada: de(r => r.estado === "aprobada"),
      pagada: de(r => r.estado === "pagada"),
    },
    teTocaAprobar: rendiciones.filter(r => r && r.estado === "enviada" && meTocaAprobar(r, miEmail, admin, esCFO)).length,
    // null = no corresponde a este perfil (no se muestra), distinto de 0.
    porPagar: cap.verPorPagar ? rendiciones.filter(r => r && r.estado === "aprobada").length : null,
    // Ver ≠ hacer: solo si puede marcarlas pagadas cuentan como pendiente propio.
    puedePagar: cap.puedePagar, fuentePago: cap.fuentePago,
  };
}

// instancias: [{ id, nombre, responsable, coResponsables, supervisor, vencida, proxima,
//                estadoResp, estadoSup, detalle }]
export function resumenTareas(instancias, nombre) {
  if (!Array.isArray(instancias) || !nombre) return null;
  const vivas = instancias.filter(i => i && i.estadoResp !== "na");
  const mias = vivas.filter(i => i.responsable === nombre || (i.coResponsables || []).includes(nombre));
  const vencidas = mias.filter(i => i.vencida);
  const porVencer = mias.filter(i => !i.vencida && i.proxima);
  const porRevisar = vivas.filter(i => i.supervisor === nombre && i.estadoResp === "verde" && (i.estadoSup || "gris") === "gris");
  return { vencidas, porVencer, porRevisar };
}

// Número para el distintivo de «Pendientes». null si alguna fuente que
// corresponde al perfil no está disponible (no se muestra un total parcial).
export function totalAccionable({ tareas, rendiciones, usaTareas, usaRendiciones }) {
  if ((usaTareas && !tareas) || (usaRendiciones && !rendiciones)) return null;
  let t = 0;
  if (usaTareas) t += tareas.vencidas.length + tareas.porRevisar.length;
  if (usaRendiciones) t += rendiciones.teTocaAprobar + rendiciones.mias.devuelta + (rendiciones.puedePagar ? (rendiciones.porPagar || 0) : 0);
  return t;
}

// ¿El perfil usa la app solo para rendir gastos? (Finanzas con únicamente la
// pestaña Rendiciones visible y ningún otro módulo).
export function esSoloRendiciones(modulos, pestanasFinanzas) {
  const ms = (modulos || []).filter(Boolean);
  return ms.length === 1 && ms[0] === "finanzas"
    && pestanasFinanzas.length === 1 && pestanasFinanzas[0].id === "rendiciones";
}
