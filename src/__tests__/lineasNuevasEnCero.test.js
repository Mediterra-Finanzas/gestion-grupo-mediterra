/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// LAS LÍNEAS NUEVAS NACEN EN CERO
//
// La publicación técnica no carga datos. Lo que hay que poder afirmar es
// que, sin un solo movimiento nuevo cargado:
//
//   · las dos líneas de flujo nuevas están en CERO en los 63 meses, y
//   · las líneas que ya existían valen EXACTAMENTE lo mismo que antes.
//
// Lo segundo es lo que importa de verdad: que publicar no mueva un número
// que el CFO ya revisó. Se comprueba contra el flujo real de la app
// (calcAllegria / buildEmpresas), con los campos nuevos ausentes, como
// está hoy el dato en producción.
// ═══════════════════════════════════════════════════════════════════
import { calcAllegria, buildEmpresas } from '../FinanzasModule.jsx';
import { MESES } from '../horizonte.js';

const NUEVAS = [
  'Recuperación de anticipos a productores',
  'Devolución de anticipos a clientes',
];

// Parámetros tal como los tiene una temporada guardada ANTES de esta entrega:
// sin `programas`, sin `saldos_favor`, sin `movimientos_sin_asignar`, sin
// `antecedentes`, sin `decisiones_sin_fecha`, y con las estimaciones como
// filas de mes + US$/kg.
const paramsViejos = () => ({ "2026-2027": { cerezas: {
  kg: 500000, fob_usd_kg: 3.2, desc_exp_pct: 5, mat_usd_kg: 0.25, srv_usd_kg: 0.40,
  anticipos_cliente: [
    { id: 'a1', mes: 'Nov-26', usd_kg: 0.5 },
    { id: 'a2', mes: 'Dec-26', usd_kg: 0.8 },
  ],
  mes_liquidacion: 'Mar-27',
  anticipos_productor: [{ id: 'b1', mes: 'Nov-26', usd_kg: 0.4 }],
  mes_saldo_productor: 'Apr-27',
  dist_mat: [{ mes: 'Nov-26', pct: 100 }],
  dist_srv: [{ mes: 'Dec-26', pct: 100 }],
} } });

// Identidad de la línea = categoría + etiqueta (hay etiquetas repetidas
// entre categorías; leer solo por etiqueta devolvería la línea equivocada).
const lineasDe = (params) => {
  const emp = buildEmpresas(params, { cobros: [] })['Allegria Foods'];
  const out = {};
  for (const sec of emp.sections || []) {
    for (const l of sec.lines || []) out[`${sec.cat}::${l.label}`] = l.proy;
  }
  return out;
};

describe('publicar no mueve un número que ya estaba', () => {
  test('las dos líneas nuevas están en cero en los 63 meses', () => {
    const ls = lineasDe(paramsViejos());
    for (const nombre of NUEVAS) {
      const clave = Object.keys(ls).find(k => k.endsWith(`::${nombre}`));
      expect(clave).toBeTruthy();                 // la línea existe
      const proy = ls[clave];
      expect(proy.length).toBe(MESES.length);
      expect(proy.every(v => Math.round(Number(v) || 0) === 0)).toBe(true);
      expect(Math.round(proy.reduce((a, b) => a + (Number(b) || 0), 0))).toBe(0);
    }
  });

  test('el cálculo con los campos nuevos AUSENTES da lo mismo que con ellos vacíos', () => {
    // Es la comparación que vale: el dato de producción no tiene los campos
    // nuevos. Si ausente y vacío no coinciden, publicar movería cifras.
    const sinCampos = paramsViejos();
    const conVacios = paramsViejos();
    Object.assign(conVacios["2026-2027"].cerezas, {
      programas: [], saldos_favor: [], movimientos_sin_asignar: [],
      decisiones_sin_fecha: {}, liq_definitiva_cliente: null,
      liq_definitiva_productor: null,
    });
    expect(lineasDe(conVacios)).toEqual(lineasDe(sinCampos));
  });

  test('las líneas que ya existían conservan su valor propio', () => {
    const ls = lineasDe(paramsViejos());
    const buscar = (cat, n) => ls[`${cat}::${n}`];
    const i = (m) => MESES.indexOf(m);

    // Cobros al cliente, en la línea «Anticipo Cerezas» de ing_op:
    //   Nov-26 = 500.000 kg × 0,5 = 250.000
    //   Dec-26 = 500.000 kg × 0,8 = 400.000
    //   Mar-27 = liquidación = 500.000 × 3,2 − 250.000 − 400.000 = 950.000
    const ant = buscar('ing_op', 'Anticipo Cerezas');
    expect(Math.round(ant[i('Nov-26')])).toBe(250000);
    expect(Math.round(ant[i('Dec-26')])).toBe(400000);
    expect(Math.round(ant[i('Mar-27')])).toBe(1600000 - 250000 - 400000);

    // Pagos al productor, en «Costo Fruta Exportación» de egr_var. Retorno
    // neto = 3,2 × 0,95 − 0,25 − 0,40 = 2,39 US$/kg → 1.195.000 en total.
    //   Nov-26 = 500.000 × 0,4 = 200.000
    //   Apr-27 = 1.195.000 − 200.000 = 995.000
    const costo = buscar('egr_var', 'Costo Fruta Exportación');
    expect(Math.round(costo[i('Nov-26')])).toBe(200000);
    expect(Math.round(costo[i('Apr-27')])).toBe(995000);

    // Materiales y servicios se pagan en sus propias líneas, además de
    // descontarse del precio del productor: no hay duplicación.
    expect(Math.round(buscar('egr_var', 'Materiales')[i('Nov-26')])).toBe(125000);
    expect(Math.round(buscar('egr_var', 'Servicios de Packing')[i('Dec-26')])).toBe(200000);
  });
});
