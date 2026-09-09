/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · TABLA DENSA
// ═══════════════════════════════════════════════════════════════════
//
// ANTES: las tablas del módulo usan `<div>` con `display:grid` de hasta siete
// columnas, `fontSize:10` en los inputs y una regla global que fuerza
// `white-space:nowrap` en toda celda (OsirisModule.jsx:10155). En un teléfono
// eso es scroll horizontal con texto cortado; en un lector de pantalla no hay
// relación fila–encabezado, porque no hay tabla.
//
// DESPUÉS: `<table>` real. La densidad se mantiene —28 px de fila, 12 px de
// tipografía, números tabulares— porque en una app financiera ver muchas
// filas de una vez ES la funcionalidad. Lo que cambia es que ahora la
// densidad es una decisión (`densidad.compacta`) y no un accidente.
//
// Accesibilidad concreta:
//   · `<caption>` con el nombre de la tabla y el total de filas.
//   · `<th scope="col">` y `aria-sort` en la columna ordenada.
//   · El orden se cambia con un `<button>` dentro del `th`, no con onClick en
//     el `th` (que no es focuseable ni anunciable).
//   · La fila se abre desde un botón en la primera celda, así que se llega
//     con Tab. Nada de `onClick` en el `<tr>`, que deja fuera al teclado.
//   · En teléfono la tabla se convierte en lista de tarjetas con pares
//     etiqueta/valor, en vez de obligar a un scroll lateral.

import React, { useState, useMemo } from "react";
import { surface, ink, estado, layout, densidad as DENS, anilloFoco, soloLector } from "./tokens";
import { ordenarFilas, formatearValor } from "./selectores";
import { useFoco } from "./Primitivos";

function BotonOrden({ col, orden, alOrdenar }) {
  const { enfocado, propsFoco } = useFoco();
  const activo = orden.columna === col.id;
  const dir = activo ? orden.direccion : null;
  return (
    <button
      type="button"
      onClick={() => alOrdenar(col.id)}
      style={{
        all: "unset",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        cursor: "pointer",
        fontFamily: layout.font,
        fontSize: 11,
        fontWeight: 700,
        color: ink.soft,
        textTransform: "uppercase",
        letterSpacing: 0.3,
        borderRadius: 3,
        boxShadow: enfocado ? anilloFoco.claro : "none",
      }}
      {...propsFoco}
    >
      {col.etiqueta}
      <span aria-hidden="true" style={{ fontSize: 9, opacity: activo ? 1 : 0.35 }}>
        {dir === "desc" ? "▼" : "▲"}
      </span>
      <span style={soloLector}>
        {activo
          ? `, ordenado ${dir === "desc" ? "descendente" : "ascendente"}, activar para invertir`
          : ", activar para ordenar"}
      </span>
    </button>
  );
}

function CeldaAbrir({ fila, alAbrir, columnaTexto }) {
  const { enfocado, propsFoco } = useFoco();
  const texto = fila[columnaTexto];
  if (!alAbrir) return <span style={{ fontWeight: 600 }}>{texto}</span>;
  return (
    <button
      type="button"
      onClick={() => alAbrir(fila)}
      style={{
        all: "unset",
        cursor: "pointer",
        fontFamily: layout.font,
        fontSize: "inherit",
        fontWeight: 600,
        color: surface.rail,
        textDecoration: "underline",
        textUnderlineOffset: 2,
        borderRadius: 3,
        boxShadow: enfocado ? anilloFoco.claro : "none",
      }}
      {...propsFoco}
    >
      {texto}
      <span style={soloLector}> · abrir ficha</span>
    </button>
  );
}

