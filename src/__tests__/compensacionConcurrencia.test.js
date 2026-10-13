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

// ── Reloj controlado ──────────────────────────────────────────────
// aplicarCompensacion y el contrato de persistencia sellan con la hora
// actual. Con el reloj real, si las dos sesiones caían en el MISMO
// milisegundo armaban exactamente el mismo valor y el resultado de B
// dependía del azar del reloj. Acá cada paso ocurre en un instante fijado.
const RealDate = Date;
let ahoraMs = null;
class RelojControlado extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(ahoraMs ?? RealDate.now()); }
  static now() { return ahoraMs ?? RealDate.now(); }
}
const fijarReloj = (iso) => { ahoraMs = RealDate.parse(iso); };
beforeEach(() => { global.Date = RelojControlado; ahoraMs = null; });
afterEach(() => { global.Date = RealDate; ahoraMs = null; });

// ── PostgREST en memoria: GET + PATCH condicionado ────────────────
function servidorFalso(valorInicial) {
  const fila = { id: 'finanzas', value: JSON.stringify(valorInicial), updated_at: '2026-10-01T00:00:00.000Z' };
  const peticiones = [];
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
      fila.updated_at = body.updated_at || new Date().toISOString();
      return { ok: true, status: 200, json: async () => [{ id: fila.id, updated_at: fila.updated_at }] };
    }
    throw new Error(`método no soportado: ${opts.method}`);
  };
  return { fila, fetchImpl, peticiones, leer: () => JSON.parse(fila.value) };
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

describe('conflicto entre sesiones', () => {
  test('la segunda sesión no sobrescribe ni vuelve a descontar', async () => {
    const srv = servidorFalso(blobInicial());
    const sesionA = crearPersistencia({ fetch: srv.fetchImpl, logger: { info(){}, warn(){}, error(){} } });
    const sesionB = crearPersistencia({ fetch: srv.fetchImpl, logger: { info(){}, warn(){}, error(){} } });

    // Las dos cargan la MISMA versión
    const cargaA = await sesionA.load('finanzas');
    const cargaB = await sesionB.load('finanzas');
    expect(cargaA.version).toBe(cargaB.version);

    const aplicar = (blob) => {
      const f = frutaDe(blob);
      const d = destinosCompensacion(resumenProductor(blob), { excluirProgramaId: 'pP' })
        .find(x => x.programaId === 'pQ');
      const res = aplicarCompensacion(f.saldos_favor[0], 'apC', { saldoDestino: d.absorbe, usuario: 'qa' });
      const copia = JSON.parse(JSON.stringify(blob));
      frutaDe(copia).saldos_favor = [res.saldo];
      return copia;
    };

    // Sesión A aplica y guarda: confirmado
    fijarReloj('2026-10-13T12:00:00.000Z');
    const resA = await sesionA.saveConfirmed('finanzas', aplicar(cargaA.value));
    expect(resA.ok).toBe(true);
    expect(construirAvisoDesde('finanzas', resA, 'el Flujo de Caja')).toBeNull();

    // Sesión B aplica sobre su copia VIEJA un segundo después y guarda:
    // rechazado, no se pisa
    fijarReloj('2026-10-13T12:00:01.000Z');
    const resB = await sesionB.saveConfirmed('finanzas', aplicar(cargaB.value));
    expect(resB.ok).toBe(false);
    expect(resB.motivo).toBe(MOTIVOS.CONFLICTO);
    const aviso = construirAvisoDesde('finanzas', resB, 'el Flujo de Caja');
    expect(aviso.tipo).toBe('conflicto');
    expect(aviso.texto).toMatch(/No se guardó/);

    // El servidor conserva UNA sola aplicación aplicada, por 10.000
    const enServidor = srv.leer();
    const saldoSrv = resumenSaldo(frutaDe(enServidor).saldos_favor[0]);
    expect(saldoSrv.aplicaciones.length).toBe(1);
    expect(Math.round(saldoSrv.resuelto)).toBe(10000);
    expect(Math.round(saldoSrv.programado)).toBe(0);
    expect(Math.round(saldoSrv.disponible)).toBe(0);

    // Y con el estado fresco, volver a aplicarla es imposible
    expect(() => aplicar(enServidor)).toThrow(/reservada/);

    // El flujo descuenta la compensación UNA sola vez: Q pasa de 40.000 a 30.000
    const costo = calcAllegria(frutaDeParams(enServidor)).cost.cerezas;
    expect(Math.round(costo[MESES.indexOf(MES_A)])).toBe(30000);
    // y el total del lado baja 10.000 respecto del bruto (sin compensar)
    const costoAntes = calcAllegria(frutaDeParams(blobInicial())).cost.cerezas;
    expect(Math.round(costoAntes.reduce((a, b) => a + b, 0) - costo.reduce((a, b) => a + b, 0))).toBe(10000);
  });
});

describe('conflicto entre sesiones · mismo instante (la causa de la prueba inestable)', () => {
  test('si B arma EXACTAMENTE lo que ya guardó A, no hay segunda escritura ni doble descuento', async () => {
    const srv = servidorFalso(blobInicial());
    const sesionA = crearPersistencia({ fetch: srv.fetchImpl, logger: { info(){}, warn(){}, error(){} } });
    const sesionB = crearPersistencia({ fetch: srv.fetchImpl, logger: { info(){}, warn(){}, error(){} } });
    const cargaA = await sesionA.load('finanzas');
    const cargaB = await sesionB.load('finanzas');
    const aplicar = (blob) => {
      const f = frutaDe(blob);
      const d = destinosCompensacion(resumenProductor(blob), { excluirProgramaId: 'pP' })
        .find(x => x.programaId === 'pQ');
      const res = aplicarCompensacion(f.saldos_favor[0], 'apC', { saldoDestino: d.absorbe, usuario: 'qa' });
      const copia = JSON.parse(JSON.stringify(blob));
      frutaDe(copia).saldos_favor = [res.saldo];
      return copia;
    };
    // Las dos operaciones en el MISMO milisegundo y con el mismo usuario.
    fijarReloj('2026-10-13T12:00:00.000Z');
    const valorA = aplicar(cargaA.value);
    const valorB = aplicar(cargaB.value);
    expect(JSON.stringify(valorB)).toBe(JSON.stringify(valorA));
    const resA = await sesionA.saveConfirmed('finanzas', valorA);
    expect(resA.ok).toBe(true);
    const patchesAntes = srv.peticiones.filter(x => x.startsWith('PATCH')).length;
    const resB = await sesionB.saveConfirmed('finanzas', valorB);
    // Resultado DETERMINISTA: el servidor ya tiene ese mismo valor.
    const patchesB = srv.peticiones.filter(x => x.startsWith('PATCH')).length - patchesAntes;
    const saldoSrv = resumenSaldo(frutaDe(srv.leer()).saldos_favor[0]);
    expect(saldoSrv.aplicaciones.length).toBe(1);
    expect(Math.round(saldoSrv.resuelto)).toBe(10000);
    // Lo que el contrato devuelve en este caso queda fijado (no al azar del reloj).
    // B intenta UN PATCH condicionado, el servidor lo rechaza (otra versión) y el
    // contrato comprueba que lo vigente ya es exactamente su valor: lo confirma
    // sin escribir encima. Esto es lo que antes ocurría "a veces".
    expect(patchesB).toBe(1);
    expect(resB.ok).toBe(true);
    expect(JSON.stringify(srv.leer())).toBe(JSON.stringify(valorA));
  });
});

function frutaDeParams(blob) { return blob.allegria_params; }
