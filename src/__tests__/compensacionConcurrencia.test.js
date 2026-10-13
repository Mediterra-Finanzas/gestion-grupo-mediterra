/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// COMPENSACIÓN · saldo del destino tomado del cuadre, validación al
// guardar, y conflicto entre dos sesiones.
//
// Usa el MISMO contrato de persistencia que la app (persistContract,
// PATCH condicionado por updated_at) contra un PostgREST en memoria.
// DATOS SINTÉTICOS. No toca producción.
// ═══════════════════════════════════════════════════════════════════
import { crearPersistencia, construirAvisoDesde, MOTIVOS } from '../persistencia/persistContract.js';
import {
  resumenLado, destinosCompensacion, previaCompensacion, aplicarCompensacion,
  agregarAplicacion, resumenSaldo, normalizarSaldo,
} from '../programas.js';
import { calcAllegria } from '../FinanzasModule.jsx';
import { MESES, mIdx } from '../horizonte.js';

const MES_A = 'Nov-26', MES_LIQ = 'Mar-27';

// ── PostgREST en memoria: GET + PATCH condicionado ────────────────
function servidorFalso(valorInicial) {
  const fila = { id: 'finanzas', value: JSON.stringify(valorInicial), updated_at: '2026-10-01T00:00:00.000Z' };
  const peticiones = [];
  let seqVersion = 0;
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    peticiones.push(`${opts.method || 'GET'} ${u.split('/rest/v1/')[1]}`);
    if ((opts.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => [{ value: fila.value, updated_at: fila.updated_at, id: fila.id }] };
    }
    if (opts.method === 'PATCH') {
      const m = /updated_at=eq\.([^&]+)/.exec(u);
      const ver = m ? decodeURIComponent(m[1]) : null;
      const body = JSON.parse(opts.body);
      if (ver && ver !== fila.updated_at) {
        // la versión ya no existe → 0 filas, igual que PostgREST
        return { ok: true, status: 200, json: async () => [] };
      }
      fila.value = body.value;
      // La versión la asigna el SERVIDOR (v1, v2, …), como en Postgres: no depende del
      // reloj del cliente, así dos escrituras en el mismo milisegundo no comparten versión.
      fila.updated_at = `v${++seqVersion}`;
      return { ok: true, status: 200, json: async () => [{ id: fila.id, updated_at: fila.updated_at }] };
    }
    throw new Error(`método no soportado: ${opts.method}`);
  };
  const escrituras = () => peticiones.filter(p => !p.startsWith('GET')).length;
  return { fila, fetchImpl, peticiones, escrituras, leer: () => JSON.parse(fila.value) };
}

// Productor P cobró 60.000 contra una liquidación definitiva de 50.000:
// excedente real 10.000, reconocido como saldo con una compensación
// RESERVADA contra la operación del productor Q (que debe 40.000).
const blobInicial = () => ({ allegria_params: { '2026-2027': { cerezas: {
  kg: 500000, fob_usd_kg: 1, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [], mes_liquidacion: MES_LIQ,
  anticipos_productor: [], mes_saldo_productor: MES_LIQ, dist_mat: [], dist_srv: [],
  programas: [
    { id: 'pP', lado: 'productor', contraparte: 'P', kilos: 100000,
      presupuesto_asignado: 50000, importe_definitivo: 50000, mes_liquidacion: MES_A,
      cuotas: [{ id: 'cP', mes: MES_A, modalidad: 'monto', monto: 60000, estado: 'vigente',
        realizaciones: [{ id: 'rP', fecha: '2026-08-01', usd: 60000 }] }] },
    { id: 'pQ', lado: 'productor', contraparte: 'Q', kilos: 100000,
      presupuesto_asignado: 40000, importe_definitivo: 40000, mes_liquidacion: MES_A, cuotas: [] },
  ],
  saldos_favor: [{ id: 'sP', lado: 'productor', contraparte: 'P', usd: 10000, estado: 'reconocido',
    programaId: 'pP',
    origen: { tipo: 'liquidacion_individual', programaId: 'pP', base: 50000, realizado: 60000, excedenteReal: 10000 },
    aplicaciones: [{ id: 'apC', tipo: 'compensacion', usd: 10000, estado: 'reservada',
      destino: { programaId: 'pQ', etiqueta: 'Q', mes: MES_A }, historial: [] }] }],
} } } });

const frutaDe = (blob) => blob.allegria_params['2026-2027'].cerezas;
const resumenProductor = (blob) => {
  const f = frutaDe(blob);
  return resumenLado({
    estimaciones: f.anticipos_productor, programas: f.programas, lado: 'productor',
    kgFruta: f.kg, basePresupuesto: f.kg * f.fob_usd_kg, mIdx, mesIdxActual: -1,
    mesLiquidacion: f.mes_saldo_productor, saldosFavor: f.saldos_favor,
    temporada: '2026-2027', fruta: 'cerezas',
  });
};

