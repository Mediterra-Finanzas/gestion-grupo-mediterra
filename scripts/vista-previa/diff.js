/* ─────────────────────────────────────────────────────────────────────────
   VISTA PREVIA — Comparación RESPALDO ORIGINAL vs COPIA DE TRABAJO.

   Se usa en el navegador (window.VPDiff) y en Node (require) para las pruebas.
   No escribe nada: recibe el respaldo original (formato "Mediterra Hub Backup
   v1": { tablas: { id: { data, updated_at } } }) y el store de trabajo de la
   vista previa ({ id: { value, updated_at } }) y devuelve:

     · operaciones: cambios de Créditos expresados como operaciones atómicas
       e idempotentes (agregar_pago, anular_pago, agregar_saldo_informado…),
       cada una con su identificador estable y su "antes" para comprobar,
       al aplicarlas en producción, que nadie cambió ese dato después del
       respaldo. NO es una copia del blob completo.
     · detalle: lista plana (ámbito, fila, ruta, antes, después) para revisar.

   Filas ignoradas: pins (credenciales; en la vista previa se reemplazan por la
   de prueba), backup_* y audit_log (bitácora de la propia sesión de prueba).
   ───────────────────────────────────────────────────────────────────────── */
(function (raiz) {
  var IGNORAR = /^(pins|backup_.*|audit_log)$/;

  function parse(v) {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch (e) { return v; }
  }
  function igual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function clon(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  // Mismo algoritmo que asegurarUids (src/creditos.js): uid = `cr-${n}-${índice}`
  // para los registros antiguos sin uid. Así un crédito del respaldo se reconoce
  // en la copia de trabajo aunque la app le haya asignado el uid al guardar.
  function conUids(lista) {
    var vistos = {};
    return (Array.isArray(lista) ? lista : []).map(function (c, i) {
      if (!c || typeof c !== 'object') return c;
      var uid = c.uid;
      if (!uid || vistos[uid]) uid = 'cr-' + (c.n != null ? c.n : 'x') + '-' + i;
      var base = uid, k = 0;
      while (vistos[uid]) uid = base + '-' + (++k);
      vistos[uid] = true;
      return { c: c, uid: uid, uidGuardado: !!c.uid, indice: i };
    });
  }
  // Huella para reconocer el crédito en producción si allá aún no tiene uid.
  function huella(c) {
    return { n: c.n, empresa: c.empresa, acreedor: c.acreedor, moneda: c.moneda || 'USD', monto: c.monto,
      f_venc: c.f_venc || c.vencimiento_final || null, cuota: c.cuota != null ? c.cuota : null, tipo_credito: c.tipo_credito || '' };
  }
  function etiqueta(c) { return (c.empresa || '') + ' · ' + (c.acreedor || '') + (c.n != null ? ' (n ' + c.n + ')' : ''); }

  // Diferencias genéricas (para el detalle legible).
  function rutas(a, b, ruta, out, max) {
    if (out.length >= max) return;
    if (igual(a, b)) return;
    var objA = a && typeof a === 'object', objB = b && typeof b === 'object';
    if (objA && objB && Array.isArray(a) === Array.isArray(b)) {
      var claves = {}; Object.keys(a).forEach(function (k) { claves[k] = 1; }); Object.keys(b).forEach(function (k) { claves[k] = 1; });
      Object.keys(claves).forEach(function (k) { rutas(a[k], b[k], ruta ? ruta + '.' + k : k, out, max); });
      return;
    }
    out.push({ ruta: ruta || '(fila completa)', antes: a, despues: b });
  }

  function porId(arr) { var m = {}; (arr || []).forEach(function (x) { if (x && x.id != null) m[x.id] = x; }); return m; }

  // Operaciones sobre un arreglo de registros con id (pagos, conciliaciones, …).
  function opsArreglo(antes, despues, nombre, ctx, ops) {
    var A = porId(antes), D = porId(despues);
    Object.keys(D).forEach(function (id) {
      var d = D[id], a = A[id];
      if (!a) { ops.push(Object.assign({ op: 'agregar_' + nombre, id: id, registro: clon(d) }, ctx)); return; }
      if (igual(a, d)) return;
      if (!a.anulado && d.anulado) {
        ops.push(Object.assign({ op: 'anular_' + nombre, id: id, motivo: d.motivoAnulacion || '', anuladoPor: d.anuladoPor || '',
          anuladoTs: d.anuladoTs || '', antes: clon(a), despues: clon(d) }, ctx));
        return;
      }
      ops.push(Object.assign({ op: 'modificar_' + nombre, id: id, antes: clon(a), despues: clon(d) }, ctx));
    });
    Object.keys(A).forEach(function (id) {
      if (!D[id]) ops.push(Object.assign({ op: 'QUITADO_' + nombre, id: id, antes: clon(A[id]), alerta: 'Un registro desapareció de la copia de trabajo: la app nunca borra; revisar.' }, ctx));
    });
  }

  var CAMPOS_ARREGLO = { pagos: 'pago', prepagos: 'prepago', conciliaciones: 'conciliacion' };

  function opsCreditos(antesLista, despuesLista) {
    var ops = [];
    var A = {}, D = {};
    conUids(antesLista).forEach(function (x) { if (x) A[x.uid] = x; });
    conUids(despuesLista).forEach(function (x) { if (x) D[x.uid] = x; });
    Object.keys(D).forEach(function (uid) {
      var d = D[uid].c, xa = A[uid];
      if (!xa) { ops.push({ op: 'agregar_credito', credito: uid, etiqueta: etiqueta(d), registro: clon(d) }); return; }
      var a = xa.c;
      var ctx = { credito: uid, uidEnRespaldo: xa.uidGuardado, huella: huella(a), etiqueta: etiqueta(a) };
      Object.keys(CAMPOS_ARREGLO).forEach(function (k) { opsArreglo(a[k], d[k], CAMPOS_ARREGLO[k], ctx, ops); });
      // historial: solo se agrega al final (bitácora)
      var ha = a.historial || [], hd = d.historial || [];
      if (hd.length > ha.length && igual(ha, hd.slice(0, ha.length)))
        hd.slice(ha.length).forEach(function (h) { ops.push(Object.assign({ op: 'agregar_historial', registro: clon(h) }, ctx)); });
      else if (!igual(ha, hd)) ops.push(Object.assign({ op: 'modificar_historial', antes: clon(ha), despues: clon(hd), alerta: 'El historial cambió en algo distinto de agregar al final.' }, ctx));
      // demás campos (desglose, control_desde, anulado, condiciones…)
      var campos = {};
      Object.keys(a).forEach(function (k) { campos[k] = 1; }); Object.keys(d).forEach(function (k) { campos[k] = 1; });
      Object.keys(campos).forEach(function (k) {
        if (CAMPOS_ARREGLO[k] || k === 'historial' || k === 'uid') return;
        if (!igual(a[k], d[k])) ops.push(Object.assign({ op: 'cambiar_campo', campo: k, antes: clon(a[k]), despues: clon(d[k]) }, ctx));
      });
    });
    Object.keys(A).forEach(function (uid) {
      if (!D[uid]) ops.push({ op: 'QUITADO_credito', credito: uid, etiqueta: etiqueta(A[uid].c), alerta: 'Un crédito desapareció de la copia de trabajo: la app nunca borra créditos; revisar.' });
    });
    return ops;
  }

  // finanzas_real: solo lo que toca Créditos (coberturas, resoluciones, valores manuales de las líneas de Créditos).
  var LINEAS_CREDITOS = /Pago Préstamos|Renovaciones/;
  function opsFinanzasReal(antes, despues) {
    var ops = [];
    var emps = {}; Object.keys(antes || {}).forEach(function (e) { emps[e] = 1; }); Object.keys(despues || {}).forEach(function (e) { emps[e] = 1; });
    Object.keys(emps).forEach(function (emp) {
      var a = (antes || {})[emp] || {}, d = (despues || {})[emp] || {};
      opsArreglo(a._coberturasManual, d._coberturasManual, 'cobertura', { empresa: emp }, ops);
      var ra = a._resolucionesCreditos || [], rd = d._resolucionesCreditos || [];
      if (rd.length > ra.length) rd.slice(ra.length).forEach(function (r) { ops.push({ op: 'agregar_resolucion_credito', empresa: emp, registro: clon(r) }); });
      var oa = a._proyOverrides || {}, od = d._proyOverrides || {};
      var claves = {}; Object.keys(oa).forEach(function (k) { claves[k] = 1; }); Object.keys(od).forEach(function (k) { claves[k] = 1; });
      Object.keys(claves).forEach(function (k) {
        if (!LINEAS_CREDITOS.test(k) || igual(oa[k], od[k])) return;
        var meses = {}; Object.keys(oa[k] || {}).forEach(function (m) { meses[m] = 1; }); Object.keys(od[k] || {}).forEach(function (m) { meses[m] = 1; });
        Object.keys(meses).forEach(function (m) {
          var va = (oa[k] || {})[m], vd = (od[k] || {})[m];
          if (!igual(va, vd)) ops.push({ op: vd === undefined ? 'retirar_valor_manual' : 'cambiar_valor_manual', empresa: emp, clave: k, mes: m, antes: clon(va), despues: clon(vd) });
        });
      });
    });
    return ops;
  }

  function ambitoFila(id) {
    if (id === 'finanzas') return 'Finanzas';
    if (/^nominas/.test(id)) return 'Nóminas';
    if (id === 'maestro_tc') return 'Tipo de cambio';
    return 'Otros';
  }

  function comparar(respaldo, trabajo) {
    var tablas = (respaldo && respaldo.tablas) || {};
    var operaciones = [], detalle = [], filas = {};
    var ids = {}; Object.keys(tablas).forEach(function (k) { ids[k] = 1; }); Object.keys(trabajo || {}).forEach(function (k) { ids[k] = 1; });
    Object.keys(ids).sort().forEach(function (id) {
      if (IGNORAR.test(id)) return;
      var a = tablas[id] ? parse(tablas[id].data) : undefined;
      var d = trabajo[id] ? parse(trabajo[id].value) : undefined;
      if (igual(a, d)) return;
      filas[id] = { antes_updated_at: tablas[id] ? tablas[id].updated_at : null, nueva: !tablas[id] };
      var det = []; rutas(a, d, '', det, 3000);
      det.forEach(function (x) {
        var amb = ambitoFila(id);
        if (id === 'finanzas') {
          var raiz0 = x.ruta.split('.')[0];
          amb = /^creditos_/.test(raiz0) ? 'Créditos'
            : (raiz0 === 'finanzas_real' && /_coberturasManual|_resolucionesCreditos|Pago Préstamos|Renovaciones/.test(x.ruta)) ? 'Créditos'
            : 'Otros (auto-guardado de la app)';
        }
        detalle.push({ ambito: amb, fila: id, ruta: x.ruta, antes: x.antes, despues: x.despues });
      });
      if (id === 'finanzas') {
        var fa = a || {}, fd = d || {};
        operaciones = operaciones.concat(opsCreditos(fa.creditos_data, fd.creditos_data));
        var sa = fa.creditos_saldos_informados, sd = fd.creditos_saldos_informados;
        opsArreglo(sa, sd, 'saldo_informado', {}, operaciones);
        if (!igual(fa.creditos_config, fd.creditos_config)) operaciones.push({ op: 'cambiar_config_creditos', antes: clon(fa.creditos_config), despues: clon(fd.creditos_config) });
        operaciones = operaciones.concat(opsFinanzasReal(fa.finanzas_real, fd.finanzas_real));
      }
      if (/^nominas_/.test(id)) {
        var na = ((a && a.nominas) || []), nd = ((d && d.nominas) || []);
        var NA = porId(na);
        nd.forEach(function (n) {
          var an = NA[n.id] || { items: [] };
          var IA = porId(an.items);
          (n.items || []).forEach(function (it) {
            var ai = IA[it.id] || {};
            if (!igual(ai.creditoVinculo, it.creditoVinculo))
              operaciones.push({ op: it.creditoVinculo ? 'vincular_linea_nomina' : 'desvincular_linea_nomina', fila: id, nomina: n.id, linea: it.id,
                antes: clon(ai.creditoVinculo), despues: clon(it.creditoVinculo) });
          });
        });
      }
      if (id === 'maestro_tc') {
        var ta = a || {}, td = d || {};
        Object.keys(td).forEach(function (par) {
          var fa2 = {}; (ta[par] || []).forEach(function (e) { fa2[e.fecha] = e; });
          (td[par] || []).forEach(function (e) { if (!igual(fa2[e.fecha], e)) operaciones.push({ op: fa2[e.fecha] ? 'cambiar_tc' : 'agregar_tc', par: par, fecha: e.fecha, antes: clon(fa2[e.fecha]), despues: clon(e) }); });
        });
      }
    });
    var resumen = {};
    operaciones.forEach(function (o) { resumen[o.op] = (resumen[o.op] || 0) + 1; });
    return { operaciones: operaciones, detalle: detalle, filas: filas, resumen: resumen,
      alertas: operaciones.filter(function (o) { return o.alerta; }).length };
  }

  function csv(detalle, operaciones) {
    var esc = function (v) {
      var s = v === undefined ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
      if (s.length > 3000) s = s.slice(0, 3000) + '…';
      return '"' + s.replace(/"/g, '""') + '"';
    };
    var l = ['﻿' + ['Tipo', 'Ámbito', 'Fila / crédito', 'Operación o ruta', 'Antes', 'Después', 'Usuario', 'Fecha'].map(esc).join(';')];
    operaciones.forEach(function (o) {
      var reg = o.registro || o.despues || {};
      l.push(['Operación', 'Créditos', o.etiqueta || o.credito || o.empresa || o.fila || o.par || '', o.op + (o.campo ? ' · ' + o.campo : '') + (o.id ? ' · ' + o.id : ''),
        o.antes, o.registro || o.despues, reg.usuario || reg.anuladoPor || o.anuladoPor || '', reg.ts || reg.fecha || o.anuladoTs || ''].map(esc).join(';'));
    });
    detalle.forEach(function (x) { l.push(['Detalle', x.ambito, x.fila, x.ruta, x.antes, x.despues, '', ''].map(esc).join(';')); });
    return l.join('\r\n');
  }

  var api = { comparar: comparar, csv: csv, conUids: conUids, huella: huella };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.VPDiff = api;
})(typeof window !== 'undefined' ? window : this);
