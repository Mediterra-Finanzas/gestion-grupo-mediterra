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

// Filas-blob que se escriben REEMPLAZANDO la fila completa: no hay fusión por
// ítem posible, así que "conservar la mía" no conserva solo lo que yo edité,
// sino todo el contenido de la fila tal como está en MI pantalla. En las filas
// financieras y en los PIN eso hay que decirlo con esas palabras, porque lo que
// se reemplaza son montos y credenciales de otras personas, no un texto.
export function reemplazaFilaCompleta(rowId) {
  const id = String(rowId || "");
  if (id === "pins") return true;
  if (id === "main") return true;
  if (id === "allegria" || id === "eeff" || id === "nominas") return true;
  if (id === "finanzas" || id === "finanzas_bancos") return true;
  if (/^finanzas_esc_/.test(id)) return true;
  return false;
}

// Qué contiene la fila, para nombrarlo en la advertencia en vez de decir
// "la fila completa" y dejar al lector adivinando.
function queContiene(rowId) {
  const id = String(rowId || "");
  if (id === "pins") return "los PIN de todas las personas";
  if (id === "main") return "todas las tareas, semáforos y comentarios del mes";
  if (id === "allegria") return "todos los datos de Allegria Foods";
  if (id === "eeff") return "todos los estados financieros cargados";
  if (id === "nominas") return "todas las nóminas";
  if (id === "finanzas_bancos") return "los saldos de todas las cuentas";
  if (id === "finanzas" || /^finanzas_esc_/.test(id)) return "todo el flujo de caja de las ocho empresas";
  return "todo el contenido de la fila";
}

export default function PanelConflictoFila({ conflicto, onRecuperar, onConservar, ocupado }) {
  if (!conflicto) return null;
  const nombre = conflicto.etiqueta || conflicto.rowId;
  const reemplazaTodo = reemplazaFilaCompleta(conflicto.rowId);
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
      {reemplazaTodo && (
        <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 14, padding: 10,
          borderRadius: 6, background: "#f59e0b14", border: "1px solid #f59e0b55" }}>
          <strong style={{ color: "#fbbf24" }}>Conservar la mía NO combina los dos trabajos.</strong>{" "}
          Esta fila se guarda completa, de una vez: se escribe {queContiene(conflicto.rowId)} tal
          como está en esta pantalla, y lo que la otra sesión haya cambiado ahí se reemplaza,
          aunque haya tocado algo distinto de lo que tocaste tú.
          <div style={{ marginTop: 6, color: "#e5e7eb" }}>
            Antes de escribir se vuelve a leer la versión vigente. Si la otra sesión guardó otra
            vez en el medio, no se reemplaza nada: el conflicto queda puesto de nuevo y hay que
            volver a decidir.
          </div>
        </div>
      )}
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
