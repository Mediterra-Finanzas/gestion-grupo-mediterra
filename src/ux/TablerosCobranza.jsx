/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · COBERTURA DE CONTRATOS Y COBRANZA
// ═══════════════════════════════════════════════════════════════════
//
// La bandeja parte de los CONTRATOS, no de los hechos persistidos: se evalúan
// todos, con o sin hecho de ingreso, y ninguno desaparece. Reusa `TarjetasKPI`
// y `TablaDensa` sin tocarlos.
//
// Tres cantidades que no se mezclan: contratos evaluados, líneas de concepto y
// cuotas. Los importes son CONTRACTUALES: "pendiente de conciliación" no es
// deuda ni facturación exigible confirmada, y la pantalla lo dice.

import React, { useMemo, useState } from "react";
import { layout, ink, surface, estado as tonos } from "./tokens";
import TarjetasKPI from "./TarjetasKPI";
import TablaDensa from "./TablaDensa";
import { evaluarContratos, CLASE, ETIQUETA } from "./coberturaContratos";

const miles = (n) => Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: 0 });

const TABLEROS = [
  { id: CLASE.CONFLICTO, pregunta: "¿Dónde se contradicen dos registros del mismo hecho?", severidad: "critico",
    fuente: "contrato vs registro persistido de Fee Entrada" },
  { id: CLASE.PENDIENTE_CONFIRMADO, pregunta: "¿Qué tiene factura emitida y ningún pago registrado?", severidad: "alto",
    fuente: "número de factura presente, sin pago" },
  { id: CLASE.INFO_PENDIENTE, pregunta: "¿Qué no se puede clasificar por falta de un dato?", severidad: "info",
    fuente: "sin factura, sin fecha de evento o sin mes de cobro" },
  { id: CLASE.CERRADO_CON_EVIDENCIA, pregunta: "¿Qué tiene factura y pago registrados?", severidad: "ok",
    fuente: "factura y pago en el registro fuente" },
  { id: CLASE.NO_APLICABLE, pregunta: "¿Qué contratos no generan ningún concepto todavía?", severidad: "neutro",
    fuente: "sin contract fee, plantaciones ni base comercial" },
];

const abrev = { [CLASE.CONFLICTO]: "Conflicto", [CLASE.PENDIENTE_CONFIRMADO]: "Pend. confirmado",
                [CLASE.INFO_PENDIENTE]: "Info. pendiente", [CLASE.CERRADO_CON_EVIDENCIA]: "Cerrado",
                [CLASE.NO_APLICABLE]: "No aplica" };

const COLUMNAS = [
  { id: "cliente", etiqueta: "Cliente", anchoMax: 190 },
  { id: "firmado", etiqueta: "Firmado", render: (f) => (f.firmado ? "Sí" : "No") },
  { id: "claseEtiqueta", etiqueta: "Estado" },
  { id: "cf", etiqueta: "Contract fee", render: (f) => abrev[f.cf.clase] + (f.cf.importe ? " · " + miles(f.cf.importe) : "") },
  { id: "rp", etiqueta: "Royalty planta", render: (f) => abrev[f.rp.clase] + (f.rp.cuotas ? ` · ${f.rp.cuotas} cuotas` : "") },
  { id: "rc", etiqueta: "Royalty comercial", render: (f) => abrev[f.rc.clase] },
  { id: "responsableTxt", etiqueta: "Responsable" },
  { id: "accion", etiqueta: "Acción" },
];

function accionDe(c) {
  if (c.clase === CLASE.CONFLICTO) return "Conciliar registros";
  if (!c.responsable && c.clase !== CLASE.CERRADO_CON_EVIDENCIA && c.clase !== CLASE.NO_APLICABLE) return "Asignar responsable";
  if (c.clase === CLASE.PENDIENTE_CONFIRMADO) return "Seguimiento de cobro";
  if (c.clase === CLASE.INFO_PENDIENTE) return "Completar información";
  return "—";
}

function Pestanas({ opciones, valor, alCambiar }) {
  return (
    <div role="tablist" aria-label="Estado de los contratos" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {opciones.map((o) => {
        const activo = o.id === valor;
        const t = tonos[o.severidad] || tonos.neutro;
        return (
          <button key={o.id} role="tab" type="button" id={`tab-${o.id}`} aria-selected={activo}
            aria-controls={`panel-${o.id}`} tabIndex={activo ? 0 : -1} onClick={() => alCambiar(o.id)}
            onKeyDown={(e) => {
              const i = opciones.findIndex((x) => x.id === valor);
              if (e.key === "ArrowRight") alCambiar(opciones[(i + 1) % opciones.length].id);
              if (e.key === "ArrowLeft") alCambiar(opciones[(i - 1 + opciones.length) % opciones.length].id);
            }}
            style={{ font: "inherit", fontSize: 12, fontWeight: activo ? 700 : 500, padding: "5px 11px", cursor: "pointer",
                     color: activo ? t.fg : ink.soft, background: activo ? t.bg : surface.panel,
                     border: `1px solid ${activo ? t.borde : layout.borde}`, borderRadius: 999 }}>
            {ETIQUETA[o.id]} · {o.n}
          </button>
        );
      })}
    </div>
  );
}

