import assert from 'node:assert/strict';
import { eliminarCredito, prepararGuardadoCreditos, flujoCreditosEmpresa,
  ingresosRenovacionFlujo, estadoCredito, saldosAlCorte, analisisCartera } from './creditos.js';

const base = {uid:'cr-a', empresa:'Osiris', acreedor:'Banco A', moneda:'USD', monto:100000,
  cuota:105000, f_inicio:'2026-11-01', f_venc:'2026-12-31', control_desde:'2026-01-01',
  desglose:{capital:100000, interes:5000, cargos:0}, renovable:true,
  renovaciones:[{monto:100000, mes_ingreso:'Dic', anio_ingreso:'2026', tasa_anual:10,
    cuotas:[{tipo:'Capital+Interés',mes:'Dic',anio:'2027'}]}],
  pagos:[{id:'p1',fecha:'2026-10-01',capital:1000,interes:0,cargos:0,vencKey:'cr-a@2026-12-31'}],
  documentos:[{nombre:'contrato.pdf'}], historial:[]};
const original = JSON.stringify(base);
assert.throws(()=>eliminarCredito(base,{motivo:'Registro duplicado'}),/administrador/);
assert.throws(()=>eliminarCredito(base,{administrador:true,motivo:' '}),/motivo/);
const eliminado = eliminarCredito(base,{administrador:true,usuario:'Admin',motivo:'Registro duplicado'});
assert.equal(JSON.stringify(base),original,'No modifica el original');
assert.equal(eliminado.eliminado,true);
assert.equal(eliminado.eliminadoPor,'Admin');
assert.deepEqual(eliminado.pagos,base.pagos,'Conserva los pagos');
assert.deepEqual(eliminado.documentos,base.documentos,'Conserva los documentos');
assert.equal(eliminado.historial.at(-1).accion,'eliminación administrativa');
assert.throws(()=>eliminarCredito(eliminado,{administrador:true,motivo:'Otra vez'}),/ya fue eliminado/);
const ubicar = iso => ({idx:(Number(iso.slice(0,4))-2026)*12+Number(iso.slice(5,7))-1,semIdx:0});
const opts = {hoy:'2026-10-22',nMeses:24,ubicar};
const antes = flujoCreditosEmpresa('Osiris',[base],opts);
assert.ok(antes.prestamos.total.reduce((a,b)=>a+b,0)>0);
assert.equal(antes.ingresos.total[10],100000);
assert.equal(ingresosRenovacionFlujo(base)[0].usd,100000);
const despues = flujoCreditosEmpresa('Osiris',[eliminado],opts);
for(const k of ['prestamos','renovaciones','ingresos']) {
  assert.equal(despues[k].total.reduce((a,b)=>a+b,0),0,k+' desaparece del flujo');
  assert.deepEqual(despues[k].sem,{},k+' desaparece de semanas');
}
assert.deepEqual(ingresosRenovacionFlujo(eliminado),[],'Tampoco filtra ingresos de renovaciones antiguas');
assert.deepEqual(estadoCredito(eliminado,'2026-10-22').vencimientos,[]);
assert.deepEqual(saldosAlCorte([eliminado],'2026-10-22','2026-10-22'),saldosAlCorte([],'2026-10-22','2026-10-22'));
assert.deepEqual(analisisCartera([eliminado],'2026-10-22'),analisisCartera([],'2026-10-22'));
const otro = {...base,uid:'cr-b',acreedor:'Banco B'};
assert.deepEqual(flujoCreditosEmpresa('Osiris',[eliminado,otro],opts),flujoCreditosEmpresa('Osiris',[otro],opts),'Eliminar un crédito no altera el flujo del otro');
assert.deepEqual(flujoCreditosEmpresa('Osiris',[eliminado,otro],opts),flujoCreditosEmpresa('Osiris',[otro],opts),'Eliminar un crédito no altera el flujo del otro');
const privado = {...base,uid:'cr-c',empresa:'Mediterra'};
const ctx = {administrador:true,empresasPermitidas:['Osiris']};
assert.equal(prepararGuardadoCreditos([base,otro,privado],[eliminado,otro],{...ctx,administrador:false}).ok,false);
const guardado = prepararGuardadoCreditos([base,otro,privado],[eliminado,otro],ctx);
assert.equal(guardado.ok,true);
assert.deepEqual(guardado.lista.find(c=>c.uid==='cr-c'),privado,'Conserva empresas ajenas');
const posterior = prepararGuardadoCreditos(guardado.lista,[{...otro,acreedor:'Banco B editado'}],{...ctx,administrador:false});
assert.equal(posterior.ok,true);
assert.deepEqual(posterior.lista.find(c=>c.uid==='cr-a'),eliminado,'Otro guardado no borra el expediente oculto');
assert.equal(prepararGuardadoCreditos(guardado.lista,[{...eliminado,eliminado:false}],ctx).ok,false,'No reactiva un eliminado');
assert.equal(prepararGuardadoCreditos([base],[],{...ctx,administrador:false}).lista.length,1,'Omitir no elimina');
// Pago confirmado desde una nómina: no se elimina (la nómina quedaría sin poder anularse).
const conNomina={...base,uid:'cr-nom',pagos:[{id:'p1',vencKey:'cr-nom@2027-01-01',fecha:'2026-10-01',capital:100,interes:0,cargos:0,sinDesglose:0,origen:{tipo:'nomina',clave:'nomina:N1:L1'}}]};
assert.throws(()=>eliminarCredito(conNomina,{administrador:true,usuario:'Admin',motivo:'x'}),/nómina/,'No elimina con pago de nómina vigente');
const conNominaAnulado={...conNomina,pagos:[{...conNomina.pagos[0],anulado:true,motivoAnulacion:'error'}]};
assert.equal(eliminarCredito(conNominaAnulado,{administrador:true,usuario:'Admin',motivo:'x'}).eliminado,true,'Con el pago de nómina anulado sí elimina');
console.log('OK: permisos, historial, capital, cuotas, desembolsos, renovaciones antiguas, semanas y guardados posteriores.');
