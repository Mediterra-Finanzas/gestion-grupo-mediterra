/* eslint-disable */
// src/anf/anfPersistence.js
// Helpers de persistencia para tablas anf_* (Análisis Financiero).
// Usa REST API de Supabase directamente (misma convención que el resto del proyecto).

const SUPA_URL = 'https://bywovqayuzodbzwsriet.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk';

const HDR = () => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
});
const GET_HDR = () => ({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` });

async function supaGet(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: GET_HDR() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function supaPost(table, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: HDR(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${table} → ${res.status}: ${txt}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function supaPatch(table, filter, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...HDR(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table} → ${res.status}`);
  return res.json();
}

async function supaDelete(table, filter) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: GET_HDR(),
  });
  if (!res.ok) throw new Error(`DELETE ${table} → ${res.status}`);
}

// ── anf_filiales ─────────────────────────────────────────────────────────────

export async function cargarFiliales() {
  const rows = await supaGet('anf_filiales?select=*&activa=eq.true&order=nombre.asc');
  return rows;
}

export async function upsertFilial({ id, nombre, codigo, sistema, moneda, piso_materialidad, descripcion, activa = true }) {
  const body = { nombre, codigo: codigo?.toUpperCase(), sistema, moneda, piso_materialidad: Number(piso_materialidad) || 10, descripcion, activa };
  if (id) {
    return supaPatch('anf_filiales', `id=eq.${id}`, body);
  }
  const res = await fetch(`${SUPA_URL}/rest/v1/anf_filiales`, {
    method: 'POST',
    headers: { ...HDR(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`POST anf_filiales → ${res.status}: ${t}`); }
  return res.json();
}

// ── anf_informes ─────────────────────────────────────────────────────────────

export async function cargarInformes({ filialId, anio } = {}) {
  let q = 'anf_informes?select=*,anf_filiales(codigo,nombre,sistema,moneda)&order=anio.desc,mes.desc';
  if (filialId) q += `&filial_id=eq.${filialId}`;
  if (anio)     q += `&anio=eq.${anio}`;
  return supaGet(q);
}

export async function cargarInforme(filialId, anio, mes) {
  const rows = await supaGet(
    `anf_informes?filial_id=eq.${filialId}&anio=eq.${anio}&mes=eq.${mes}&select=*,anf_filiales(codigo,nombre,sistema,moneda)`
  );
  return rows[0] ?? null;
}

export async function crearInforme({ filialId, anio, mes, temporada, tipoCierre, tipoPromedio, cargadoPor }) {
  const res = await fetch(`${SUPA_URL}/rest/v1/anf_informes`, {
    method: 'POST',
    headers: { ...GET_HDR(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      filial_id:     filialId,
      anio,
      mes,
      temporada,
      tipo_cierre:   tipoCierre  ?? null,
      tipo_promedio: tipoPromedio ?? null,
      cargado_por:   cargadoPor  ?? null,
      estado:        'borrador',
      updated_at:    new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`POST anf_informes → ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function actualizarEstadoInforme(informeId, estado, { aprobadoPor, rechazadoPor, observacion } = {}) {
  const patch = {
    estado,
    updated_at: new Date().toISOString(),
  };
  if (estado === 'aprobado') {
    patch.aprobado_por = aprobadoPor ?? null;
    patch.aprobado_en  = new Date().toISOString();
    patch.observacion  = observacion ?? null;
  } else if (estado === 'rechazado') {
    patch.aprobado_por = null; // limpiar quien aprobó
    patch.aprobado_en  = null;
    // guardar nombre del que rechazó en observacion
    const prefix = rechazadoPor ? `Rechazado por ${rechazadoPor}` : 'Rechazado';
    patch.observacion = observacion ? `${prefix}: ${observacion}` : prefix;
  } else {
    patch.aprobado_por = null;
    patch.aprobado_en  = null;
    patch.observacion  = observacion ?? null;
  }
  return supaPatch('anf_informes', `id=eq.${informeId}`, patch);
}

export async function actualizarTcInforme(informeId, { tipoCierre, tipoPromedio }) {
  return supaPatch('anf_informes', `id=eq.${informeId}`, {
    tipo_cierre:   tipoCierre   ?? null,
    tipo_promedio: tipoPromedio ?? null,
    updated_at:    new Date().toISOString(),
  });
}

// ── anf_saldos_esf ───────────────────────────────────────────────────────────

export async function cargarSaldosEsf(informeId) {
  return supaGet(`anf_saldos_esf?informe_id=eq.${informeId}&order=orden.asc,codigo.asc`);
}

// Inserta o reemplaza todos los saldos ESF de un informe.
// Patrón backup-restore: guarda copia antes de borrar; restaura si el insert falla.
export async function guardarSaldosEsf(informeId, saldos) {
  const backup = await supaGet(`anf_saldos_esf?informe_id=eq.${informeId}&order=orden.asc,codigo.asc`);
  await supaDelete('anf_saldos_esf', `informe_id=eq.${informeId}`);
  if (!saldos.length) return;
  const rows = saldos.map(s => ({ ...s, informe_id: informeId }));
  const res = await fetch(`${SUPA_URL}/rest/v1/anf_saldos_esf`, {
    method: 'POST',
    headers: { ...GET_HDR(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const msg = await res.text();
    if (backup.length) {
      try {
        await fetch(`${SUPA_URL}/rest/v1/anf_saldos_esf`, {
          method: 'POST',
          headers: { ...GET_HDR(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(backup),
        });
      } catch {}
    }
    throw new Error(`Bulk insert anf_saldos_esf → ${res.status}: ${msg}`);
  }
}

// ── anf_movimientos_er ───────────────────────────────────────────────────────

export async function cargarMovimientosEr(informeId) {
  return supaGet(`anf_movimientos_er?informe_id=eq.${informeId}&order=orden.asc,codigo.asc`);
}

export async function guardarMovimientosEr(informeId, movimientos) {
  const backup = await supaGet(`anf_movimientos_er?informe_id=eq.${informeId}&order=orden.asc,codigo.asc`);
  await supaDelete('anf_movimientos_er', `informe_id=eq.${informeId}`);
  if (!movimientos.length) return;
  const rows = movimientos.map(m => ({ ...m, informe_id: informeId }));
  const res = await fetch(`${SUPA_URL}/rest/v1/anf_movimientos_er`, {
    method: 'POST',
    headers: { ...GET_HDR(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const msg = await res.text();
    if (backup.length) {
      try {
        await fetch(`${SUPA_URL}/rest/v1/anf_movimientos_er`, {
          method: 'POST',
          headers: { ...GET_HDR(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(backup),
        });
      } catch {}
    }
    throw new Error(`Bulk insert anf_movimientos_er → ${res.status}: ${msg}`);
  }
}

// ── anf_justificaciones ──────────────────────────────────────────────────────

export async function cargarJustificaciones(informeId) {
  return supaGet(`anf_justificaciones?informe_id=eq.${informeId}&order=codigo.asc`);
}

// Inserta texto_original de narrativas importadas del Excel (no sobreescribe si ya existe texto editado).
export async function importarNarrativas(informeId, narrativas) {
  for (const n of narrativas) {
    if (!n.codigo || !n.texto) continue;
    const exist = await supaGet(
      `anf_justificaciones?informe_id=eq.${informeId}&codigo=eq.${encodeURIComponent(n.codigo)}&tipo_estado=eq.er&select=id,texto`
    );
    if (exist.length) {
      if (exist[0].texto) continue; // ya tiene texto editado → no tocar
      // existe pero sin texto (import fallido previo) → actualizar
      await supaPatch('anf_justificaciones', `id=eq.${exist[0].id}`, { texto_original: n.texto });
      continue;
    }
    await supaPost('anf_justificaciones', {
      informe_id:     informeId,
      codigo:         n.codigo,
      tipo_estado:    'er',
      texto_original: n.texto,
      texto:          null,
    });
  }
}

export async function guardarJustificacion(informeId, codigo, tipoEstado, texto, editadoPor) {
  // upsert via POST con merge-duplicates
  const res = await fetch(`${SUPA_URL}/rest/v1/anf_justificaciones`, {
    method: 'POST',
    headers: HDR(),
    body: JSON.stringify({
      informe_id:  informeId,
      codigo,
      tipo_estado: tipoEstado,
      texto,
      editado_por: editadoPor,
      editado_en:  new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`upsert anf_justificaciones → ${res.status}`);
}

// ── anf_kpis_derivados ───────────────────────────────────────────────────────

export async function cargarKpisDerivaos(informeId) {
  return supaGet(`anf_kpis_derivados?informe_id=eq.${informeId}&order=clave.asc`);
}

export async function guardarKpisDerivaos(informeId, kpis) {
  await supaDelete('anf_kpis_derivados', `informe_id=eq.${informeId}`);
  if (!kpis.length) return;
  const rows = kpis.map(k => ({ ...k, informe_id: informeId, calculado_en: new Date().toISOString() }));
  const res = await fetch(`${SUPA_URL}/rest/v1/anf_kpis_derivados`, {
    method: 'POST',
    headers: { ...GET_HDR(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Bulk insert anf_kpis_derivados → ${res.status}: ${await res.text()}`);
}

// ── anf_kpis_operacionales + anf_metricas_config ─────────────────────────────

export async function cargarMetricasConfig(filialId) {
  return supaGet(`anf_metricas_config?filial_id=eq.${filialId}&activa=eq.true&order=orden.asc`);
}

export async function cargarTodasMetricas(filialId) {
  return supaGet(`anf_metricas_config?filial_id=eq.${filialId}&order=orden.asc`);
}

export async function crearMetrica(filialId, { nombre, unidad, orden }) {
  const res = await fetch(`${SUPA_URL}/rest/v1/anf_metricas_config`, {
    method: 'POST',
    headers: { ...GET_HDR(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ filial_id: filialId, nombre, unidad, orden: orden ?? 0, activa: true }),
  });
  if (!res.ok) throw new Error(`POST anf_metricas_config → ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function actualizarMetrica(metricaId, campos) {
  return supaPatch('anf_metricas_config', `id=eq.${metricaId}`, campos);
}

export async function cargarKpisOp(informeId) {
  return supaGet(
    `anf_kpis_operacionales?informe_id=eq.${informeId}&select=*,anf_metricas_config(nombre,unidad)&order=metrica_id.asc`
  );
}

export async function guardarKpiOp(informeId, metricaId, { valorReal, valorPpto, valorT1, nota, ingresadoPor }) {
  const res = await fetch(`${SUPA_URL}/rest/v1/anf_kpis_operacionales`, {
    method: 'POST',
    headers: HDR(),
    body: JSON.stringify({
      informe_id:   informeId,
      metrica_id:   metricaId,
      valor_real:   valorReal  ?? null,
      valor_ppto:   valorPpto  ?? null,
      valor_t1:     valorT1    ?? null,
      nota:         nota       ?? null,
      ingresado_por: ingresadoPor ?? null,
      ingresado_en: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`upsert anf_kpis_operacionales → ${res.status}`);
}

// ── anf_tipos_cambio ──────────────────────────────────────────────────────────

export async function cargarTc(monedaBase, monedaDest, fecha) {
  // Busca TC más cercano a la fecha (cierre y promedio)
  const rows = await supaGet(
    `anf_tipos_cambio?moneda_base=eq.${monedaBase}&moneda_dest=eq.${monedaDest}&fecha=lte.${fecha}&order=fecha.desc&limit=2`
  );
  return rows; // primer elem = cierre más reciente, segundo = promedio si hay
}

export async function guardarTc({ fecha, monedaBase, monedaDest, tasa, tipo, fuente }) {
  const res = await fetch(`${SUPA_URL}/rest/v1/anf_tipos_cambio`, {
    method: 'POST',
    headers: HDR(),
    body: JSON.stringify({ fecha, moneda_base: monedaBase, moneda_dest: monedaDest, tasa, tipo, fuente }),
  });
  if (!res.ok) throw new Error(`upsert anf_tipos_cambio → ${res.status}`);
}

// ── Función de carga de un informe completo ───────────────────────────────────

export async function cargarInformeCompleto(filialId, anio, mes) {
  const informe = await cargarInforme(filialId, anio, mes);
  if (!informe) return null;
  const [esf, er, justif, kpisDer, kpisOp] = await Promise.all([
    cargarSaldosEsf(informe.id),
    cargarMovimientosEr(informe.id),
    cargarJustificaciones(informe.id),
    cargarKpisDerivaos(informe.id),
    cargarKpisOp(informe.id),
  ]);
  return { informe, esf, er, justif, kpisDer, kpisOp };
}