export default function TablerosCobranza({ datos, alAbrirContrato, compacta = false, comoTarjetas = false, nombreDensidad }) {
  const ev = useMemo(() => evaluarContratos(datos), [datos]);
  const [foco, setFoco] = useState(ev.porClase[CLASE.CONFLICTO] ? CLASE.CONFLICTO : CLASE.PENDIENTE_CONFIRMADO);

  const filas = useMemo(() => ev.contratos.map((c) => ({
    id: c.contratoId, contratoId: c.contratoId, cliente: c.cliente, firmado: c.firmado,
    clase: c.clase, claseEtiqueta: ETIQUETA[c.clase],
    cf: c.conceptos[0], rp: c.conceptos[1], rc: c.conceptos[2],
    responsable: c.responsable, responsableTxt: c.responsable || "Sin asignar",
    accion: accionDe(c),
  })), [ev]);

  const kpis = TABLEROS.map((t) => ({
    id: t.id, etiqueta: ETIQUETA[t.id], pregunta: t.pregunta, fuente: t.fuente,
    valor: String(ev.porClase[t.id]),
    detalle: `contratos de ${ev.conteos.contratosEvaluados}`,
    severidad: ev.porClase[t.id] === 0 ? "neutro" : t.severidad,
  }));
  const visibles = filas.filter((f) => f.clase === foco);
  const sinResponsable = filas.filter((f) => f.accion === "Asignar responsable").length;
  const cf = ev.contractFee;

  return (
    <section aria-label="Cobertura de contratos y cobranza"
             style={{ display: "flex", flexDirection: "column", gap: layout.sp.sm, minWidth: 0 }}>
      <TarjetasKPI kpis={kpis} compacta={compacta} titulo="Cobertura de contratos" />

      <p style={{ margin: 0, fontSize: 12, color: ink.soft, lineHeight: 1.6 }}>
        {ev.conteos.contratosEvaluados} contratos evaluados · {ev.conteos.lineasDeConcepto} líneas de concepto ·{" "}
        {ev.conteos.cuotasRoyaltyPlanta} cuotas de royalty planta · {ev.conteos.hechosPersistidos} hechos de ingreso persistidos.
      </p>

      {/* Importes contractuales, rotulados por lo que son. */}
      <p style={{ margin: 0, fontSize: 12, color: tonos.alto.fg, background: tonos.alto.bg, border: `1px solid ${tonos.alto.borde}`,
                  padding: layout.sp.sm, borderRadius: layout.radio.sm, lineHeight: 1.6 }}>
        Contract fee, importes contractuales: USD {miles(cf.pendienteDeConciliacion)} pendiente de conciliación ·
        USD {miles(cf.pendienteConfirmado)} con factura y sin pago registrado · USD {miles(cf.enConflicto)} en conflicto ·
        USD {miles(cf.cerradoConEvidencia)} cerrado con evidencia. Ninguna cifra es deuda confirmada ni facturación exigible.
      </p>

      {sinResponsable > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: ink.soft, background: surface.panelAlt, padding: layout.sp.sm, borderRadius: layout.radio.sm }}>
          Tarea de configuración: {sinResponsable} contratos con pendientes no tienen responsable interno asignado.
          Quedan visibles aquí y fuera de los correos por responsable.
        </p>
      )}

      <Pestanas opciones={TABLEROS.map((t) => ({ ...t, n: ev.porClase[t.id] }))} valor={foco} alCambiar={setFoco} />

      <div role="tabpanel" id={`panel-${foco}`} aria-labelledby={`tab-${foco}`} style={{ minWidth: 0 }}>
        <TablaDensa
          titulo={`${ETIQUETA[foco]} · ${visibles.length}`}
          columnas={COLUMNAS}
          filas={visibles}
          alAbrir={(f) => alAbrirContrato && alAbrirContrato({ tipo: "contrato", id: f.contratoId })}
          columnaTexto="cliente"
          nombreDensidad={nombreDensidad}
          comoTarjetas={comoTarjetas}
          ordenInicial={{ columna: "cliente", direccion: "asc" }}
        />
      </div>

      {foco === CLASE.CONFLICTO && visibles.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: ink.soft, background: surface.panelAlt, padding: layout.sp.sm, borderRadius: layout.radio.sm }}>
          Dos registros del mismo hecho dicen cosas distintas. No se elige uno: el contrato queda aquí, fuera de los correos
          de facturación y cobranza, hasta que alguien concilie.
        </p>
      )}
    </section>
  );
}
