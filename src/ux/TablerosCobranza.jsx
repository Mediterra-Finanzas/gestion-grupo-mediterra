/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · FACTURACIÓN Y COBRANZA
// ═══════════════════════════════════════════════════════════════════
//
// Cuatro tableros y una bandeja. Reusa `TarjetasKPI` y `TablaDensa` tal como
// están, sin tocarlos: la selección de tablero vive en una fila de pestañas
// propia en vez de meterle un modo "clickeable" a las tarjetas. Los datos salen
// de `cobranza.js`, que lee el blob de Osiris. No hay otra fuente.
//
// "Por facturar" y "Por cobrar" van separados a propósito: son dos trabajos
// distintos. "Información pendiente" es un tablero de primera clase y no una
// nota al pie, porque hoy es donde está casi todo.

import React, { useMemo, useState } from "react";
import { layout, ink, surface, estado as tonos } from "./tokens";
import TarjetasKPI from "./TarjetasKPI";
import TablaDensa from "./TablaDensa";
import { filasCobranza, resumenCobranza, ESTADO, ORIGEN_VENCIMIENTO } from "./cobranza";

const miles = (n) => Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: 0 });

const TABLEROS = [
  { clave: "porFacturar", id: ESTADO.POR_FACTURAR, titulo: "Por facturar",
    pregunta: "¿Qué hitos se cumplieron y todavía no se facturan?",
    fuente: "contratos[].rpPlantaCuotas / contractFee*", severidad: "info" },
  { clave: "porCobrar", id: ESTADO.POR_COBRAR, titulo: "Por cobrar",
    pregunta: "¿Qué está emitido y aún no entra?",
    fuente: "factura con saldo y vencimiento futuro", severidad: "neutro" },
  { clave: "vencido", id: ESTADO.VENCIDO, titulo: "Vencido",
    pregunta: "¿Qué pasó su fecha de pago?",
    fuente: "vencimiento explícito o emisión + plazo documentado", severidad: "critico" },
  { clave: "informacionPendiente", id: ESTADO.INFO_PENDIENTE, titulo: "Información pendiente",
    pregunta: "¿A qué le falta un dato para poder clasificarse?",
    fuente: "sin fecha de vencimiento ni plazo documentado", severidad: "alto" },
  { clave: "conflicto", id: ESTADO.CONFLICTO, titulo: "Dato en conflicto",
    pregunta: "¿Dónde se contradicen el contrato y su registro derivado?",
    fuente: "contractFee* del contrato vs la fila de feeEntrada", severidad: "critico" },
];

const COLUMNAS = [
  { id: "cliente", etiqueta: "Cliente", anchoMax: 180 },
  { id: "contrato", etiqueta: "Contrato", anchoMax: 160 },
  { id: "concepto", etiqueta: "Concepto" },
  { id: "nFact", etiqueta: "Factura", render: (f) => f.nFact || "—" },
  { id: "moneda", etiqueta: "Mon." },
  { id: "saldo", etiqueta: "Saldo", alineacion: "right",
    render: (f) => miles(f.estado === ESTADO.POR_FACTURAR ? f.total : f.saldo) },
  { id: "vencimiento", etiqueta: "Vence",
    render: (f) => f.vencimiento || "Completar vencimiento" },
  { id: "atraso", etiqueta: "Atraso", alineacion: "right",
    render: (f) => (f.atraso != null && f.atraso > 0 ? `${f.atraso} d` : "—") },
  { id: "responsable", etiqueta: "Responsable" },
  { id: "accion", etiqueta: "Acción" },
];

function Pestanas({ opciones, valor, alCambiar }) {
  return (
    <div role="tablist" aria-label="Tablero de cobranza"
         style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {opciones.map((o) => {
        const activo = o.id === valor;
        const t = tonos[o.severidad] || tonos.neutro;
        return (
          <button key={o.id} role="tab" type="button" id={`tab-${o.id}`}
            aria-selected={activo} aria-controls={`panel-${o.id}`}
            tabIndex={activo ? 0 : -1}
            onClick={() => alCambiar(o.id)}
            onKeyDown={(e) => {
              const i = opciones.findIndex((x) => x.id === valor);
              if (e.key === "ArrowRight") alCambiar(opciones[(i + 1) % opciones.length].id);
              if (e.key === "ArrowLeft") alCambiar(opciones[(i - 1 + opciones.length) % opciones.length].id);
            }}
            style={{
              font: "inherit", fontSize: 12, fontWeight: activo ? 700 : 500,
              padding: "5px 11px", cursor: "pointer",
              color: activo ? t.fg : ink.soft,
              background: activo ? t.bg : surface.panel,
              border: `1px solid ${activo ? t.borde : layout.borde}`,
              borderRadius: 999,
            }}>
            {o.titulo} · {o.n}
          </button>
        );
      })}
    </div>
  );
}

