/* eslint-disable */
// MG-003 — tests de dominio de pesajes (node:test nativo, sin node_modules).
// Ejecutar:  node --test src/proceso/core/procesoMg003Domain.test.mjs
// Cubre la INVARIANTE DURA: PESADA ≠ BIN ≠ LOTE, mass balance, 1..N bins,
// neto = bruto − tara, y — lo más importante — que NO hay reparto automático de kg.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kg3, netoPesada, validarPesada, netoBin, validarBins, binMedido,
  conciliarPesadaBins, repartirBins, massBalanceRecepcion, resumenBins, REPARTO_DEFAULT,
} from "./procesoMg003Domain.js";

// ── neto = bruto − tara ──────────────────────────────────────────────────────
test("neto de la pesada = bruto − tara", () => {
  assert.equal(netoPesada({ peso_bruto: 10200, tara: 200 }), 10000);
  assert.equal(netoPesada({ peso_bruto: 500.1, tara: 0.05 }), 500.05);
});

test("validarPesada: neto que no cuadra con bruto − tara se rechaza", () => {
  assert.equal(validarPesada({ peso_bruto: 1000, tara: 100, peso_neto: 900 }).ok, true);
  assert.equal(validarPesada({ peso_bruto: 1000, tara: 100, peso_neto: 950 }).ok, false);
  assert.equal(validarPesada({ peso_bruto: 1000, tara: 100, peso_neto: 1200 }).ok, false, "neto > bruto");
});

test("validarPesada: confirmar exige neto > 0", () => {
  assert.equal(validarPesada({ peso_bruto: 0, tara: 0 }, { confirmar: true }).ok, false);
  assert.equal(validarPesada({ peso_bruto: 500, tara: 20 }, { confirmar: true }).ok, true);
});

// ── 1..N bins (PESADA contiene varios BINS; nunca 1=1) ───────────────────────
test("validarBins: una pesada exige al menos 1 bin", () => {
  assert.equal(validarBins([]).ok, false);
  assert.equal(validarBins([{ n_envases: 1 }]).ok, true);
});

test("una pesada puede tener N bins (N>1) — no se asume 1 pesada = 1 bin", () => {
  const bins = [{ codigo: "B1" }, { codigo: "B2" }, { codigo: "B3" }];
  const v = validarBins(bins);
  assert.equal(v.ok, true);
  assert.equal(v.n, 3);
});

test("validarBins: n_envases <= 0 y neto>bruto se rechazan", () => {
  assert.equal(validarBins([{ n_envases: 0 }]).ok, false);
  assert.equal(validarBins([{ peso_bruto: 100, peso_neto: 120 }]).ok, false);
});

test("netoBin: bruto − tara_envase; null si falta bruto", () => {
  assert.equal(netoBin({ peso_bruto: 420, tara_envase: 20 }), 400);
  assert.equal(netoBin({ tara_envase: 20 }), null);
});

// ── NO AUTO-SPLIT (el corazón de MG-003) ─────────────────────────────────────
test("repartirBins con 'sin_reparto' (default) NO toca los kg de los bins", () => {
  const bins = [{ codigo: "B1" }, { codigo: "B2" }];
  const out = repartirBins({ peso_neto: 1000 }, bins, REPARTO_DEFAULT);
  assert.equal(out[0].peso_neto, undefined, "el bin sigue sin kg (no se inventó 500)");
  assert.equal(out[1].peso_neto, undefined, "no hay reparto 50/50 automático");
});

test("dos bins pesados juntos NO reciben kg automáticamente", () => {
  // Pesada conjunta de 1000 kg con 2 bins sin peso individual → siguen sin peso.
  const pesada = { peso_neto: 1000, n_bins_declarado: 2 };
  const bins = [{ codigo: "B1" }, { codigo: "B2" }];
  const c = conciliarPesadaBins(pesada, bins);
  assert.equal(c.binsSinPeso, 2, "ambos bins quedan sin peso individual");
  assert.equal(c.sumNetoBins, 0, "no se fabricó ningún kg para los bins");
  assert.equal(c.estado, "parcial", "conciliación parcial mientras haya bins sin peso");
});

test("repartirBins SOLO reparte cuando se pide un método explícito", () => {
  const pesada = { peso_neto: 1000 };
  const bins = [{ codigo: "B1", n_envases: 1 }, { codigo: "B2", n_envases: 1 }];
  const out = repartirBins(pesada, bins, "prorrateo_capacidad");
  assert.equal(out[0].peso_neto + out[1].peso_neto, 1000, "el reparto explícito cuadra exacto");
  assert.equal(out[0].origen_peso, "repartido");
  // el original NO fue mutado (repartirBins devuelve copia)
  assert.equal(bins[0].peso_neto, undefined);
});

