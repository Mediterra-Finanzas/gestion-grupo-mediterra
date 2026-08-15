/* eslint-disable */
// src/proceso/ui/AllegriaServiceModule.jsx
// Entry del módulo operacional de Allegria Service (capability proc_*).
// UI DELGADA sobre el contrato F1–F6 (consume src/proceso/core). La seguridad
// efectiva es RLS/RPC; estas props solo REFLEJAN permisos. Bounded context
// separado: cero dependencia de Frisku/Foods/exp_*.
import React from "react";
import { ServiceProvider } from "./hooks/useServiceContext";
import ProcShell from "./layout/ProcShell";

export default function AllegriaServiceModule({
  usuarioActual, esAdmin, esSoloConsulta, tabPermisos, empresaId = null, onBack, onLogout,
}) {
  const admin = typeof esAdmin === "function" ? esAdmin(usuarioActual?.nombre) : !!esAdmin;
  // DEV/UAT (F7.8.1-D): prefill del tenant desde env local para la revisión visual.
  // En prod la env var no existe → empresaId sigue null → tenant manual (F7.1).
  const empInicial = empresaId || process.env.REACT_APP_PROC_DEV_EMPRESA || null;
  return (
    <ServiceProvider empresaId={empInicial} tabPermisos={tabPermisos || {}} esAdmin={admin} usuario={usuarioActual}>
      <ProcShell onBack={onBack} onLogout={onLogout} usuario={usuarioActual} />
    </ServiceProvider>
  );
}
