/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// DIÁLOGOS DE LA APP (reemplazo de window.prompt / window.confirm).
//
// Devuelven lo mismo que los del navegador (texto o null; true/false), pero
// como promesa y dibujados con el modal del sistema: hoja inferior en teléfono,
// Esc cancela, foco en el campo. Así cada uso cambia en una línea
// (`window.prompt(…)` → `await pedirTexto(…)`) y la lógica que sigue no cambia.
//
// Un único <DialogosHost/> montado en App atiende las solicitudes. Si no hay
// host montado (pruebas sin App, otra página), se usa el diálogo del navegador:
// el comportamiento nunca queda peor que antes.
// ═══════════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState } from "react";
import { Modal, Boton } from "./componentes.jsx";

let abrir = null;   // lo registra el host
let abierto = false; // hay un diálogo esperando respuesta

// Diferencia con prompt/confirm del navegador: aquellos BLOQUEABAN la página, así que nada
// cambiaba mientras se respondía. Estos esperan sin bloquear: mientras tanto puede llegar un
// cambio de otra sesión (realtime) o terminar un guardado. Por eso:
//  · un solo diálogo a la vez: una segunda solicitud mientras hay uno abierto se responde
//    como «cancelar» (nunca ejecuta dos veces la misma acción);
//  · quien escribe un registro con lo que tenía al preguntar debe comprobar con
//    `sigueIgual(ref, huellaAntes)` que el registro no cambió, y si cambió no aplicar nada
//    (`avisarDesactualizado`). Ver useUltimo/huella.
function solicitar(tipo, op, respaldo) {
  // Pruebas de navegador anteriores responden diálogos nativos: el Supabase falso de
  // las pruebas activa __MDT_DIALOGOS_NATIVOS (scripts/e2e/fake.mjs). Nunca en producción.
  if (!abrir || (typeof window !== "undefined" && window.__MDT_DIALOGOS_NATIVOS)) return Promise.resolve(respaldo());
  if (abierto) return Promise.resolve(tipo === "confirmar" ? false : null);
  abierto = true;
  return new Promise(resolve => abrir({ tipo, ...op, resolve: (r) => { abierto = false; resolve(r); } }));
}

// Último valor renderizado de un dato (la closure de una acción async queda con el valor viejo).
export function useUltimo(valor) { const r = useRef(valor); r.current = valor; return r; }
export function huella(v) { try { return JSON.stringify(v); } catch (e) { return null; } }
export function sigueIgual(valorActual, huellaAntes) { const h = huella(valorActual); return h !== null && h === huellaAntes; }
export function avisarDesactualizado(que = "El registro") {
  const t = `${que} cambió mientras respondías (otra sesión o un guardado). No se aplicó nada: revisa los datos y vuelve a intentarlo.`;
  return solicitar("aviso", { texto: t, titulo: "Datos actualizados", aceptar: "Entendido" }, () => window.alert(t));
}

// texto: mensaje (puede tener saltos de línea). obligatorio: no deja confirmar vacío.
export function pedirTexto(texto, valorInicial = "", { titulo = "Confirmar", obligatorio = false, etiqueta = "Respuesta", aceptar = "Aceptar" } = {}) {
  return solicitar("texto", { texto, valorInicial, titulo, obligatorio, etiqueta, aceptar },
    () => window.prompt(texto, valorInicial));
}
// opciones: [{valor, etiqueta}] → valor elegido o null.
export function elegirOpcion(texto, opciones, { titulo = "Elegir" } = {}) {
  return solicitar("opcion", { texto, opciones, titulo }, () => {
    const r = window.prompt(`${texto}\n\n${opciones.map((o, i) => `${i + 1} = ${o.etiqueta}`).join("\n")}`);
    const o = opciones[Number(r) - 1]; return o ? o.valor : null;
  });
}
export function confirmar(texto, { titulo = "Confirmar", aceptar = "Aceptar", peligro = false } = {}) {
  return solicitar("confirmar", { texto, titulo, aceptar, peligro }, () => window.confirm(texto));
}

export function DialogosHost() {
  const [d, setD] = useState(null);
  const [valor, setValor] = useState("");
  useEffect(() => {
    abrir = (op) => { setValor(op.valorInicial ?? ""); setD(op); };
    return () => { abrir = null; abierto = false; };
  }, []);
  if (!d) return null;
  // Un doble clic en «Aceptar» resuelve una sola vez: la promesa ya resuelta ignora el segundo.
  const cerrar = (r) => { const res = d.resolve; setD(null); res(r); };
  const vacio = d.tipo === "texto" && d.obligatorio && !String(valor).trim();
  const pie = d.tipo === "aviso"
    ? <Boton tipo="primario" data-testid="dialogo-aceptar" onClick={() => cerrar(true)}>{d.aceptar || "Entendido"}</Boton>
    : d.tipo === "opcion"
    ? <Boton tipo="secundario" onClick={() => cerrar(null)}>Cancelar</Boton>
    : <>
        <Boton tipo="secundario" onClick={() => cerrar(d.tipo === "confirmar" ? false : null)}>Cancelar</Boton>
        <Boton tipo={d.peligro ? "peligro" : "primario"} disabled={vacio} data-testid="dialogo-aceptar"
          onClick={() => cerrar(d.tipo === "confirmar" ? true : valor)}>{d.aceptar || "Aceptar"}</Boton>
      </>;
  return (
    <Modal abierto titulo={d.titulo} onCerrar={() => cerrar(d.tipo === "confirmar" ? false : null)} pie={pie} testid="dialogo-app">
      <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--mdt-t-cuerpo)", color: "var(--mdt-c-texto)", marginBottom: 12, lineHeight: 1.5 }}>{d.texto}</div>
      {d.tipo === "texto" && (
        <div className="mdt-campo">
          <label htmlFor="dialogo-campo">{d.etiqueta}{d.obligatorio ? " (obligatorio)" : ""}</label>
          <textarea id="dialogo-campo" rows={3} value={valor} onChange={e => setValor(e.target.value)} />
        </div>
      )}
      {d.tipo === "opcion" && (
        <div className="mdt-acciones mdt-acciones--apiladas">
          {d.opciones.map(o => <Boton key={o.valor} tipo="secundario" data-testid={`dialogo-opcion-${o.valor}`} onClick={() => cerrar(o.valor)}>{o.etiqueta}</Boton>)}
        </div>
      )}
    </Modal>
  );
}
