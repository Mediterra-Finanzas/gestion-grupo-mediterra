/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// AvisoPersistencia.jsx — aviso en pantalla del resultado del guardado
//
// Existe porque el fallo de guardado solo vivía en la consola del navegador, que
// nadie mira. Osiris estuvo dos meses sin guardar y el único rastro era un
// TypeError en la consola. Un guardado que no llegó tiene que verse.
//
// Tres situaciones:
//   fusion     verde  — otra persona trabajaba a la vez y se combinaron los cambios.
//                       Informativo: no hay que hacer nada.
//   conflicto  rojo   — los dos editaron el mismo registro. NO se guardó, se conservó
//                       lo del servidor. Hay que anotar, recargar y reaplicar.
//   error      rojo   — el servidor rechazó o la red falló. Los cambios siguen en
//                       pantalla; no cerrar la pestaña.
//
// `construirAviso` traduce el resultado de dbSaveGeneric a uno de esos tres, para que
// los módulos no repitan la misma lógica de mensajes.
// ═══════════════════════════════════════════════════════════════════════════════
import React from "react";

export function construirAviso(id, resultado, etiqueta) {
  const nombre = etiqueta || id;
  const r = resultado || {};
  if (r.ok) {
    if (!r.fusionado) return null;
    return { id, tipo: "fusion",
      texto: `Otra persona estaba trabajando en ${nombre} al mismo tiempo. Se combinaron los dos trabajos y no se perdió nada.` };
  }
  if (r.motivo === "conflicto_item") {
    const n = (r.conflictos || []).length;
    return { id, tipo: "conflicto", conflictos: r.conflictos || [],
      texto: `No se guardó ${nombre}: otra persona editó al mismo tiempo ${n === 1 ? "el mismo registro" : "los mismos registros"} que tú. ` +
             `Para no borrar su trabajo se conservó lo que está en el servidor. Anota tu cambio, recarga la página y vuelve a aplicarlo.` };
  }
  if (r.motivo === "conflicto") {
    return { id, tipo: "conflicto",
      texto: `No se guardó ${nombre}: otra persona lo modificó mientras tú trabajabas y esta información no se puede combinar automáticamente. ` +
             `Anota tu cambio, recarga la página y vuelve a aplicarlo.` };
  }
  return { id, tipo: "error",
    texto: `No se pudo guardar ${nombre}${r.motivo === "http" && r.status ? ` (error ${r.status})` : ""}. ` +
           `Tus cambios siguen en pantalla: no cierres esta pestaña y reintenta.` };
}

export default function AvisoPersistencia({ aviso, onCerrar }) {
  if (!aviso) return null;
  const esFusion = aviso.tipo === "fusion";
  const col = esFusion
    ? { bg: "#ecfdf5", bd: "#059669", tx: "#065f46" }
    : { bg: "#fef2f2", bd: "#dc2626", tx: "#991b1b" };
  return (
    <div role="status" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 99999, maxWidth: 440,
      background: col.bg, border: `2px solid ${col.bd}`, borderRadius: 10, padding: "12px 14px",
      boxShadow: "0 6px 24px rgba(0,0,0,0.25)", fontSize: 12.5, color: col.tx, lineHeight: 1.45 }}>
      <div style={{ fontWeight: 800, marginBottom: 5 }}>
        {esFusion ? "Se combinaron los cambios"
          : aviso.tipo === "conflicto" ? "No se guardó · conflicto"
          : "No se guardó"}
      </div>
      <div>{aviso.texto}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {!esFusion && (
          <button onClick={() => window.location.reload()}
            style={{ background: col.bd, color: "#fff", border: "none", borderRadius: 6,
              padding: "5px 12px", cursor: "pointer", fontWeight: 800, fontSize: 11 }}>
            Recargar página
          </button>
        )}
        <button onClick={onCerrar}
          style={{ background: "transparent", color: col.tx, border: `1px solid ${col.bd}`,
            borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>
          Entendido
        </button>
      </div>
    </div>
  );
}
