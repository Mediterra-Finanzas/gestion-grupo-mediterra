/* eslint-disable */
// src/proceso/ui/pages/CentroOperaciones.jsx — primera pantalla operacional real.
// Action-oriented (no dashboard CFO). Consume read-models backend, no calcula en React.
import React, { useEffect, useState, useCallback } from "react";
import { useService } from "../hooks/useServiceContext";
import { centroOperaciones, excepcionesOperacionales } from "../../core/procesoF7DB";
import { traducirError } from "../../core/procesoF7Domain";
import {
  ProcPageHeader, ProcKpiCard, ProcCard, ProcExceptionList,
  ProcLoadingState, ProcErrorState, ProcEmptyState,
} from "../components/base";
import { C, sp } from "../estilos";

const kg = (n) => `${Number(n || 0).toLocaleString("es-CL")} kg`;

function Grupo({ titulo, children }) {
  return (
    <div style={{ marginBottom: sp.lg }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: sp.sm }}>{titulo}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: sp.md }}>{children}</div>
    </div>
  );
}

export default function CentroOperaciones() {
  const { empresa, planta, temporada, fecha } = useService();
  const [data, setData] = useState(null);
  const [exc, setExc] = useState([]);
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

  return (
    <div>
      <ProcPageHeader titulo="Centro de Operaciones" subtitulo={`Operación del día · ${fecha}`} />

      <Grupo titulo="Recepción">
        <ProcKpiCard label="Recepciones hoy" valor={r.recepciones_dia ?? 0} tono="info" />
        <ProcKpiCard label="Kg recibidos hoy" valor={kg(r.kg_recibido_dia)} tono="info" />
        <ProcKpiCard label="Recepciones pendientes" valor={r.recepciones_pendientes ?? 0} tono="neutral" />
      </Grupo>

      <Grupo titulo="Producción">
        <ProcKpiCard label="Programa de hoy" valor={p.programa_dia ?? 0} tono="info" />
        <ProcKpiCard label="Órdenes en proceso" valor={p.ordenes_en_proceso ?? 0} tono="primary" />
        <ProcKpiCard label="Pend. de conciliación" valor={p.ordenes_pendientes_conciliacion ?? 0} tono="warning" />
        <ProcKpiCard label="Kg procesados hoy" valor={kg(p.kg_procesado_dia)} tono="primary" />
      </Grupo>

      <Grupo titulo="Producto Terminado">
        <ProcKpiCard label="Kg PT disponibles" valor={kg(pt.kg_pt_disponible)} tono="success" />
        <ProcKpiCard label="Pallets disponibles" valor={pt.pallets_disponibles ?? 0} tono="success" />
        <ProcKpiCard label="Pallets reservados" valor={pt.pallets_reservados ?? 0} tono="warning" />
        <ProcKpiCard label="Pallets bloqueados" valor={pt.pallets_bloqueados ?? 0} tono="danger" />
      </Grupo>

      <Grupo titulo="Despacho">
        <ProcKpiCard label="Preparados" valor={d.preparados ?? 0} tono="info" />
        <ProcKpiCard label="Cargando" valor={d.cargando ?? 0} tono="warning" />
        <ProcKpiCard label="Despachados hoy" valor={d.despachados_dia ?? 0} tono="success" />
      </Grupo>

      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: sp.sm }}>
        Excepciones · acción requerida
      </div>
      <ProcCard style={{ padding: sp.md }}>
        <ProcExceptionList items={exc} />
      </ProcCard>
    </div>
  );
}
