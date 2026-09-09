/* Recuperacion en dos tiempos.
 *
 * Tiempo 1 - AISLADO: el lote se abre en una tabla de ensayo. La tabla viva no
 * se toca. Si el lote esta malo, nos enteramos aca.
 * Tiempo 2 - APLICACION SELECTIVA: nunca un UPSERT masivo. Un respaldo del
 * martes aplicado el jueves con upsert borra dos dias de trabajo del equipo.
 * Por eso cada fila se clasifica y solo se escriben las que no compiten. */

export const CLASE = {
  AUSENTE_EN_VIVO: "ausente_en_vivo",   // la fila se perdio -> se restaura
  IGUAL: "igual",                        // nada que hacer
  VIVO_MAS_NUEVO: "vivo_mas_nuevo",      // el equipo escribio despues -> NO se toca
  RESPALDO_MAS_NUEVO: "respaldo_mas_nuevo", // conflicto real -> decision humana
};

export function planificar({ respaldo, vivo }) {
  const porId = new Map(vivo.map((r) => [r.id, r]));
  const plan = [];
  for (const r of respaldo) {
    const v = porId.get(r.id);
    if (!v) { plan.push({ id: r.id, clase: CLASE.AUSENTE_EN_VIVO, accion: "insertar" }); continue; }
    const tr = new Date(r.updated_at).getTime(), tv = new Date(v.updated_at).getTime();
    if (JSON.stringify(v.value) === JSON.stringify(r.value))
      plan.push({ id: r.id, clase: CLASE.IGUAL, accion: "omitir" });
    else if (tv > tr)
      plan.push({ id: r.id, clase: CLASE.VIVO_MAS_NUEVO, accion: "omitir",
                  detalle: "el equipo escribio " + Math.round((tv - tr) / 1000) + " s despues del respaldo" });
    else
      plan.push({ id: r.id, clase: CLASE.RESPALDO_MAS_NUEVO, accion: "requiere_decision" });
  }
  // filas vivas que el respaldo no conoce: son posteriores, jamas se borran
  for (const v of vivo) if (!respaldo.some((r) => r.id === v.id))
    plan.push({ id: v.id, clase: CLASE.VIVO_MAS_NUEVO, accion: "omitir", detalle: "creada despues del respaldo" });
  return plan;
}

export function resumen(plan) {
  const c = {};
  for (const p of plan) c[p.clase] = (c[p.clase] || 0) + 1;
  return { total: plan.length, insertar: plan.filter((p) => p.accion === "insertar").length,
           omitir: plan.filter((p) => p.accion === "omitir").length,
           requiere_decision: plan.filter((p) => p.accion === "requiere_decision").length, clases: c };
}

/* Solo se ejecutan las filas 'insertar'. Las de decision requieren que alguien
 * las liste explicitamente por id: no hay bandera global que las arrastre. */
export async function aplicar({ plan, respaldo, escribirFila, idsForzados = [] }) {
  const forz = new Set(idsForzados);
  const porId = new Map(respaldo.map((r) => [r.id, r]));
  const hecho = [], saltado = [];
  for (const p of plan) {
    const escribible = p.accion === "insertar" || (p.accion === "requiere_decision" && forz.has(p.id));
    if (!escribible) { saltado.push(p); continue; }
    await escribirFila(porId.get(p.id));
    hecho.push(p.id);
  }
  return { escritas: hecho, omitidas: saltado.length };
}
