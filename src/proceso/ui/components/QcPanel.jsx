/* eslint-disable */
// src/proceso/ui/components/QcPanel.jsx — QC de recepción DINÁMICO.
// Los parámetros vienen de proc_qc_parametro (por especie); NO se hardcodea
// firmeza/brix/etc. Severidad informativo/advertencia/bloqueante. La UI
// pre-valida con evaluarQC; el resultado autoritativo lo fija la RPC registrar_qc.
import React, { useEffect, useState } from "react";
import { useService } from "../hooks/useServiceContext";
import { cargarQcParamsEspecie, registrarQc, cargarQcLotesDeRecepcion } from "../../core/procesoF7DB";
import { evaluarQC, traducirError } from "../../core/procesoF7Domain";
import { ProcButton, ProcStatusBadge, ProcEmptyState, ProcLoadingState, inputStyle } from "./base";
import { C, sp, TONO } from "../estilos";

const tonoSeveridad = (sv) => (sv === "bloqueante" ? "danger" : sv === "advertencia" ? "warning" : "info");

// loteId opcional (T10c-QC): QC por lote; si es null, QC de recepción (header, compat).
export default function QcPanel({ especie, recepcionId, loteId = null, editable, onGuardado }) {
  const { empresa, notificar } = useService();
  const [params, setParams] = useState([]);
  const [valores, setValores] = useState({});
  const [estado, setEstado] = useState("loading");
  const [guardado, setGuardado] = useState(null); // resultado guardado
  const [esFallbackHeader, setEsFallbackHeader] = useState(false);

  useEffect(() => {
    if (!empresa || !especie) { setEstado("idle"); return; }
    setEstado("loading");
    Promise.all([
      cargarQcParamsEspecie(empresa, especie),
      recepcionId ? cargarQcLotesDeRecepcion(empresa, recepcionId) : Promise.resolve([]),
    ]).then(([ps, qc]) => {
      setParams(ps || []);
      const rows = qc || [];
      const propio = rows.find((r) => r.lote_id === loteId) || null;         // QC del scope (lote o header)
      const header = loteId ? (rows.find((r) => !r.lote_id) || null) : null;  // fallback header para un lote
      const use = propio || header;
      if (use) { setValores(use.valores || {}); setGuardado(use.resultado); setEsFallbackHeader(!propio && !!header); }
      else { setValores({}); setGuardado(null); setEsFallbackHeader(false); }
      setEstado("ok");
    }).catch((e) => { notificar(traducirError(e), "error"); setEstado("idle"); });
  }, [empresa, especie, recepcionId, loteId]);

  if (estado === "loading") return <ProcLoadingState texto="Cargando parámetros QC…" />;
  if (!params.length) return <ProcEmptyState icono="🧪" titulo="Sin parámetros QC configurados" detalle={`No hay QC configurado para la especie ${especie || "—"}. Configuralo en Configuración → Parámetros QC.`} />;

  const preview = evaluarQC(params, valores);
  const set = (cod, v) => setValores((x) => ({ ...x, [cod]: v }));

  const registrar = async () => {
    try {
      const res = await registrarQc({ empresaId: empresa, recepcionId, valores, loteId });
      setGuardado(res); setEsFallbackHeader(false);
      notificar(`QC registrado: ${res}`, res === "rechazado" ? "error" : "ok");
      onGuardado && onGuardado(res);
    } catch (e) { notificar(traducirError(e), "error"); }
  };

  return (
    <div>
      {guardado && (
        <div style={{ marginBottom: sp.md, fontSize: 13, color: C.muted }}>
          Resultado guardado: <ProcStatusBadge estado={guardado} />
          {esFallbackHeader && <span style={{ marginLeft: 8, fontSize: 11.5, color: C.muted2 }}>(heredado del QC de la recepción; registrá uno propio para este lote)</span>}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: sp.md }}>
        {params.map((p) => {
          const raw = valores[p.codigo] ?? "";
          const n = Number(raw);
          const fuera = raw !== "" && p.tipo_dato === "numero" &&
            ((p.rango_min != null && n < Number(p.rango_min)) || (p.rango_max != null && n > Number(p.rango_max)));
          const t = TONO[tonoSeveridad(p.severidad)];
          return (
            <div key={p.id} style={{ border: `1px solid ${fuera ? t.color : C.border}`, borderRadius: 8, padding: sp.sm, background: fuera ? t.bg : C.card }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{p.nombre}{p.obligatorio && <span style={{ color: C.danger }}> *</span>}</span>
                <ProcStatusBadge texto={p.severidad} tono={tonoSeveridad(p.severidad)} />
              </div>
              {p.tipo_dato === "booleano" ? (
                <select style={inputStyle} disabled={!editable} value={raw} onChange={(e) => set(p.codigo, e.target.value)}>
                  <option value="">—</option><option value="true">Sí</option><option value="false">No</option>
                </select>
              ) : (
                <input style={inputStyle} disabled={!editable} type={p.tipo_dato === "numero" ? "number" : "text"}
                  value={raw} onChange={(e) => set(p.codigo, e.target.value)}
                  placeholder={p.rango_min != null || p.rango_max != null ? `rango ${p.rango_min ?? "–"}…${p.rango_max ?? "–"}${p.unidad ? " " + p.unidad : ""}` : (p.unidad || "")} />
              )}
              {fuera && <div style={{ fontSize: 11, color: t.color, marginTop: 3, fontWeight: 600 }}>Fuera de rango</div>}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: sp.md, flexWrap: "wrap", gap: sp.sm }}>
        <div style={{ fontSize: 13, color: C.muted }}>
          Resultado (previsualización): <ProcStatusBadge estado={preview.resultado} />
          {preview.bloquea && <span style={{ color: C.danger, marginLeft: 8, fontSize: 12.5, fontWeight: 600 }}>bloquea el proceso</span>}
        </div>
        {editable && <ProcButton onClick={registrar}>Registrar QC</ProcButton>}
      </div>
    </div>
  );
}
