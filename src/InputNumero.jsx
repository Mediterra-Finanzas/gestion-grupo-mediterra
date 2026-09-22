/* eslint-disable */
/* ─────────────────────────────────────────────────────────────────────────
   CAMPO NUMÉRICO ESCRIBIBLE

   Reemplaza a `<input type="number">`, que en el navegador rechaza el
   separador de miles (no se puede escribir "250.000") y, combinado con el
   patrón `parseFloat(e.target.value)||0` en cada tecla, impide borrar el
   contenido: siempre queda un 0 pegado adelante.

   Acá se escribe libre mientras el campo tiene el foco y el valor se
   interpreta al salir (blur, Enter o al apretar un botón). Escape descarta
   lo tecleado y deja el valor anterior.

   Dos formatos, para que el punto no sea ambiguo:

     formato="monto"  → el punto es MILES y la coma decimal.
                        "250.000" = 250000 · "250.000,5" = 250000,5
                        Al salir del campo se muestra "250.000".
     formato="tasa"   → no hay miles; punto y coma son decimal.
                        "0.125" = 0,125 · "0,125" = 0,125
                        Para US$/kg, porcentajes y tasas de interés.
     formato="entero" → sin decimales (años, cantidades).

   Si lo escrito no se puede interpretar, NO se avisa con un error: se
   descarta y el campo vuelve al valor que tenía. Un número a medias nunca
   se guarda.
   ───────────────────────────────────────────────────────────────────────── */
import React, { useState } from "react";

/** Texto → número. Devuelve NaN si no es interpretable, null si está vacío. */
export function parseNumero(txt, formato = "monto") {
  if (txt === null || txt === undefined) return null;
  let s = String(txt).trim().replace(/\s|\$|%/g, "");
  if (!s) return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  if (!s) return null;
  if (formato === "monto") {
    s = s.replace(/\./g, "");        // puntos = miles, se eliminan
    s = s.replace(/,/g, ".");        // coma = decimal
  } else {
    s = s.replace(/,/g, ".");        // tasa/entero: ambos son decimal
  }
  if (!/^\d*\.?\d*$/.test(s) || s === "." ) return NaN;
  const n = parseFloat(s);
  if (!isFinite(n)) return NaN;
  return neg ? -n : n;
}

/** Número → texto para mostrar cuando el campo NO está en edición. */
export function formatNumero(n, formato = "monto", decimales) {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (!isFinite(num)) return "";
  if (formato === "entero") return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(num);
  if (formato === "tasa") {
    // Sin separador de miles: son tarifas y porcentajes, no montos.
    const d = decimales == null ? 4 : decimales;
    return String(Number(num.toFixed(d))).replace(".", ",");
  }
  return new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales == null ? 2 : decimales,
  }).format(num);
}

/** Texto con el que se entra a editar: el valor crudo, sin separador de miles. */
export function textoDeEdicion(value, formato = "monto") {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (!isFinite(num)) return "";
  return String(num).replace(".", ",");
}

export default function InputNumero({
  value,
  onChange,
  formato = "monto",
  decimales,
  vacio = 0,            // qué se entrega cuando el campo queda en blanco
  style,
  placeholder,
  disabled = false,
  title,
  ...rest
}) {
  // `txt` distinto de null ⇒ el campo está en edición y manda lo tecleado.
  const [txt, setTxt] = useState(null);
  const editando = txt !== null;
  const mostrado = editando ? txt : formatNumero(value, formato, decimales);

  const confirmar = () => {
    if (txt === null) return;
    const n = parseNumero(txt, formato);
    setTxt(null);
    if (n === null) { if (onChange) onChange(vacio); return; }
    if (Number.isNaN(n)) return;                       // ilegible: se descarta
    if (onChange) onChange(formato === "entero" ? Math.round(n) : n);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={mostrado}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      style={style}
      onFocus={() => setTxt(textoDeEdicion(value, formato))}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") { confirmar(); e.currentTarget.blur(); }
        if (e.key === "Escape") { setTxt(null); e.currentTarget.blur(); }
      }}
      {...rest}
    />
  );
}
