/* eslint-disable */
// src/proceso/ui/hooks/useServiceContext.jsx
// Contexto operacional del módulo: tenant (empresa), planta, temporada, fecha,
// permisos por pestaña (reflejo, NO seguridad) y toasts. La empresa es el TENANT
// (Allegria Service es el inicial, NO el único: proc_* es multi-tenant).
import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from "react";
import { procRpc, cargarPlantas } from "../../core/procesoDB";

const Ctx = createContext(null);

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ServiceProvider({ children, empresaId = null, tabPermisos = {}, esAdmin = false, usuario = null }) {
  const [empresa, setEmpresa] = useState(empresaId);
  const [planta, setPlanta] = useState(null);
  const [plantas, setPlantas] = useState([]);   // F-01: catálogo del tenant (autoridad para auto-resolver planta única en mutaciones)
  const [temporada, setTemporada] = useState(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [toast, setToast] = useState(null);
  const [vista, setVista] = useState({ page: "centro", params: {} });
  const ir = useCallback((page, params = {}) => setVista({ page, params }), []);

  // AUTHZ: capabilities efectivas del actor en su empresa (SOLO reflejo de UX; la autoridad es
  // server-side RLS/RPC/triggers). Fallback seguro: si la función authz aún no está desplegada
  // en la DB, caps queda vacío y la app opera como antes (cero regresión). Se re-hidrata al cambiar
  // de empresa (tenant). Nunca se usa como autoridad ni se persiste en localStorage.
  const [caps, setCaps] = useState(() => new Set());
  useEffect(() => {
    let vivo = true;
    if (!empresa) { setCaps(new Set()); return; }
    (async () => {
      try {
        const arr = await procRpc("proc_effective_caps", { p_empresa: empresa });
        if (vivo) setCaps(new Set(Array.isArray(arr) ? arr : []));
      } catch {
        if (vivo) setCaps(new Set());  // authz no desplegada / sin permiso → sin caps (comportamiento previo)
      }
    })();
    return () => { vivo = false; };
  }, [empresa]);
  const hasCap = useCallback((cap) => caps.has(cap), [caps]);

  // F-01: catálogo de plantas del tenant. Solo alimenta el auto-resolver de planta única en
  // mutaciones (plantaParaMutar) y el selector del shell. Fallback seguro: si falla, queda [] y
  // "Todas las plantas" bloquea toda mutación (fail-closed, nunca menos seguro).
  useEffect(() => {
    let vivo = true;
    if (!empresa) { setPlantas([]); return; }
    cargarPlantas(empresa).then((p) => { if (vivo) setPlantas(Array.isArray(p) ? p : []); }).catch(() => { if (vivo) setPlantas([]); });
    return () => { vivo = false; };
  }, [empresa]);

  const notificar = useCallback((texto, tipo = "ok") => {
    setToast({ texto, tipo, tono: tipo === "error" ? "danger" : "success" });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // permiso por pestaña: refleja lo que resolvió App.jsx (RLS/RPC = autoridad real)
  const permisoDe = useCallback((tabId) => {
    if (esAdmin) return "editar";
    return (tabPermisos && tabPermisos[tabId]) || "sin_acceso";
  }, [tabPermisos, esAdmin]);
  const puedeEditar = useCallback((tabId) => permisoDe(tabId) === "editar", [permisoDe]);

  const value = useMemo(() => ({
    empresa, setEmpresa, planta, setPlanta, plantas, temporada, setTemporada, fecha, setFecha,
    toast, notificar, permisoDe, puedeEditar, esAdmin, vista, ir, usuario,
    caps, hasCap,  // AUTHZ (reflejo de UX; autoridad = server-side)
  }), [empresa, planta, plantas, temporada, fecha, toast, notificar, permisoDe, puedeEditar, esAdmin, vista, ir, usuario, caps, hasCap]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useService() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useService fuera de ServiceProvider");
  return c;
}
