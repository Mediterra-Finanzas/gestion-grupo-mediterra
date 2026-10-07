/* eslint-disable */
let SRV = null;
global.fetch = (...a) => SRV.fetchImpl(...a);
class WSFalso { constructor(){ this.readyState = 0; } send(){} close(){} }
global.WebSocket = WSFalso; global.WebSocket.OPEN = 1;
const React = require("react");
const { render, act, fireEvent } = require("@testing-library/react");
function servidorFalso(filas0){
  const filas = JSON.parse(JSON.stringify(filas0)); let seq=1; const peticiones=[];
  const estado={rechaza:false};
  const resp=(b,s=200)=>({ok:s>=200&&s<300,status:s,json:async()=>b,text:async()=>JSON.stringify(b),headers:{get:()=>null}});
  const fetchImpl=async(url,opts={})=>{
    const m=(opts.method||"GET").toUpperCase(); const u=new URL(String(url));
    let id=decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search)||[])[1]||"");
    let body=null; try{body=JSON.parse(opts.body||"null");}catch(_){}
    if(!id&&body&&body.id) id=String(body.id);
    peticiones.push({m,id});
    if(m==="GET"){const f=filas[id];return resp(f?[{id,value:f.value,updated_at:f.updated_at}]:[]);}
    if(estado.rechaza) return resp({message:"no"},500);
    if(m==="PATCH"){const v=decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search)||[])[1]||"");
      if(!filas[id]||filas[id].updated_at!==v) return resp([]);
      filas[id]={value:body.value,updated_at:`v${seq++}`};
      return resp([{id,value:filas[id].value,updated_at:filas[id].updated_at}]);}
    filas[body.id]={value:body.value,updated_at:`v${seq++}`};
    return resp([{id:body.id,value:filas[body.id].value,updated_at:filas[body.id].updated_at}],201);
  };
  return {filas,fetchImpl,peticiones,estado,leer:(id)=>filas[id]&&filas[id].value};
}
const fruta=(e={})=>({kg:0,fob_usd_kg:0,desc_exp_pct:0,mat_usd_kg:0,srv_usd_kg:0,anticipos_cliente:[],anticipos_productor:[],mes_liquidacion:"",mes_saldo_productor:"",programas:[],dist_mat:[],dist_srv:[],...e});
const TEMPS=["2026-2027","2027-2028","2028-2029","2029-2030","2030-2031"];
let FinanzasModule, persist;
beforeAll(()=>{persist=require("/home/user/gestion-grupo-mediterra/src/persistencia/instancia.js").persist;
  FinanzasModule=require("/home/user/gestion-grupo-mediterra/src/FinanzasModule.jsx").default;});
test("probe", async ()=>{
  jest.useFakeTimers();
  const ap={}; TEMPS.forEach(t=>{ap[t]={cerezas:fruta(),ciruelas:fruta(),arandanos:fruta()};});
  ap["2026-2027"].cerezas=fruta({kg:850000,fob_usd_kg:4.5,mes_liquidacion:"Mar-27",
    anticipos_cliente:[{mes:"Nov-26",usd_kg:0.44,realizaciones:[]},{mes:"Dec-26",usd_kg:0.44,realizaciones:[]}],
    programas:[{id:"prg1",lado:"cliente",contraparte:"TUNGSHING",kilos:100000,precio_usd_kg:4.5,
      cuotas:[{id:"c1",fecha_prevista:"2026-11-15",mes:"Nov-26",modalidad:"monto",monto:100000,
               estado:"vigente",sustituye:[],realizaciones:[],v:2}]}]});
  SRV=servidorFalso({finanzas:{value:{finanzas_real:{},allegria_params:ap,allegria_comision_arandanos:{cobros:[]},
    params_emp:{},params_as:{},params_if:{},params_af:{},params_ap:{},params_osiris:{},params_participacion:{},
    sub_lines:{},added_lines:{},intercompany:[],creditos_data:[],params_frisku:{}},updated_at:"v0"},
    finanzas_bancos:{value:{saldos:{}},updated_at:"v0"},finanzas_esc_index:{value:{escenarios:[]},updated_at:"v0"}});
  SRV.estado.rechaza=true;
  persist.reset();
  act(()=>{render(React.createElement(FinanzasModule,{onBack(){},onLogout(){},
    usuarioActual:{nombre:"A",rol:"admin"},tabPermisos:{},usuarios:[]}));});
  for(let i=0;i<14;i++) await act(async()=>{jest.advanceTimersByTime(200);await Promise.resolve();});
  const clic=async(re)=>{const b=[...document.querySelectorAll("button")].find(x=>re.test(x.textContent||""));
    if(!b) throw new Error("no btn "+re); await act(async()=>{fireEvent.click(b);await Promise.resolve();});};
  await clic(/Flujo Empresas/); await clic(/Allegria Foods/); await clic(/Parámetros/);
  await clic(/Temporada 2026-2027/);
  console.log("BOTONES:", [...document.querySelectorAll("button")].map(b=>b.textContent).join(" | ").slice(0,2500));
  console.log("SUST?", /no se puede sustituir/.test(document.body.textContent));
  console.log("MARCA:", document.querySelector('[data-testid=marcador-build]')?.textContent);
  jest.useRealTimers();
});
