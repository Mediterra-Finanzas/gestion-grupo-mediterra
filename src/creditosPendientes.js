/* eslint-disable */
// Cambios de Créditos que el servidor TODAVÍA NO CONFIRMÓ.
//
// Problema que resuelve: un guardado de Créditos puede quedar en vuelo o fallar
// cuando el módulo ya se cerró (el usuario volvió al Hub). Sin pantalla donde
// avisar, el pago se perdía en silencio y el usuario lo creía registrado.
//
// Cada guardado anota, ANTES de enviarse, qué créditos cambia ({uid, antes,
// despues}). Se borra recién cuando el servidor confirma. Si no confirma (o la
// pestaña se cierra antes), la anotación queda en el navegador (localStorage) y:
//   · la app muestra un aviso persistente (también fuera de Finanzas);
//   · los pagos de esos cambios se marcan "sin confirmar";
//   · al abrir Créditos se compara cada cambio con lo que el servidor tiene:
//       confirmado  → el servidor ya lo tiene igual: la anotación se retira sola;
//       reaplicable → el crédito en el servidor sigue como estaba ANTES: se puede
//                     reintentar tal cual (los pagos llevan clave de origen, no
//                     se duplican);
//       conflicto   → el crédito cambió en el servidor desde entonces: NO se
//                     aplica nada automáticamente; se muestra para revisarlo.
// Nada se descarta sin una decisión explícita.
import { uidCredito, asegurarUids } from './creditos.js';

export const CLAVE_LS = 'mediterra_creditos_sin_confirmar';
export const EVENTO = 'mediterra:creditos-pendientes';

// Valor comparable: sin la valorización en memoria (_tc), claves ordenadas.
function limpio(c) { if (!c || typeof c !== 'object') return c; const { _tc, ...r } = c; return r; }
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}
const igual = (a, b) => canon(limpio(a)) === canon(limpio(b));

// Créditos que cambian entre dos listas (por uid). Un alta tiene antes=null.
export function diffCreditos(anterior, final) {
  const porUid = (l) => { const m = new Map(); asegurarUids(l || []).lista.forEach((c) => m.set(uidCredito(c), c)); return m; };
  const A = porUid(anterior), F = porUid(final), out = [];
  F.forEach((c, uid) => { const a = A.get(uid) || null; if (!a || !igual(a, c)) out.push({ uid, antes: a ? limpio(a) : null, despues: limpio(c) }); });
  return out;
}

// Pagos vigentes que están en `despues` y no en `antes` (lo que se registró).
export function pagosNuevos(cambio) {
  const ids = new Set(((cambio.antes && cambio.antes.pagos) || []).map(p => p.id));
  return ((cambio.despues && cambio.despues.pagos) || []).filter(p => p && !p.anulado && !ids.has(p.id));
}

export function clasificar(cambio, servidor) {
  // El servidor puede no tener `uid` (registros antiguos): se asignan igual que en la app.
  const s = asegurarUids(servidor || []).lista.find((c) => uidCredito(c) === cambio.uid) || null;
  if (s && igual(s, cambio.despues)) return 'confirmado';
  // Un pago con clave de origen que el servidor ya tiene vigente cuenta como confirmado.
  if (s) {
    const nuevos = pagosNuevos(cambio);
    const claves = new Set((s.pagos || []).filter(p => p && !p.anulado && p.origen && p.origen.clave).map(p => p.origen.clave));
    if (nuevos.length && nuevos.every(p => p.origen && p.origen.clave && claves.has(p.origen.clave)) && soloAgregaPagos(cambio)) return 'confirmado';
  }
  if ((cambio.antes === null && !s) || (s && cambio.antes && igual(s, cambio.antes))) return 'reaplicable';
  return 'conflicto';
}
function soloAgregaPagos(cambio) {
  if (!cambio.antes) return false;
  const sinPH = (c) => { const { pagos, historial, ...r } = c || {}; return r; };
  return igual(sinPH(cambio.antes), sinPH(cambio.despues));
}

// ── Almacén (localStorage del navegador; memoria si no está disponible) ──────
export function crearAlmacen(storage) {
  let memoria = [];
  // Con almacenamiento disponible, él es la fuente (otra pestaña/instancia pudo cambiarlo);
  // la memoria solo cubre un navegador sin localStorage.
  const leer = () => { try { if (!storage) return memoria; const t = storage.getItem(CLAVE_LS); return t ? JSON.parse(t) : []; } catch (e) { return memoria; } };
  const escribir = (l) => {
    memoria = l;
    try { if (storage) { if (l.length) storage.setItem(CLAVE_LS, JSON.stringify(l)); else storage.removeItem(CLAVE_LS); } } catch (e) { /* queda en memoria */ }
    try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event(EVENTO)); } catch (e) {}
  };
  return {
    listar: () => leer(),
    registrar(entrada) {
      const id = `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      escribir([...leer(), { id, estado: 'en_vuelo', ts: new Date().toISOString(), ...entrada }]);
      return id;
    },
    confirmar(id) { escribir(leer().filter(e => e.id !== id)); },
    fallar(id, motivo) { escribir(leer().map(e => e.id === id ? { ...e, estado: 'sin_confirmar', motivo: motivo || 'sin confirmación', tsFallo: new Date().toISOString() } : e)); },
    // Al abrir: lo que quedó "en vuelo" de una sesión anterior ya no tiene quién lo
    // espere; pasa a "sin_confirmar" para que se revise.
    marcarHuerfanos(idsVivos) { escribir(leer().map(e => e.estado === 'en_vuelo' && !(idsVivos || new Set()).has(e.id) ? { ...e, estado: 'sin_confirmar', motivo: e.motivo || 'la pestaña o el módulo se cerró antes de la confirmación' } : e)); },
    descartar(id, motivo, usuario) { escribir(leer().filter(e => e.id !== id)); return { id, motivo, usuario, ts: new Date().toISOString() }; },
    // Retira los cambios ya confirmados por el servidor (todas sus partes).
    depurar(servidor) {
      const l = leer().map(e => ({ ...e, cambios: (e.cambios || []).filter(c => clasificar(c, servidor) !== 'confirmado') })).filter(e => e.cambios.length);
      escribir(l); return l;
    },
  };
}

const ls = (() => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (e) { return null; } })();
export const pendientesCreditos = crearAlmacen(ls);

// Ids de pagos que todavía no tienen confirmación del servidor.
export function pagosSinConfirmar(lista) {
  const ids = new Set();
  (lista || pendientesCreditos.listar()).forEach(e => (e.cambios || []).forEach(c => pagosNuevos(c).forEach(p => ids.add(p.id))));
  return ids;
}