test("repartirBins 'prorrateo_tara' pondera por tara y cuadra exacto (residuo al último)", () => {
  const pesada = { peso_neto: 300 };
  const bins = [{ tara_envase: 10 }, { tara_envase: 20 }]; // 1:2
  const out = repartirBins(pesada, bins, "prorrateo_tara");
  assert.equal(out[0].peso_neto, 100);
  assert.equal(out[1].peso_neto, 200);
  assert.equal(kg3(out[0].peso_neto + out[1].peso_neto), 300);
});

// ── Mass balance (pesada ↔ bins) ─────────────────────────────────────────────
test("conciliarPesadaBins: bins medidos cuadran con el neto de la pesada", () => {
  const pesada = { peso_neto: 1000, n_bins_declarado: 2 };
  const bins = [{ peso_neto: 600 }, { peso_neto: 400 }];
  const c = conciliarPesadaBins(pesada, bins);
  assert.equal(c.sumNetoBins, 1000);
  assert.equal(c.diferencia, 0);
  assert.equal(c.binsSinPeso, 0);
  assert.equal(c.conteoOk, true);
  assert.equal(c.estado, "cuadra");
  assert.equal(c.ok, true);
});

test("conciliarPesadaBins: descuadre fuera de tolerancia se detecta", () => {
  const pesada = { peso_neto: 1000 };
  const bins = [{ peso_neto: 600 }, { peso_neto: 300 }]; // faltan 100
  const c = conciliarPesadaBins(pesada, bins, 0.5); // tol = 5 kg
  assert.equal(c.diferencia, 100);
  assert.equal(c.estado, "descuadra");
  assert.equal(c.ok, false);
});

test("conciliarPesadaBins: conteo declarado ≠ nº real de bins marca conteoOk=false", () => {
  const pesada = { peso_neto: 1000, n_bins_declarado: 3 };
  const bins = [{ peso_neto: 500 }, { peso_neto: 500 }]; // solo 2
  const c = conciliarPesadaBins(pesada, bins);
  assert.equal(c.conteoOk, false);
  assert.equal(c.ok, false, "aunque la masa cuadre, el conteo no");
});

test("conciliarPesadaBins: bins anulados no cuentan ni suman", () => {
  const pesada = { peso_neto: 500 };
  const bins = [{ peso_neto: 500 }, { peso_neto: 999, estado: "anulado" }];
  const c = conciliarPesadaBins(pesada, bins);
  assert.equal(c.binsTotal, 1);
  assert.equal(c.sumNetoBins, 500);
  assert.equal(c.estado, "cuadra");
});

test("binMedido distingue bins con y sin peso", () => {
  assert.equal(binMedido({ peso_neto: 10 }), true);
  assert.equal(binMedido({ peso_neto: "" }), false);
  assert.equal(binMedido({}), false);
});

// ── Mass balance a nivel de recepción ────────────────────────────────────────
test("massBalanceRecepcion: Σ pesadas vs kg_neto cabecera", () => {
  const pesadas = [{ peso_neto: 6000 }, { peso_neto: 4000 }];
  const mb = massBalanceRecepcion(10000, pesadas);
  assert.equal(mb.sumNetoPesadas, 10000);
  assert.equal(mb.diferencia, 0);
  assert.equal(mb.ok, true);
  // pesada anulada no suma
  const mb2 = massBalanceRecepcion(10000, [...pesadas, { peso_neto: 999, estado: "anulada" }]);
  assert.equal(mb2.sumNetoPesadas, 10000);
});

// ── Resumen de bins (KPIs de totes/envases retornables) ──────────────────────
test("resumenBins cuenta propiedad, condición y asignación a lote", () => {
  const bins = [
    { envase_propiedad: "propio", peso_neto: 100, lote_id: "L1" },
    { envase_propiedad: "terceros", condicion: "dañado" },
    { envase_propiedad: "cliente", peso_neto: 50 },
    { estado: "anulado", envase_propiedad: "propio" },
  ];
  const r = resumenBins(bins);
  assert.equal(r.total, 3, "el anulado no cuenta");
  assert.equal(r.propios, 1);
  assert.equal(r.terceros, 1);
  assert.equal(r.cliente, 1);
  assert.equal(r.dañados, 1);
  assert.equal(r.asignadosLote, 1);
  assert.equal(r.sinPeso, 1);
  assert.equal(r.kgNeto, 150);
});

// ── PESADA ≠ BIN ≠ LOTE: independencia de identidades ────────────────────────
test("un bin puede existir sin lote (lote_id null) — bin ≠ lote", () => {
  const bins = [{ codigo: "B1", peso_neto: 100 }]; // sin lote_id
  const r = resumenBins(bins);
  assert.equal(r.asignadosLote, 0, "el bin no está atado a un lote todavía");
  assert.equal(r.total, 1);
});
