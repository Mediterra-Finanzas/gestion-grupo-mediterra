/* eslint-disable */
// src/proceso/ui/pages/CentroOperaciones.jsx — primera pantalla operacional real.
// Action-oriented (no dashboard CFO). Consume read-models backend, no calcula en React.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { centroOperaciones, excepcionesOperacionales, cargarServiciosFacturables, cargarBasesCobro } from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcKpiCard, ProcCard, ProcExceptionList, ProcButton,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";
import { formatKg, formatNum, formatFecha, formatFechaHora } from "../format";

const kg = (n) => formatKg(n);

function Grupo({ titulo, children }) {
  return (
    <div style={{ marginBottom: sp.lg }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: sp.sm }}>{titulo}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: sp.md }}>{children}</div>
    </div>
  );
}

export default function CentroOperaciones() {
  const { empresa, planta, temporada, fecha, ir } = useService();
  const [data, setData] = useState(null);
  const [exc, setExc] = useState([]);
  const [com, setCom] = useState(null); // comercial (F7.7): {pendientes, basesAbiertas} | null si no disponible
  const [estado, setEstado] = useState("idle"); // idle|loading|ok|error
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!empresa) { setEstado("idle"); return; }
    setEstado("loading"); setError(null);
    try {
      const args = { empresaId: empresa, plantaId: planta, temporada, fecha };
      const [centro, exceps] = await Promise.all([
        centroOperaciones(args),
        excepcionesOperacionales({ empresaId: empresa, plantaId: planta, temporada }),
      ]);
      // procRpc de jsonb devuelve el objeto; de TABLE devuelve array
      setData(centro && (Array.isArray(centro) ? centro[0] : centro));
      setExc(Array.isArray(exceps) ? exceps : []);
      setEstado("ok");
      // Excepciones comerciales F7.7 (degradación elegante: no rompen el Centro).
      try {
        const [pend, bases] = await Promise.all([
          cargarServiciosFacturables(empresa, "&estado=eq.pendiente_tarifa&limit=500"),
          cargarBasesCobro(empresa, "&estado=in.(borrador,en_revision)&limit=500"),
        ]);
        setCom({ pendientes: (pend || []).length, basesAbiertas: (bases || []).length });
      } catch { setCom(null); }
    } catch (e) {
      setError(traducirError(e)); setEstado("error");
    }
  }, [empresa, planta, temporada, fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  if (!empresa) {
    return (
      <div>
        <ProcPageHeader titulo="Centro de Operaciones" subtitulo="Estado operacional de la planta hoy" />
        <ProcCard style={{ padding: sp.lg }}>
          <ProcEmptyState icono="🏭" titulo="Seleccioná un tenant y una planta"
            detalle="El Centro de Operaciones necesita empresa (tenant) y planta para mostrar la operación. Configuralos en la barra superior." />
        </ProcCard>
      </div>
    );
  }
  if (estado === "loading") return <div><ProcPageHeader titulo="Centro de Operaciones" /><ProcLoadingState /></div>;
  if (estado === "error") return <div><ProcPageHeader titulo="Centro de Operaciones" /><ProcErrorState error={error} onRetry={cargar} /></div>;

  const r = (data && data.recepcion) || {};
  const p = (data && data.produccion) || {};
  const pt = (data && data.producto_terminado) || {};
  const d = (data && data.despacho) || {};

  const irExcepcion = (x) => {
    if (x.tipo === "qc_rechazado") ir("recepcion_detalle", { id: x.referencia_id });
    else if (x.tipo === "conciliacion_pendiente" || x.tipo === "diferencia_masa") ir("orden", { id: x.referencia_id });
    else if (x.tipo === "pallet_bloqueado") ir("bodega");
    else if (x.tipo === "informe_sin_emitir") ir("informes");
    else ir("recepciones");
  };

  return (
    <div>
      <ProcPageHeader titulo="Centro de Operaciones" subtitulo={`Operación del día · ${fecha}`}
        acciones={<>
          <ProcButton onClick={() => ir("recepcion_nueva")}>+ Nueva recepción</ProcButton>
          <ProcButton kind="ghost" onClick={() => ir("lotes")}>Lotes disponibles</ProcButton>
        </>} />

      <Grupo titulo="Recepción">
        <ProcKpiCard label="Recepciones hoy" valor={r.recepciones_dia ?? 0} tono="info" onClick={() => ir("recepciones")} />
        <ProcKpiCard label="Kg recibidos hoy" valor={kg(r.kg_recibido_dia)} tono="info" onClick={() => ir("recepciones")} />
        <ProcKpiCard label="Recepciones pendientes" valor={r.recepciones_pendientes ?? 0} tono="neutral" onClick={() => ir("recepciones", { filtroQc: "" })} />
      </Grupo>

      <Grupo titulo="Producción">
        <ProcKpiCard label="Programa de hoy" valor={p.programa_dia ?? 0} tono="info" onClick={() => ir("programa")} />
        <ProcKpiCard label="Órdenes en proceso" valor={p.ordenes_en_proceso ?? 0} tono="primary" onClick={() => ir("ordenes", { filtroEstado: "en_proceso" })} />
        <ProcKpiCard label="Pend. de conciliación" valor={p.ordenes_pendientes_conciliacion ?? 0} tono="warning" onClick={() => ir("ordenes", { filtroEstado: "pendiente_conciliacion" })} />
        <ProcKpiCard label="Kg procesados hoy" valor={kg(p.kg_procesado_dia)} tono="primary" onClick={() => ir("ordenes")} />
      </Grupo>

      <Grupo titulo="Producto Terminado">
        <ProcKpiCard label="Kg PT disponibles" valor={kg(pt.kg_pt_disponible)} tono="success" onClick={() => ir("pt")} />
        <ProcKpiCard label="Pallets disponibles" valor={pt.pallets_disponibles ?? 0} tono="success" onClick={() => ir("bodega")} />
        <ProcKpiCard label="Pallets reservados" valor={pt.pallets_reservados ?? 0} tono="warning" onClick={() => ir("bodega")} />
        <ProcKpiCard label="Pallets bloqueados" valor={pt.pallets_bloqueados ?? 0} tono="danger" onClick={() => ir("bodega")} />
      </Grupo>

      <Grupo titulo="Despacho">
        <ProcKpiCard label="Preparados" valor={d.preparados ?? 0} tono="info" onClick={() => ir("despachos", { filtroEstado: "listo" })} />
        <ProcKpiCard label="Cargando" valor={d.cargando ?? 0} tono="warning" onClick={() => ir("despachos", { filtroEstado: "cargando" })} />
        <ProcKpiCard label="Despachados hoy" valor={d.despachados_dia ?? 0} tono="success" onClick={() => ir("despachos", { filtroEstado: "despachado" })} />
      </Grupo>

      {com && (
        <Grupo titulo="Comercial">
          <ProcKpiCard label="Pendientes de tarifa" valor={com.pendientes} tono={com.pendientes > 0 ? "warning" : "success"} onClick={() => ir("pendientes")} />
          <ProcKpiCard label="Bases por aprobar" valor={com.basesAbiertas} tono={com.basesAbiertas > 0 ? "info" : "neutral"} onClick={() => ir("bases", { filtroEstado: "borrador" })} />
        </Grupo>
      )}

      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: sp.sm }}>
        Excepciones · acción requerida
      </div>
      <ProcCard style={{ padding: sp.md }}>
        <ProcExceptionList items={exc} onItem={irExcepcion} />
      </ProcCard>
    </div>
  );
}