export default function TablerosCobranza({
  datos, hoy = new Date(), alAbrirContrato,
  compacta = false, comoTarjetas = false, nombreDensidad,
}) {
  const [foco, setFoco] = useState(ESTADO.VENCIDO);
  const filas = useMemo(() => filasCobranza(datos, hoy), [datos, hoy]);
  const resumen = useMemo(() => resumenCobranza(filas, datos), [filas, datos]);

  const kpis = TABLEROS.map((t) => ({
    id: t.id,
    etiqueta: t.titulo,
    pregunta: t.pregunta,
    valor: String(resumen[t.clave].n),
    // Un cero no dice "no se debe nada". Dice que ninguna fila alcanzada cayo aca.
    detalle: resumen[t.clave].n === 0 ? "ninguna fila alcanzada"
           : resumen[t.clave].monto > 0
             ? "USD " + miles(resumen[t.clave].monto) + (resumen[t.clave].determinable ? "" : " · monto parcial")
             : "saldo no determinable en " + resumen[t.clave].indeterminables + " de " + resumen[t.clave].n,
    fuente: t.fuente,
    // Solo se pinta de alarma lo que ya perdió su fecha; un tablero en cero no
    // debe verse rojo, porque entonces el rojo deja de significar algo.
    severidad: resumen[t.clave].n === 0 ? "neutro" : t.severidad,
  }));

  const opciones = TABLEROS.map((t) => ({ ...t, n: resumen[t.clave].n }));
  const visibles = filas.filter((f) => f.estado === foco);
  const actual = TABLEROS.find((t) => t.id === foco) || TABLEROS[0];

  return (
    <section aria-label="Facturación y cobranza"
             style={{ display: "flex", flexDirection: "column", gap: layout.sp.sm, minWidth: 0 }}>
      <TarjetasKPI kpis={kpis} compacta={compacta} titulo="Facturación y cobranza" />

      {/* Sin esto, un tablero en cero se lee como "no se debe nada". La bandeja
          solo alcanza los contratos que ya generaron un hecho de ingreso. */}
      {!resumen.cobertura.completa && (
        <p style={{ margin: 0, fontSize: 12, color: tonos.alto.fg, background: tonos.alto.bg,
                    border: `1px solid ${tonos.alto.borde}`, padding: layout.sp.sm,
                    borderRadius: layout.radio.sm }}>
          Cobertura parcial: la bandeja alcanza {resumen.cobertura.cubiertos} de{" "}
          {resumen.cobertura.contratos} contratos. Los {resumen.cobertura.sinHecho} restantes no
          tienen ningún registro de ingreso generado y no aparecen en ningún tablero
          {resumen.cobertura.feeEntradaFueraDeAlcance > 0
            ? `, incluyendo USD ${miles(resumen.cobertura.feeEntradaFueraDeAlcance)} de contract fee sin marcar como pagado`
            : ""}. Un cero en estos tableros no significa que no se deba nada.
        </p>
      )}

      <Pestanas opciones={opciones} valor={foco} alCambiar={setFoco} />

      <div role="tabpanel" id={`panel-${foco}`} aria-labelledby={`tab-${foco}`} style={{ minWidth: 0 }}>
        <TablaDensa
          titulo={`${actual.titulo} · ${visibles.length}`}
          columnas={COLUMNAS}
          filas={visibles}
          // Desde cada fila se llega al contrato. Una alerta sin camino al
          // documento obliga a buscarlo a mano, y ahí se pierde el seguimiento.
          alAbrir={(f) => alAbrirContrato && f.contratoId && alAbrirContrato({ tipo: "contrato", id: f.contratoId })}
          columnaTexto="cliente"
          nombreDensidad={nombreDensidad}
          comoTarjetas={comoTarjetas}
          ordenInicial={{ columna: "atraso", direccion: "desc" }}
        />
      </div>

      {foco === ESTADO.CONFLICTO && visibles.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: ink.soft, background: surface.panelAlt,
                    padding: layout.sp.sm, borderRadius: layout.radio.sm }}>
          El contrato y su registro derivado dicen cosas distintas. No se elige uno de los dos:
          la fila queda acá hasta que alguien concilie.
        </p>
      )}

      {foco === ESTADO.INFO_PENDIENTE && visibles.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: ink.soft, background: surface.panelAlt,
                    padding: layout.sp.sm, borderRadius: layout.radio.sm }}>
          Estas filas no se clasifican como vencidas porque les falta la fecha de vencimiento o el
          plazo de pago documentado. No se les asigna un plazo supuesto.
        </p>
      )}
    </section>
  );
}