describe('compensación: destino y saldo salen del cuadre', () => {
  test('el destino se elige de una lista derivada del modelo, con su saldo ya calculado', () => {
    const blob = blobInicial();
    const r = resumenProductor(blob);
    const destinos = destinosCompensacion(r, { excluirProgramaId: 'pP' });
    // Q debe 40.000 (su importe definitivo, sin movimientos) y el bloque el resto.
    const q = destinos.find(d => d.programaId === 'pQ');
    expect(q).toBeTruthy();
    expect(Math.round(q.absorbe)).toBe(40000);     // no se escribe a mano
    expect(q.mes).toBe(MES_A);
    // P, que es el origen del saldo, no se ofrece como destino de sí mismo
    expect(destinos.some(d => d.programaId === 'pP')).toBe(false);
  });

  test('la previa muestra el efecto y el mes del flujo antes de confirmar', () => {
    const blob = blobInicial();
    const r = resumenProductor(blob);
    const d = destinosCompensacion(r, { excluirProgramaId: 'pP' }).find(x => x.programaId === 'pQ');
    // El saldo todavía sin reservar: así es como se ve la previa al crearla.
    const saldoLibre = normalizarSaldo({ ...frutaDe(blob).saldos_favor[0], aplicaciones: [] });
    const pv = previaCompensacion({ saldo: saldoLibre, destino: d, usd: 10000 });
    expect(pv.valido).toBe(true);
    expect(Math.round(pv.aplicado)).toBe(10000);
    expect(Math.round(pv.remanenteDestino)).toBe(30000);
    expect(pv.cambioFlujo[0].mes).toBe(MES_A);
    expect(Math.round(pv.cambioFlujo[0].delta)).toBe(-10000);

    // Con la reserva ya puesta, una segunda compensación no cabe: programar
    // ocupa disponible aunque todavía no resuelva nada.
    const saldoReservado = normalizarSaldo(frutaDe(blob).saldos_favor[0]);
    const pv2 = previaCompensacion({ saldo: saldoReservado, destino: d, usd: 10000 });
    expect(pv2.valido).toBe(false);
    expect(pv2.motivo).toMatch(/disponibles/);
    expect(Math.round(resumenSaldo(saldoReservado).programado)).toBe(10000);
    expect(Math.round(resumenSaldo(saldoReservado).resuelto)).toBe(0);
  });
});

// ── Dos sesiones sobre la misma versión ──────────────────────────────
// El RELOJ queda FIJO en todo el bloque: las dos sesiones estampan el mismo instante
// (fechaAplicacion, historial.ts). Así lo único que distingue los casos es el
// CONTENIDO. Antes la prueba pasaba o fallaba según cayeran o no en el mismo
// milisegundo: con contenido idéntico, el contrato responde (con razón) que lo que
// se quería guardar ya está en el servidor.
const INSTANTE = '2026-10-13T12:00:00.000Z';
const silencio = { info(){}, warn(){}, error(){} };
const dosSesiones = async () => {
  const srv = servidorFalso(blobInicial());
  const sesionA = crearPersistencia({ fetch: srv.fetchImpl, logger: silencio });
  const sesionB = crearPersistencia({ fetch: srv.fetchImpl, logger: silencio });
  const cargaA = await sesionA.load('finanzas');
  const cargaB = await sesionB.load('finanzas');
  expect(cargaA.version).toBe(cargaB.version);
  return { srv, sesionA, sesionB, cargaA, cargaB };
};
const aplicar = (blob, usuario = 'qa') => {
  const f = frutaDe(blob);
  const d = destinosCompensacion(resumenProductor(blob), { excluirProgramaId: 'pP' })
    .find(x => x.programaId === 'pQ');
  const res = aplicarCompensacion(f.saldos_favor[0], 'apC', { saldoDestino: d.absorbe, usuario });
  const copia = JSON.parse(JSON.stringify(blob));
  frutaDe(copia).saldos_favor = [res.saldo];
  return copia;
};
// Otra edición concurrente, distinta de la compensación: cambia el importe de Q.
const otraEdicion = (blob) => {
  const copia = JSON.parse(JSON.stringify(blob));
  frutaDe(copia).programas.find(p => p.id === 'pQ').importe_definitivo = 45000;
  return copia;
};
const aplicacionesEnServidor = (srv) => resumenSaldo(frutaDe(srv.leer()).saldos_favor[0]);

