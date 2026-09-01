// ============================================================================
// R3-S6_browser.js — Prueba REVOCATION NEXT REQUEST / SAME JWT en el stack real.
// Correr en la CONSOLA del navegador (DevTools) en la pestaña del Preview con
// Allegria Service abierto. NO en el SQL Editor.
// Secuencia: BLOQUE 0 -> login (T0) -> revoke SQL (T1, SQL Editor) -> T2 -> restore SQL (T3) -> T2b.
// ============================================================================

// ── BLOQUE 0 · captura apikey + helpers ──
(function(){const _f=window.fetch;window.fetch=function(u,o){if(o&&o.headers&&o.headers.apikey&&!window.APIKEY){window.APIKEY=o.headers.apikey;}return _f.apply(this,arguments);};})();
const URL="https://nlvfjpwiecgrosjnwwik.supabase.co";
const A="f1000000-0000-0000-0000-0000000000aa";
function jwtInfo(t){try{const p=JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));const now=Math.floor(Date.now()/1000);return{tail:t.slice(-12),exp:p.exp,secsToExp:p.exp-now,valid:p.exp>now};}catch(e){return{err:String(e)};}}
async function login(p){const r=await fetch(URL+"/auth/v1/token?grant_type=password",{method:"POST",headers:{apikey:window.APIKEY,"Content-Type":"application/json"},body:JSON.stringify({email:"uat-revoke-r3s6@fixture.invalid",password:p})});const j=await r.json();window.TOK=j.access_token;window.J1=j.access_token;console.log("login:",window.TOK?"OK":JSON.stringify(j),window.TOK?jwtInfo(window.TOK):"");}
async function who(){const r=await fetch(URL+"/rest/v1/rpc/proc_whoami",{method:"POST",headers:{apikey:window.APIKEY,Authorization:"Bearer "+window.TOK,"Content-Type":"application/json","X-Proc-Empresa":A},body:"{}"});console.log("who",JSON.stringify(await r.json()));}
async function rows(){const r=await fetch(URL+"/rest/v1/proc_repaletizaje?select=motivo",{headers:{apikey:window.APIKEY,Authorization:"Bearer "+window.TOK,"X-Proc-Empresa":A}});console.log("rows status="+r.status,JSON.stringify(await r.json()));}
// prueba de MISMO token: idéntico string a J1 + aún vigente (no expiró)
function sameJWT(){const same=window.TOK===window.J1;const info=jwtInfo(window.TOK);console.log("SAME-JWT:",same,"| valid(exp>now):",info.valid,"| secsToExp:",info.secsToExp,"| tail:",info.tail);return same&&info.valid;}
console.log("R3-S6 listo. Primero click en 'Lotes / Materia Prima' para capturar la apikey.");

// ── T0 · login + baseline ALLOW (con membership ACTIVE) ──
//   await login("<password del auth user creado en Dashboard>")
//   sameJWT()          // true | valid:true  -> guardamos J1
//   await who()        // empresa = ...aa
//   await rows()       // status=200 [{"motivo":"R3S6-FIXTURE-A"}]

// ── T1 · en el SQL Editor: correr R3-S6_revoke.sql (activo=false). NO tocar la consola. ──

// ── T2 · MISMO token J1, SIN re-login/refresh ──
//   sameJWT()          // DEBE seguir true | valid:true  -> el token NO cambió y NO expiró
//   await who()        // empresa = null   (DENY)
//   await rows()       // status=200 []    (DENY next request)

// ── T3 · en el SQL Editor: correr R3-S6_restore.sql (activo=true). ──

// ── T2b · MISMO token J1 ──
//   sameJWT()          // true | valid:true
//   await who()        // empresa = ...aa  (ALLOW restaurado, sin re-login)
//   await rows()       // status=200 [{"motivo":"R3S6-FIXTURE-A"}]