export default function TablaDensa({
  titulo,
  columnas = [],
  filas = [],
  alAbrir,
  columnaTexto = "cliente",
  ordenInicial = { columna: null, direccion: "asc" },
  nombreDensidad = "compacta",
  comoTarjetas = false,
  severidadPorFila = (f) => f.severidad,
}) {
  const [orden, setOrden] = useState(ordenInicial);
  const d = DENS[nombreDensidad] || DENS.compacta;

  const ordenadas = useMemo(
    () => (orden.columna ? ordenarFilas(filas, orden.columna, orden.direccion) : filas),
    [filas, orden]
  );

  const alOrdenar = (colId) =>
    setOrden((o) =>
      o.columna === colId
        ? { columna: colId, direccion: o.direccion === "asc" ? "desc" : "asc" }
        : { columna: colId, direccion: "asc" }
    );

  // ── Móvil: lista de tarjetas ─────────────────────────────────────
  if (comoTarjetas) {
    return (
      <section aria-label={titulo}>
        <p style={{ margin: "0 0 6px", fontSize: 11, color: ink.soft }}>
          {titulo} · {ordenadas.length} filas
        </p>
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {ordenadas.map((f) => {
            const sev = estado[severidadPorFila(f)] || estado.neutro;
            return (
              <li
                key={f.id}
                style={{
                  background: surface.panel,
                  border: `1px solid ${layout.borde}`,
                  borderLeft: `3px solid ${sev.borde}`,
                  borderRadius: layout.radio.sm,
                  padding: "8px 10px",
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>
                  <CeldaAbrir fila={f} alAbrir={alAbrir} columnaTexto={columnaTexto} />
                </div>
                <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px" }}>
                  {columnas
                    .filter((c) => c.id !== columnaTexto)
                    .map((c) => (
                      <React.Fragment key={c.id}>
                        <dt style={{ fontSize: 11, color: ink.soft }}>{c.etiqueta}</dt>
                        <dd style={{ margin: 0, fontSize: 12, color: ink.strong, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {c.render ? c.render(f) : formatearValor(f[c.id], c.formato)}
                        </dd>
                      </React.Fragment>
                    ))}
                </dl>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  // ── Escritorio / tablet: tabla ───────────────────────────────────
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${layout.borde}`, borderRadius: layout.radio.md, background: surface.panel }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: layout.font,
          fontSize: d.fuente,
          color: ink.strong,
        }}
      >
        <caption style={soloLector}>
          {titulo} · {ordenadas.length} filas
          {orden.columna ? `, ordenada por ${orden.columna} ${orden.direccion}` : ""}
        </caption>
        <thead>
          <tr style={{ background: surface.panelAlt }}>
            {columnas.map((c) => (
              <th
                key={c.id}
                scope="col"
                aria-sort={
                  orden.columna === c.id
                    ? orden.direccion === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                style={{
                  textAlign: c.alineacion || "left",
                  padding: `${d.celdaY}px ${d.celdaX}px`,
                  height: d.cabecera,
                  borderBottom: `1px solid ${layout.bordeFuerte}`,
                  whiteSpace: "nowrap",
                  position: "sticky",
                  top: 0,
                  background: surface.panelAlt,
                }}
              >
                <BotonOrden col={c} orden={orden} alOrdenar={alOrdenar} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f, i) => {
            const sev = estado[severidadPorFila(f)] || estado.neutro;
            return (
              <tr
                key={f.id}
                style={{
                  background: i % 2 ? surface.rowAlt : surface.panel,
                  height: d.fila,
                }}
              >
                {columnas.map((c, j) => (
                  <td
                    key={c.id}
                    style={{
                      padding: `${d.celdaY}px ${d.celdaX}px`,
                      textAlign: c.alineacion || "left",
                      borderBottom: `1px solid ${layout.borde}`,
                      borderLeft: j === 0 ? `3px solid ${sev.borde}` : "none",
                      whiteSpace: c.envolver ? "normal" : "nowrap",
                      fontVariantNumeric: c.alineacion === "right" ? "tabular-nums" : "normal",
                      maxWidth: c.anchoMax || undefined,
                      overflow: c.anchoMax ? "hidden" : undefined,
                      textOverflow: c.anchoMax ? "ellipsis" : undefined,
                    }}
                  >
                    {c.id === columnaTexto ? (
                      <CeldaAbrir fila={f} alAbrir={alAbrir} columnaTexto={columnaTexto} />
                    ) : c.render ? (
                      c.render(f)
                    ) : (
                      formatearValor(f[c.id], c.formato)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {ordenadas.length === 0 && (
        <p style={{ margin: 0, padding: "16px 12px", fontSize: 12, color: ink.soft, textAlign: "center" }}>
          No hay filas que mostrar.
        </p>
      )}
    </div>
  );
}