describe('conflicto entre sesiones (reloj fijo: el contenido es la única diferencia)', () => {
  beforeEach(() => { jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(INSTANTE); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('el reloj está fijo: dos aplicaciones iguales producen el MISMO contenido', async () => {
    const { cargaA, cargaB } = await dosSesiones();
    expect(JSON.stringify(aplicar(cargaA.value))).toBe(JSON.stringify(aplicar(cargaB.value)));
    expect(JSON.stringify(aplicar(cargaA.value, 'qa-A'))).not.toBe(JSON.stringify(aplicar(cargaB.value, 'qa-B')));
  });

  test('contenido IDÉNTICO: reintento idempotente, no conflicto, y no se descuenta dos veces', async () => {
    const { srv, sesionA, sesionB, cargaA, cargaB } = await dosSesiones();
    const resA = await sesionA.saveConfirmed('finanzas', aplicar(cargaA.value));
    expect(resA.ok).toBe(true);
    const enServidorTrasA = JSON.stringify(srv.leer());
    const versionTrasA = srv.fila.updated_at;
    // B quiere guardar EXACTAMENTE lo mismo que ya guardó A
    const resB = await sesionB.saveConfirmed('finanzas', aplicar(cargaB.value));
    expect(resB.ok).toBe(true);
    expect(resB.sinCambios).toBe(true);                       // «ya estaba en el servidor»
    expect(resB.motivo).toBeUndefined();
    expect(JSON.stringify(srv.leer())).toBe(enServidorTrasA); // el servidor no cambió
    expect(srv.fila.updated_at).toBe(versionTrasA);           // ni su versión: B no escribió
    expect(srv.escrituras()).toBe(2);                         // el PATCH de A y el rechazado de B
    const s = aplicacionesEnServidor(srv);
    expect(s.aplicaciones.length).toBe(1);
    expect(Math.round(s.resuelto)).toBe(10000);
  });

  test.each([
    ['otra persona aplica la misma compensación', (blob) => aplicar(blob, 'qa-B'), 'qa-A'],
    ['otra edición distinta del mismo blob', otraEdicion, 'qa-A'],
  ])('cambios concurrentes DISTINTOS (%s): conflicto, nada se pisa', async (_n, deB, usuarioA) => {
    const { srv, sesionA, sesionB, cargaA, cargaB } = await dosSesiones();
    const resA = await sesionA.saveConfirmed('finanzas', aplicar(cargaA.value, usuarioA));
    expect(resA.ok).toBe(true);
    expect(construirAvisoDesde('finanzas', resA, 'el Flujo de Caja')).toBeNull();
    const enServidorTrasA = JSON.stringify(srv.leer());

    const resB = await sesionB.saveConfirmed('finanzas', deB(cargaB.value));
    expect(resB.ok).toBe(false);
    expect(resB.motivo).toBe(MOTIVOS.CONFLICTO);
    const aviso = construirAvisoDesde('finanzas', resB, 'el Flujo de Caja');
    expect(aviso.tipo).toBe('conflicto');
    expect(aviso.texto).toMatch(/No se guardó/);
    expect(JSON.stringify(srv.leer())).toBe(enServidorTrasA);   // lo de A intacto

    // Reintentar el mismo estado obsoleto tampoco escribe
    const resB2 = await sesionB.saveConfirmed('finanzas', deB(cargaB.value));
    expect(resB2.ok).toBe(false);
    expect(JSON.stringify(srv.leer())).toBe(enServidorTrasA);

    // El servidor conserva UNA sola aplicación, por 10.000, hecha por A
    const s = aplicacionesEnServidor(srv);
    expect(s.aplicaciones.length).toBe(1);
    expect(Math.round(s.resuelto)).toBe(10000);
    expect(Math.round(s.programado)).toBe(0);
    expect(Math.round(s.disponible)).toBe(0);
    expect(JSON.stringify(frutaDe(srv.leer()).saldos_favor)).toContain(usuarioA);
    expect(frutaDe(srv.leer()).programas.find(p => p.id === 'pQ').importe_definitivo).toBe(40000);

    // Con el estado fresco, volver a aplicarla es imposible
    expect(() => aplicar(srv.leer())).toThrow(/reservada/);

    // El flujo descuenta la compensación UNA sola vez: Q pasa de 40.000 a 30.000
    const costo = calcAllegria(frutaDeParams(srv.leer())).cost.cerezas;
    expect(Math.round(costo[MESES.indexOf(MES_A)])).toBe(30000);
    const costoAntes = calcAllegria(frutaDeParams(blobInicial())).cost.cerezas;
    expect(Math.round(costoAntes.reduce((a, b) => a + b, 0) - costo.reduce((a, b) => a + b, 0))).toBe(10000);
  });
});

function frutaDeParams(blob) { return blob.allegria_params; }
