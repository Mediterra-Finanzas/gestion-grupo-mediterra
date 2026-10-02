/* eslint-disable */
// Pruebas del guardado condicionado de Nóminas — ejecutar: node src/nominasPersistencia.test.mjs
import { fusionarNominas, planGuardado, guardarFila, resumirGuardado, iguales } from './nominasPersistencia.js';

let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const clon = (x) => JSON.parse(JSON.stringify(x));
const it = (id, extra = {}) => ({ id, proveedor: 'Prov ' + id, concepto: 'c', montoUSD: 100, estadoLinea: 'activa', ...extra });
const nom = (id, extra = {}) => ({ id, empresa: 'Osiris', semana: 40, año: 2026, numero: 1, estado: 'borrador', estadoNomina: 'activa', notas: '', tc: 950,
  items: [it(id + '-1'), it(id + '-2')], historial: [{ accion: 'creada', ts: 't0' }], ...extra });
const B = [nom('A'), nom('B')];

// 1. nóminas distintas
let m = clon(B); m[0].notas = 'mía';
let s = clon(B); s[1].notas = 'del otro';
let r = fusionarNominas(B, m, s);
check('1. Nóminas distintas cambiadas por cada lado → se combinan', r.ok && r.valor[0].notas === 'mía' && r.valor[1].notas === 'del otro');
// 2. misma nómina, campos distintos de cabecera
m = clon(B); m[0].notas = 'mía';
s = clon(B); s[0].tc = 960;
r = fusionarNominas(B, m, s);
check('2. Misma nómina, campos de cabecera distintos → se combinan campo a campo', r.ok && r.valor[0].notas === 'mía' && r.valor[0].tc === 960);
// 3. mismo campo, valores distintos
m = clon(B); m[0].tc = 951; s = clon(B); s[0].tc = 952;
r = fusionarNominas(B, m, s);
check('3. Mismo campo con valores distintos → conflicto con los tres valores', !r.ok && r.conflictos.length === 1 && r.conflictos[0].tipo === 'campo' && r.conflictos[0].campo === 'tc'
  && r.conflictos[0].base === 950 && r.conflictos[0].mio === 951 && r.conflictos[0].servidor === 952 && /Osiris S40\/2026 N°1/.test(r.conflictos[0].etiqueta));
// 4. líneas distintas y líneas nuevas en ambos lados
m = clon(B); m[0].items[0].montoUSD = 111; m[0].items.push(it('A-mia'));
s = clon(B); s[0].items[1].montoUSD = 222; s[0].items.push(it('A-otro'));
r = fusionarNominas(B, m, s);
const ids = r.ok ? r.valor[0].items.map((x) => x.id).join() : '';
check('4. Líneas distintas de la misma nómina y líneas nuevas de ambos → se combinan', r.ok && r.valor[0].items[0].montoUSD === 111 && r.valor[0].items[1].montoUSD === 222 && ids === 'A-1,A-2,A-otro,A-mia', ids);
// 5. misma línea
m = clon(B); m[0].items[0].montoUSD = 111; s = clon(B); s[0].items[0].concepto = 'otro';
r = fusionarNominas(B, m, s);
check('5. La misma línea editada por los dos → conflicto de línea (aunque sean campos distintos)', !r.ok && r.conflictos[0].tipo === 'linea' && r.conflictos[0].lineaId === 'A-1');
// 6. transición + otro cambio
m = clon(B); m[0].items[0].montoUSD = 111;
s = clon(B); s[0].estado = 'aprobada'; s[0].aprobadoPor = 'Angelo';
r = fusionarNominas(B, m, s);
check('6. El otro aprobó y yo edité una línea de esa nómina → conflicto de transición', !r.ok && r.conflictos.some((c) => c.tipo === 'transicion' && c.servidor === 'aprobada'));
m = clon(B); m[0].estado = 'preparada'; s = clon(B); s[0].notas = 'nota';
r = fusionarNominas(B, m, s);
check('6b. Yo avancé el estado y el otro cambió notas de esa nómina → conflicto de transición', !r.ok && r.conflictos[0].tipo === 'transicion');
m = clon(B); m[0].estado = 'preparada'; s = clon(B); s[1].notas = 'nota en otra nómina';
r = fusionarNominas(B, m, s);
check('6c. Transición en una nómina y cambio en OTRA nómina → se combinan (independientes)', r.ok && r.valor[0].estado === 'preparada' && r.valor[1].notas === 'nota en otra nómina');
// 7. anulaciones
m = clon(B); m[0].estadoNomina = 'inactiva'; s = clon(B); s[0].notas = 'x';
r = fusionarNominas(B, m, s);
check('7. Anulación de la nómina + otro cambio en ella → conflicto de anulación', !r.ok && r.conflictos[0].tipo === 'anulacion_nomina');
m = clon(B); m[0].items[0].estadoLinea = 'inactiva'; s = clon(B); s[0].items[1].montoUSD = 5;
r = fusionarNominas(B, m, s);
check('7b. Anulación de una línea + el otro editó otra línea de la misma nómina → conflicto de anulación', !r.ok && r.conflictos[0].tipo === 'anulacion_linea' && r.conflictos[0].lineaId === 'A-1');
m = clon(B); m[0].items[0].estadoLinea = 'inactiva'; s = clon(B);
r = fusionarNominas(B, m, s);
check('7c. Anulación sin cambios del otro lado → se aplica', r.ok && r.valor[0].items[0].estadoLinea === 'inactiva');
// 8. historial
m = clon(B); m[0].notas = 'm'; m[0].historial.push({ accion: 'editada', ts: 't1' });
s = clon(B); s[0].tc = 1; s[0].historial.push({ accion: 'editada', ts: 't2' });
r = fusionarNominas(B, m, s);
check('8. Historial: se conservan las entradas de ambos, sin duplicar', r.ok && r.valor[0].historial.map((h) => h.ts).join() === 't0,t2,t1');
// 9. orden de claves distinto no es un cambio
const reordenado = B.map((n) => Object.fromEntries(Object.entries(n).reverse()));
check('9. Igualdad independiente del orden de las claves', iguales(B, reordenado));

