/* eslint-disable */
// src/proceso/ui/pages/ProximaFase.jsx — estado honesto para secciones cuyo
// flujo se implementa en F7.2+. NO son mocks con datos falsos: informan qué fase
// las entrega y que el contrato backend ya está validado.
import React from "react";
import { ProcPageHeader, ProcCard, ProcEmptyState } from "../components/base";
import { C, sp } from "../estilos";

export default function ProximaFase({ titulo, fase, detalle }) {
  return (
    <div>
      <ProcPageHeader titulo={titulo} />
      <ProcCard style={{ padding: sp.lg }}>
        <ProcEmptyState icono="🧭" titulo={`Se implementa en ${fase}`}
          detalle={detalle || "El contrato backend (tablas/RPC/vistas) ya está validado (F1–F6). La pantalla operacional llega en esta fase."} />
        <div style={{ textAlign: "center", color: C.muted2, fontSize: 12 }}>
          Mientras tanto, el resumen operacional de esta área se ve en el Centro de Operaciones.
        </div>
      </ProcCard>
    </div>
  );
}
