/* eslint-disable */
// Pruebas del lector de snapshot — ejecutar: node scripts/e2e/cargarSnapshot.test.mjs
import { leerSnapshot, leerArchivoSnapshot, SnapshotInvalido } from './cargarSnapshot.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
let f=0; const ok=(n,c,e='')=>{console.log(`${c?'✓':'✗ FALLA'}  ${n}${e?'  — '+e:''}`); if(!c)f++;};
const finanzasOk = { allegria_params:{x:1}, finanzas_real:{}, sub_lines:{} };

// a) formato del botón Respaldo, completo
{
  const r = leerSnapshot({ version:'Mediterra Hub Backup v1', tablas:{
    finanzas:{data:finanzasOk, updated_at:'t1'}, finanzas_bancos:{data:{saldos:{a:1}}},
    finanzas_esc_index:{data:{escenarios:[1]}}, pins:{data:{secreto:'x'}}, nominas:{data:{}} } });
  ok('respaldo completo: 3 filas', Object.keys(r.filas).length===3, Object.keys(r.filas).join(','));
  ok('no lee pins ni nominas', !r.filas.pins && !r.filas.nominas);
  ok('sin avisos', r.avisos.length===0, r.avisos.join(' | '));
}
// b) faltan filas → avisa pero sigue
{
  const r = leerSnapshot({ tablas:{ finanzas:{data:finanzasOk} } });
  ok('faltan bancos e índice: se informa', r.faltan.length===2 && r.avisos.some(a=>a.includes('finanzas_bancos')), r.avisos.join(' | '));
}
// c) finanzas vacía → se detiene
{
  try { leerSnapshot({ tablas:{ finanzas:{data:{}}, finanzas_bancos:{data:{saldos:{}}} } }); ok('finanzas vacía se detiene', false); }
  catch(e){ ok('finanzas vacía se detiene', e instanceof SnapshotInvalido, e.message.slice(0,60)); }
}
// d) value nulo → se detiene
{
  try { leerSnapshot({ finanzas:{value:null} }); ok('value nulo se detiene', false); }
  catch(e){ ok('value nulo se detiene', e instanceof SnapshotInvalido); }
}
// e) estructura desconocida → se detiene
{
  try { leerSnapshot({ tablas:{ finanzas:{data:{cualquier_cosa:1}} } }); ok('finanzas irreconocible se detiene', false); }
  catch(e){ ok('finanzas irreconocible se detiene', e.message.includes('no se parece al módulo de flujo')); }
}
// f) no es objeto
{
  try { leerSnapshot([1,2]); ok('array se detiene', false); } catch(e){ ok('array se detiene', e instanceof SnapshotInvalido); }
}
// g) fila como texto JSON (codificación string de Supabase)
{
  const r = leerSnapshot({ finanzas:{ value: JSON.stringify(finanzasOk), updated_at:'t' } });
  ok('fila string-encoded se parsea', !!r.filas.finanzas.value.allegria_params);
}
// h) sin allegria_params → avisa
{
  const r = leerSnapshot({ finanzas:{ value:{ finanzas_real:{a:1} } } });
  ok('sin allegria_params avisa', r.avisos.some(a=>a.includes('allegria_params')), r.avisos.join(' | '));
}

// i) archivo con BOM (lo que escribe PowerShell 5.1 / reducir-respaldo.ps1)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  const ruta = path.join(dir, 'con-bom.json');
  fs.writeFileSync(ruta, '\uFEFF' + JSON.stringify({ tablas:{ finanzas:{data:finanzasOk} } }), 'utf8');
  const r = leerArchivoSnapshot(ruta, fs);
  ok('archivo con BOM se lee igual', !!r.filas.finanzas.value.allegria_params);
  fs.rmSync(dir, { recursive:true, force:true });
}
// j) JSON roto: el error NO arrastra el contenido del archivo
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  const ruta = path.join(dir, 'roto.json');
  const secreto = 'MONTO_CONFIDENCIAL_123456';
  fs.writeFileSync(ruta, '{"finanzas": ' + secreto, 'utf8');
  try { leerArchivoSnapshot(ruta, fs); ok('JSON roto se detiene', false); }
  catch (e) {
    ok('JSON roto se detiene', e instanceof SnapshotInvalido);
    ok('el mensaje no filtra el contenido', !e.message.includes(secreto), e.message.slice(0,60));
  }
  fs.rmSync(dir, { recursive:true, force:true });
}
console.log(f===0?'\nTODOS OK':`\n${f} FALLAS`); process.exit(f?1:0);