// 10. plan de escritura
const filaDe = (e) => 'nominas_' + e.toLowerCase();
const filas = {
  nominas_osiris: { empresa: 'Osiris', estado: 'ok', version: 'v1', base: B },
  nominas_mediterra: { empresa: 'Mediterra', estado: 'ok', version: 'v9', base: [nom('M', { empresa: 'Mediterra' })] },
  nominas_frisku: { empresa: 'Frisku', estado: 'error', error: 'HTTP 500' },
  nominas_integrity: { empresa: 'Integrity', estado: 'inexistente', version: null, base: [] },
};
let locales = [...clon(B), nom('M', { empresa: 'Mediterra' })]; locales[0].notas = 'cambio';
let p = planGuardado(locales, filas, filaDe);
check('10. Solo se escribe la fila que cambió (Osiris), con su versión', p.escrituras.length === 1 && p.escrituras[0].fila === 'nominas_osiris' && p.escrituras[0].version === 'v1' && p.escrituras[0].existe === true);
locales = [...clon(B), nom('M', { empresa: 'Mediterra' }), nom('F', { empresa: 'Frisku' }), nom('I', { empresa: 'Integrity' })];
p = planGuardado(locales, filas, filaDe);
check('10b. Empresa con carga fallida: bloqueada (no se crea ni se guarda); empresa inexistente confirmada: se crea', p.bloqueadas.some((x) => x.fila === 'nominas_frisku' && x.motivo === 'carga_fallida')
  && p.escrituras.some((x) => x.fila === 'nominas_integrity' && x.existe === false));
p = planGuardado([nom('M', { empresa: 'Mediterra' })], filas, filaDe);
check('10c. Una empresa leída con nóminas que localmente quedó vacía NO se escribe vacía', p.bloqueadas.some((x) => x.fila === 'nominas_osiris' && x.motivo === 'quedaria_vacia') && !p.escrituras.length);

