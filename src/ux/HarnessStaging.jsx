/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · ENTORNO AISLADO
// ═══════════════════════════════════════════════════════════════════
//
// Monta `PrototipoUX` con datos leídos de STAGING y nada más. No se importa
// desde `App.jsx`: se entra por `?ux=1`, y si las variables no apuntan a
// staging la pantalla no carga nada. Solo lectura: no hay guardado, no hay
// auto-save, no hay escritura de ningún tipo.
//
// El fail-closed es explícito: si la URL contiene la referencia productiva, se
// niega a leer. Un harness de diseño no tiene por qué tocar producción, ni
// siquiera para mirar.

import React, { useEffect, useState } from "react";
import PrototipoUX from "./PrototipoUX";
import { surface, ink, layout, estado } from "./tokens";

const REF_PRODUCCION = "bywovqayuzodbzwsriet";
const URL = process.env.REACT_APP_UX_SUPABASE_URL || "";
const KEY = process.env.REACT_APP_UX_SUPABASE_ANON_KEY || "";

function Aviso({ tono = "critico", titulo, children }) {
  const t = estado[tono] || estado.critico;
  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: 20, background: surface.panel,
                  border: `1px solid ${t.borde}`, borderLeft: `4px solid ${t.borde}`,
                  borderRadius: layout.radio.sm, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 16, color: t.fg }}>{titulo}</h1>
      <div style={{ fontSize: 13, color: ink.soft, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export default function HarnessStaging() {
  const [estadoCarga, setEstadoCarga] = useState("cargando");
  const [datos, setDatos] = useState(null);
  const [detalle, setDetalle] = useState("");

  useEffect(() => {
    if (!URL || !KEY) { setEstadoCarga("sin-config"); return; }
    if (URL.includes(REF_PRODUCCION)) { setEstadoCarga("apunta-a-produccion"); return; }
    let vivo = true;
    fetch(`${URL}/rest/v1/calendario_data?id=eq.osiris&select=value,updated_at`,
          { headers: { apikey: KEY, Authorization: "Bearer " + KEY } })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((filas) => {
        if (!vivo) return;
        const fila = filas && filas[0];
        if (!fila) throw new Error("la fila `osiris` no existe en este proyecto");
        setDatos(fila.value || {});
        setDetalle(`actualizada ${String(fila.updated_at).slice(0, 16).replace("T", " ")}`);
        setEstadoCarga("listo");
      })
      .catch((e) => { if (vivo) { setDetalle(String(e.message)); setEstadoCarga("error"); } });
    return () => { vivo = false; };
  }, []);

  if (estadoCarga === "sin-config")
    return <Aviso titulo="Falta la configuración del entorno aislado">
      Definí <code>REACT_APP_UX_SUPABASE_URL</code> y <code>REACT_APP_UX_SUPABASE_ANON_KEY</code> apuntando a staging.
    </Aviso>;

  if (estadoCarga === "apunta-a-produccion")
    return <Aviso titulo="Configuración apuntada a producción">
      Este harness solo lee staging. No va a cargar nada mientras la URL apunte al proyecto productivo.
    </Aviso>;

  if (estadoCarga === "error")
    return <Aviso titulo="No se pudieron leer los datos de staging">{detalle}</Aviso>;

  if (estadoCarga === "cargando")
    return <Aviso tono="info" titulo="Cargando desde staging">Leyendo la fila <code>osiris</code>…</Aviso>;

  return (
    <div>
      <div style={{ background: estado.info.bg, color: estado.info.fg, fontSize: 12,
                    padding: "5px 14px", fontFamily: "system-ui, sans-serif",
                    borderBottom: `1px solid ${estado.info.borde}` }}>
        Entorno aislado · datos de STAGING, solo lectura · {detalle}
      </div>
      <PrototipoUX datos={datos} usuario="Angelo Huerta" />
    </div>
  );
}
