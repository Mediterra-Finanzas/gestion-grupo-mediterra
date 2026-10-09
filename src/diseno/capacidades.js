// ═══════════════════════════════════════════════════════════════════
// QUÉ PUEDE VER vs QUÉ PUEDE HACER (inicio y navegación).
//
// Un contador del inicio es información; ofrecer la acción es otra cosa. Ver
// rendiciones aprobadas por pagar no implica poder marcarlas pagadas.
//
// Hoy (main) no existe la fila de facultades: paga quien ve todas (admin, CFO o
// rendVerTodas), que es la regla publicada. La rama funcional agrega la fila
// `permisos_facultades` (src/permisos/facultades.js en esa rama) con dos modos:
//   · "transicion": la misma regla de main;
//   · "matriz": paga SOLO quien tiene `rendPagar` en la fila, por correo.
//   · fila sin leer: nadie paga (falla cerrada).
// Este adaptador ya recibe esa fila con la misma forma ({modo, porCorreo}) para
// que conectarla al integrar no cambie la pantalla. No se lee aquí: quien llama
// la pasa (null = no existe en esta versión).
// ═══════════════════════════════════════════════════════════════════

const norm = (s) => String(s || "").trim().toLowerCase();

// facultades: null (no existe: regla de main) | {estado:"error"} | {modo, porCorreo}
export function capacidadesRendiciones(usuario, facultades = null) {
  if (!usuario) return { verPorPagar: false, puedePagar: false, fuentePago: "sin_usuario" };
  const verTodas = usuario.rol === "admin" || !!usuario.esCFO || !!usuario.rendVerTodas;
  let puedePagar, fuentePago;
  if (facultades == null) { puedePagar = verTodas; fuentePago = "regla_main"; }
  else if (facultades.estado === "error") { puedePagar = false; fuentePago = "facultades_sin_leer"; }
  else if (facultades.modo === "matriz") { puedePagar = facultades.porCorreo?.[norm(usuario.email)]?.rendPagar === true; fuentePago = "matriz"; }
  else { puedePagar = verTodas; fuentePago = "transicion"; }
  return { verPorPagar: verTodas, puedePagar, fuentePago };
}