// 11. escritura con transporte simulado (servidor en memoria con versiones)
function servidorFalso(inicial) {
  const filas = new Map(Object.entries(inicial));   // fila -> { texto, version }
  let n = 0;
  const t = {
    escrituras: 0, perderRespuesta: false, falloRed: false,
    async leer(fila) { const f = filas.get(fila); return f ? { existe: true, valor: JSON.parse(f.texto), version: f.version } : { existe: false, valor: null, version: null }; },
    async patch(fila, version, texto) {
      if (t.falloRed) throw new Error('sin red');
      const f = filas.get(fila); if (!f || f.version !== version) return { ok: false, motivo: 'conflicto' };
      t.escrituras++; filas.set(fila, { texto, version: 'v' + (++n) });
      if (t.perderRespuesta) { t.perderRespuesta = false; throw new Error('respuesta perdida'); }
      return { ok: true, version: filas.get(fila).version };
    },
    async insertar(fila, texto) { if (filas.has(fila)) return { ok: false, motivo: 'existe', status: 409 }; t.escrituras++; filas.set(fila, { texto, version: 'v' + (++n) }); return { ok: true, version: filas.get(fila).version }; },
    contenido(fila) { const f = filas.get(fila); return f && JSON.parse(f.texto).nominas; },
    escribirComoOtro(fila, nominas) { filas.set(fila, { texto: JSON.stringify({ nominas, empresa: 'Osiris' }), version: 'v' + (++n) }); },
  };
  return t;
}
const T = servidorFalso({ nominas_osiris: { texto: JSON.stringify({ nominas: B, empresa: 'Osiris' }), version: 'v0' } });
// otro guardó la nómina B; yo edito la A con versión vieja
const delOtro = clon(B); delOtro[1].notas = 'otro'; T.escribirComoOtro('nominas_osiris', delOtro);
m = clon(B); m[0].notas = 'mía';
let g = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: m, base: B, version: 'v0', existe: true, transporte: T });
check('11. Conflicto de versión con cambios independientes → relee, combina y guarda (ambos cambios quedan)', g.ok && g.fusionado && T.contenido('nominas_osiris')[0].notas === 'mía' && T.contenido('nominas_osiris')[1].notas === 'otro');
// conflicto real: no escribe
const base2 = T.contenido('nominas_osiris'); const v2 = g.version;
const otro2 = clon(base2); otro2[0].tc = 999; T.escribirComoOtro('nominas_osiris', otro2);
m = clon(base2); m[0].tc = 1;
const esc0 = T.escrituras;
g = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: m, base: base2, version: v2, existe: true, transporte: T });
check('11b. Conflicto real (mismo campo) → NO se escribe; se devuelve el detalle y la versión del servidor', !g.ok && g.motivo === 'conflicto' && g.conflictos[0].campo === 'tc' && T.escrituras === esc0 && T.contenido('nominas_osiris')[0].tc === 999 && g.servidor.version);
// respuesta perdida
const T2 = servidorFalso({ nominas_osiris: { texto: JSON.stringify({ nominas: B, empresa: 'Osiris' }), version: 'v0' } });
m = clon(B); m[0].notas = 'una vez';
T2.perderRespuesta = true;
g = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: m, base: B, version: 'v0', existe: true, transporte: T2 });
check('11c. Respuesta perdida: relee y VERIFICA que el servidor ya tiene lo enviado → guardado, una sola escritura', g.ok && g.yaEstaba && g.verificadoTrasRed && T2.escrituras === 1);
// respuesta perdida y SIN red para verificar → error de red; el reintento no duplica
const T2b = servidorFalso({ nominas_osiris: { texto: JSON.stringify({ nominas: B, empresa: 'Osiris' }), version: 'v0' } });
const leerOrig = T2b.leer; T2b.perderRespuesta = true; T2b.leer = async () => { throw new Error('sin red'); };
g = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: m, base: B, version: 'v0', existe: true, transporte: T2b });
check('11c-2. Respuesta perdida y sin red para verificar → informa error de red (no finge éxito)', !g.ok && g.motivo === 'red' && T2b.escrituras === 1);
T2b.leer = leerOrig;
g = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: m, base: B, version: 'v0', existe: true, transporte: T2b });
check('11d. Reintento tras respuesta perdida: reconoce que ya estaba guardado y NO escribe de nuevo', g.ok && g.yaEstaba && T2b.escrituras === 1);
// sin red desde el inicio (no llegó al servidor)
const T2c = servidorFalso({ nominas_osiris: { texto: JSON.stringify({ nominas: B, empresa: 'Osiris' }), version: 'v0' } });
T2c.falloRed = true;
g = await guardarFila({ fila: 'nominas_osiris', empresa: 'Osiris', mio: m, base: B, version: 'v0', existe: true, transporte: T2c });
check('11d-2. Sin red (la escritura no llegó): relee, ve que NO está → error de red, nada escrito', !g.ok && g.motivo === 'red' && T2c.escrituras === 0);
// creación simultánea
const T3 = servidorFalso({});
const nueva = [nom('X', { empresa: 'Integrity' })];
const otraNueva = [nom('Y', { empresa: 'Integrity' })];
await T3.insertar('nominas_integrity', JSON.stringify({ nominas: otraNueva, empresa: 'Integrity' }));
g = await guardarFila({ fila: 'nominas_integrity', empresa: 'Integrity', mio: nueva, base: [], version: null, existe: false, transporte: T3 });
check('11e. Fila creada por otro al mismo tiempo (409) → relee y combina: quedan ambas nóminas', g.ok && g.fusionado && T3.contenido('nominas_integrity').map((x) => x.id).sort().join() === 'X,Y');
// misma transición en ambos lados (reintento tras respuesta perdida)
m = clon(B); m[0].estado = 'aprobada'; m[0].aprobadoPor = 'Angelo'; m[0].historial.push({ accion: 'avance', estadoHacia: 'aprobada', usuario: 'Angelo', fecha: 'f2' });
s = clon(B); s[0].estado = 'aprobada'; s[0].aprobadoPor = 'Angelo'; s[0].historial.push({ accion: 'avance', estadoHacia: 'aprobada', usuario: 'Angelo', fecha: 'f1' });
r = fusionarNominas(B, m, s);
m[0].ultimaDevolucion = { fecha: 'f2', motivo: 'x' }; s[0].ultimaDevolucion = { fecha: 'f1', motivo: 'x' };
r = fusionarNominas(B, m, s);
check('14b. Misma transición: los campos que la acompañan (ultimaDevolucion, aprobador, fechas) se toman del servidor', r.ok && r.valor[0].ultimaDevolucion.fecha === 'f1');
m[0].notas = 'mía'; s[0].notas = 'del otro';
r = fusionarNominas(B, m, s);
check('14c. Misma transición pero OTRO campo cambiado distinto (notas) → sigue siendo conflicto', !r.ok && r.conflictos[0].campo === 'notas');
m[0].notas = ''; s[0].notas = ''; delete m[0].ultimaDevolucion; delete s[0].ultimaDevolucion;
r = fusionarNominas(B, m, s);
check('14. La misma transición en ambos lados no es conflicto y el historial no se duplica', r.ok && r.valor[0].estado === 'aprobada' && r.valor[0].historial.filter((h) => h.accion === 'avance').length === 1);
// resolución explícita "mantener lo mío"
m = clon(B); m[0].tc = 1; m[0].items[0].montoUSD = 7;
s = clon(B); s[0].tc = 2; s[0].items[0].montoUSD = 8; s[0].notas = 'independiente del otro'; s[1].notas = 'otra nómina';
r = fusionarNominas(B, m, s, { preferir: 'mio' });
check('13. "Mantener lo mío": en los puntos en conflicto prevalece lo local y lo independiente del otro se conserva',
  r.ok && r.valor[0].tc === 1 && r.valor[0].items[0].montoUSD === 7 && r.valor[0].notas === 'independiente del otro' && r.valor[1].notas === 'otra nómina');
m = clon(B); m[0].estado = 'preparada'; s = clon(B); s[0].estado = 'revision'; s[0].revisadoPor = 'Carol';
r = fusionarNominas(B, m, s, { preferir: 'mio' });
check('13b. "Mantener lo mío" con transición: la cabecera va completa desde lo mío (estado y revisor juntos)', r.ok && r.valor[0].estado === 'preparada' && r.valor[0].revisadoPor === undefined);
// resumen
const res = resumirGuardado([{ ok: true, empresa: 'Osiris' }, { ok: false, empresa: 'Mediterra', motivo: 'conflicto', conflictos: [{ tipo: 'campo' }] }], [{ fila: 'nominas_frisku', empresa: 'Frisku', motivo: 'carga_fallida' }]);
check('12. Resumen: prioriza el conflicto y lista guardadas, fallidas y bloqueadas', !res.ok && res.motivo === 'conflicto' && res.empresasGuardadas.join() === 'Osiris' && res.empresasFallidas.join() === 'Mediterra,Frisku' && res.conflictos.length === 1);

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);
