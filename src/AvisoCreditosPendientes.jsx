/* eslint-disable */
// Aviso persistente de cambios de Créditos que el servidor no confirmó
// (ver src/creditosPendientes.js). Se muestra en el Hub/Tareas (App.jsx) y en
// Finanzas; no se cierra solo: desaparece cuando el servidor confirma o cuando
// alguien decide explícitamente en Créditos → revisión de pendientes.
import React, { useEffect, useState } from "react";
import { pendientesCreditos, EVENTO, CLAVE_LS } from "./creditosPendientes.js";

// Solo las anotaciones de `usuario` (el navegador puede ser compartido). Sin usuario: ninguna.
export function useCreditosPendientes(usuario) {
  const deUsuario = () => (usuario ? pendientesCreditos.listar().filter(e => e.usuario === usuario) : []);
  const [lista, setLista] = useState(deUsuario);
  useEffect(() => {
    const leer = () => setLista(deUsuario());
    const otraPestana = (e) => { if (!e || e.key === CLAVE_LS) leer(); };
    window.addEventListener(EVENTO, leer);
    window.addEventListener("storage", otraPestana);
    leer();
    return () => { window.removeEventListener(EVENTO, leer); window.removeEventListener("storage", otraPestana); };
  }, [usuario]); // eslint-disable-line
  return lista;
}

export default function AvisoCreditosPendientes({ texto, usuario }) {
  const lista = useCreditosPendientes(usuario);
  const sinConfirmar = lista.filter(e => e.estado === "sin_confirmar");
  const enVuelo = lista.filter(e => e.estado === "en_vuelo");
  if (!lista.length) return null;
  const n = (l) => l.reduce((s, e) => s + (e.cambios || []).length, 0);
  return (
    <div role="alert" data-aviso-creditos-pendientes style={{ background: sinConfirmar.length ? "#fef2f2" : "#fffbeb",
      border: `1px solid ${sinConfirmar.length ? "#dc2626" : "#f59e0b"}`, color: sinConfirmar.length ? "#7f1d1d" : "#78350f",
      borderRadius: 10, padding: "10px 14px", margin: "0 0 12px", fontSize: 12, lineHeight: 1.45 }}>
      {sinConfirmar.length > 0 && <div><b>Créditos: {n(sinConfirmar)} cambio(s) NO confirmados por el servidor.</b> No están registrados
        aunque se hayan visto en pantalla. Se conservan en este navegador para recuperarlos: {texto || "abre Flujo de Caja → 💳 Créditos para revisarlos y reintentar."}</div>}
      {enVuelo.length > 0 && <div><b>Créditos: {n(enVuelo)} cambio(s) guardándose…</b> todavía sin confirmación del servidor.</div>}
      {pendientesCreditos.soloEnMemoria() && <div><b>No se pudo guardar la anotación en este navegador</b> (almacenamiento lleno o bloqueado): se perderá si cierras o recargas esta pestaña.</div>}
    </div>
  );
}
