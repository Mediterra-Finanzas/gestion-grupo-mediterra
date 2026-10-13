// ═══════════════════════════════════════════════════════════════════
// REVISIÓN DE REPARTOS SEMANALES POSIBLEMENTE DUPLICADOS — solo lectura.
//
// La versión publicada 7492ca1 (13-10-2026, 11:38 UTC), al escribir la
// PRIMERA semana de un mes, copiaba el valor del mes a una semana inventada
// y sumaba encima lo escrito:
//   · mes con valor manual M  → { _sem3: M, _semK: escrito }
//   · mes calculado B         → { _sem0: B, _semK: escrito }
// Antes (c9c5792) un clic en una semana vacía guardaba { _semK: 0 } y el mes
// quedaba en 0. Ninguno de los dos casos se puede distinguir con certeza de
// una carga legítima (no hay fecha por reparto), así que esto NO corrige
// nada: lista filas sospechosas con su valor actual y una propuesta con el
// antes y el después, que se aplica solo con aprobación explícita.
//
// `baseDe(empresa, cat, etiqueta, idx)` devuelve el valor CALCULADO del mes
// (sin valores manuales) o null si no se puede saber fuera de la app.
// ═══════════════════════════════════════════════════════════════════
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

export function analizarRepartosSemanales(finanzasReal, baseDe = () => null, meses = []) {
  const filas = [];
  Object.entries(finanzasReal || {}).forEach(([empresa, d]) => {
    Object.entries(d?._proyOverrides || {}).forEach(([clave, porMes]) => {
      if (!porMes || typeof porMes !== "object") return;
      const [cat, etiqueta] = clave.includes("::") ? clave.split("::") : [null, clave];
      Object.entries(porMes).forEach(([k, ov]) => {
        if (!ov || typeof ov !== "object") return;
        const idx = Number(k);
        const sem = [0, 1, 2, 3].map(s => (ov[`_sem${s}`] !== undefined ? Number(ov[`_sem${s}`]) || 0 : null));
        const cargadas = sem.filter(v => v !== null);
        const noCero = sem.map((v, s) => (v ? s : null)).filter(s => s !== null);
        const suma = r2(cargadas.reduce((a, v) => a + v, 0));
        const base = cat ? baseDe(empresa, cat, etiqueta, idx) : null;
        const fila = (tipo, motivo, quitar, despues, accion) => filas.push({
          empresa, clave, cat, etiqueta, idx, mes: meses[idx] || String(idx),
          semanas: sem, suma, baseCalculada: base, tipo, motivo,
          antes: suma, despues: despues === null ? null : r2(despues), quitar, accion,
        });
        if (cargadas.length && noCero.length === 0) {
          fila("mes_en_cero", "Todas las semanas cargadas valen 0: el mes quedó en 0 (posible clic sin escribir, defecto c9c5792).",
            "todo el reparto", base, base === null
              ? "Quitar el reparto devuelve el mes al valor mensual o calculado (no se puede calcular aquí)."
              : "Quitar el reparto devuelve el mes al valor calculado.");
          return;
        }
        if (noCero.length < 2) return;
        if (sem[0] && base !== null && Math.abs(sem[0] - base) < 0.01) {
          fila("semilla_calculada", `S1 = valor calculado del mes (${r2(base)}) y hay otras semanas: firma de 7492ca1.`,
            "_sem0", suma - sem[0], "Quitar S1 deja solo lo escrito por semana.");
          return;
        }
        if (sem[3]) {
          fila("posible_semilla_manual", "S4 con valor y otras semanas: puede ser el valor manual mensual copiado por 7492ca1.",
            "_sem3", suma - sem[3], "Confirmar si S4 era el valor mensual anterior; si lo era, quitar S4.");
          return;
        }
        if (sem[0]) {
          fila("posible_semilla_calculada", base === null
              ? "S1 con valor y otras semanas; el calculado no se puede comprobar fuera de la app."
              : `S1 con valor y otras semanas; hoy el calculado es ${r2(base)} (pudo cambiar después de copiarse).`,
            "_sem0", suma - sem[0], "Comparar S1 con el valor calculado del mes cuando se cargó la semana antes de decidir.");
        }
      });
    });
  });
  return filas;
}
