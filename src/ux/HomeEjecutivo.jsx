/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · HOME
// ═══════════════════════════════════════════════════════════════════
//
// ANTES: al entrar, el hub muestra un saludo ("Buenas tardes, Angelo"), la
// fecha, y siete tiles gigantes. Cero información de negocio. Para saber si
// hay algo que atender hay que entrar a un módulo, elegir una pestaña y leer
// una tabla. La primera pantalla no responde ninguna pregunta.
//
// DESPUÉS: la primera pantalla responde tres, en este orden:
//   1. ¿Cómo vamos?            → KPIs con la pregunta escrita
//   2. ¿Qué requiere mi decisión? → alertas accionables, ordenadas por
//                                   severidad, con el verbo y el porqué
//   3. ¿Dónde está X?          → búsqueda transversal + tabla densa
//
// El saludo se queda, en una línea, porque ubica temporada y fecha —dato de
// negocio en una empresa con temporada Julio–Junio— pero deja de ser el
// protagonista.

import React, { useMemo, useState, useCallback } from "react";
import { surface, ink, layout } from "./tokens";
import { useResponsive } from "./useResponsive";
import {
  kpisEjecutivos,
  alertasAccionables,
  construirIndice,
  filasContratos,
  ficha360,
  temporadaDe,
} from "./selectores";
import TarjetasKPI from "./TarjetasKPI";
import PanelAlertas from "./PanelAlertas";
import TablaDensa from "./TablaDensa";
import Ficha360 from "./Ficha360";
import BusquedaGlobal from "./BusquedaGlobal";
import TablerosCobranza from "./TablerosCobranza";

const COLUMNAS_CONTRATOS = [
  { id: "cliente", etiqueta: "Cliente", anchoMax: 200 },
  { id: "pais", etiqueta: "País" },
  { id: "tipo", etiqueta: "Tipo" },
  { id: "fechaContrato", etiqueta: "Firma", formato: "texto" },
  {
    id: "diasParaVencer",
    etiqueta: "Vence en",
    alineacion: "right",
    render: (f) =>
      f.diasParaVencer == null
        ? "sin término"
        : f.diasParaVencer < 0
        ? `vencido ${Math.abs(f.diasParaVencer)} d`
        : `${f.diasParaVencer} d`,
  },
  { id: "contractFee", etiqueta: "Contract fee", formato: "moneda", alineacion: "right" },
  { id: "royaltyPlanta", etiqueta: "R. planta", formato: "moneda", alineacion: "right" },
  { id: "royaltyComercial", etiqueta: "R. comercial", formato: "moneda", alineacion: "right" },
  { id: "plantas", etiqueta: "Plantas", formato: "conteo", alineacion: "right" },
  { id: "hectareas", etiqueta: "Ha", formato: "numero", alineacion: "right" },
  { id: "firmado", etiqueta: "Firmado", render: (f) => (f.firmado ? "Sí" : "No") },
];

export default function HomeEjecutivo({ datos, usuario = "", hoy = new Date() }) {
  const bp = useResponsive();
  const [seleccion, setSeleccion] = useState(null);

  const kpis = useMemo(() => kpisEjecutivos(datos, hoy), [datos, hoy]);
  const alertas = useMemo(() => alertasAccionables(datos, hoy), [datos, hoy]);
  const indice = useMemo(() => construirIndice(datos), [datos]);
  const filas = useMemo(() => filasContratos(datos, hoy), [datos, hoy]);

  const ficha = useMemo(
    () => (seleccion ? ficha360(datos, seleccion.tipo, seleccion.id) : null),
    [datos, seleccion]
  );

  const abrir = useCallback((ref) => {
    if (!ref) return;
    setSeleccion({ tipo: ref.tipo, id: ref.id });
  }, []);

  const dosColumnas = bp.esEscritorio;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: layout.sp.md, minWidth: 0 }}>
      {/* Barra de contexto y búsqueda. Una línea, no un bloque de 90 px. */}
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: layout.sp.md,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: ink.strong, lineHeight: 1.2 }}>
            Osiris Plant Management
          </h1>
          <p style={{ margin: "1px 0 0", fontSize: 12, color: ink.soft }}>
            {usuario ? `${usuario} · ` : ""}Temporada {temporadaDe(hoy)} ·{" "}
            {hoy.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <div style={{ flex: 1, minWidth: 200, display: "flex", justifyContent: "flex-end" }}>
          <BusquedaGlobal indice={indice} alElegir={abrir} />
        </div>
      </header>

      <TarjetasKPI kpis={kpis} compacta={!bp.esEscritorio} titulo="Indicadores del negocio" />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: dosColumnas ? "minmax(0, 1fr) 340px" : "minmax(0, 1fr)",
          gap: layout.sp.md,
          alignItems: "start",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: layout.sp.md, minWidth: 0 }}>
          {/* La plata primero: por facturar, por cobrar, vencido y lo que no se
              puede clasificar todavia. Despues las alertas de contrato. */}
          <TablerosCobranza
            datos={datos}
            hoy={hoy}
            alAbrirContrato={abrir}
            compacta={!bp.esEscritorio}
            comoTarjetas={bp.tablaComoTarjetas}
            nombreDensidad={bp.nombreDensidad}
          />
          <PanelAlertas alertas={alertas} alAbrirEntidad={abrir} maximo={bp.esMovil ? 6 : 12} />
          <TablaDensa
            titulo="Contratos"
            columnas={COLUMNAS_CONTRATOS}
            filas={filas}
            alAbrir={(f) => abrir({ tipo: "contrato", id: f.id })}
            columnaTexto="cliente"
            nombreDensidad={bp.nombreDensidad}
            comoTarjetas={bp.tablaComoTarjetas}
            ordenInicial={{ columna: "diasParaVencer", direccion: "asc" }}
          />
        </div>
        <Ficha360
          ficha={ficha}
          alCerrar={() => setSeleccion(null)}
          alNavegar={abrir}
          comoColumna={dosColumnas}
        />
      </div>
    </div>
  );
}
