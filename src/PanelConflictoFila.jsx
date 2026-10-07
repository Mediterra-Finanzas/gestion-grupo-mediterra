/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════════════
// PanelConflictoFila.jsx — las DOS salidas del conflicto pendiente, en pantalla.
//
// Se muestra cuando una fila quedó BLOQUEADA para escritura: otra sesión la
// modificó, el contrato no pisó nada y los cambios locales siguen en pantalla
// SIN guardarse. De ese estado solo se sale eligiendo, y el texto tiene que
// decir qué se pierde en cada camino:
//   · "Recuperar la versión del servidor"  → se descarta lo local;
//   · "Conservar la mía"                   → se reemplaza lo del servidor.
// No hay tercera opción automática: son operaciones financieras y no se
// fusionan sin decisión humana.
//
// Es un componente aparte (y no JSX inline) para poder montarlo en una prueba
// sin levantar App.jsx completo. Lo usan App.jsx (filas `main` y `pins`) y
// AllegriaModule.jsx (fila `allegria`); FinanzasModule tiene su propia copia
// inline anterior, con el mismo texto.
// ══════════════════════════════════════════════════════════════════════════════
import React from "react";

export default function PanelConflictoFila({ conflicto, onRecuperar, onConservar, ocupado }) {
  if (!conflicto) return null;
  const nombre = conflicto.etiqueta || conflicto.rowId;
  return (
    <div role="alertdialog" aria-label="Conflicto de guardado sin resolver"
      style={{ position: "fixed", left: "50%", top: "12%", transform: "translateX(-50%)", zIndex: 99999,
        maxWidth: 620, width: "calc(100% - 32px)", padding: 18, borderRadius: 10, background: "#1f2937",
        border: "2px solid #f59e0b", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", color: "#f9fafb",
        fontFamily: "sans-serif" }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8, color: "#fbbf24" }}>
        Tu cambio NO se guardó: otra sesión modificó {nombre}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
        Mientras esto no se resuelva no se escribe nada en el servidor, y tu cambio sigue
        en pantalla sin perderse. No se combinan las dos versiones de forma automática:
        la decisión es tuya.
        <div style={{ marginTop: 8 }}>
          <strong>Recuperar la versión del servidor</strong> descarta lo que escribiste acá.
          <br />
          <strong>Conservar la mía</strong> escribe tu versión encima de la del servidor, y
          se pierde lo que haya hecho la otra sesión.
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onRecuperar} disabled={!!ocupado}
          style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #38bdf8",
            background: "#38bdf822", color: "#38bdf8", fontWeight: 700, fontSize: 12,
            cursor: ocupado ? "default" : "pointer", opacity: ocupado ? 0.6 : 1 }}>
          Recuperar la versión del servidor (descarta mi cambio)
        </button>
        <button onClick={onConservar} disabled={!!ocupado}
          style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #f59e0b",
            background: "#f59e0b22", color: "#fbbf24", fontWeight: 700, fontSize: 12,
            cursor: ocupado ? "default" : "pointer", opacity: ocupado ? 0.6 : 1 }}>
          Conservar mi versión (reemplaza la del servidor)
        </button>
      </div>
    </div>
  );
}
