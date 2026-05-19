/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// FriskuMaestrosModule.jsx — Maestros globales para Frisku Foods
// 10 sub-tabs: Países, Ciudades, Puertos, Aeropuertos, Shipping Lines,
//   Tipos Embarque, Tipos Embalaje, Mercados, Monedas, Checklist Docs
// Persistencia: tabla calendario_data, ids "maestro_*"
// ═══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  TC_PARES_DEFAULT, fechaISO,
  actualizarTCDesdeAPIs, aplicarUpdatesATCData, mergeTCSerie,
  buscarTC, formatearMonto,
  loadConSeed,
} from "./friskuHelpers.js";

const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

// ── Paleta Frisku — Slate neutro ──
const C = {
  bg:"#1e2533", bg2:"#263044", card:"#2d3a52", card2:"#334158", border:"#3d4f6e",
  text:"#e2e8f0", muted:"#94a3b8", muted2:"#5a6a80",
  blue:"#3b82f6", green:"#22c55e", yellow:"#f59e0b", accent:"#ef4444",
  teal:"#14b8a6", purple:"#a855f7",
};

// ── Persistencia genérica para maestros ──
async function dbLoadMaestro(id) {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${id}&select=value`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const rows = await res.json();
    if(rows?.[0]?.value) {
      return typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    }
    return null;
  } catch(e) { console.error(`[Maestro:${id}] Error cargando:`, e); return null; }
}

async function dbSaveMaestro(id, value) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type":"application/json", Prefer:"resolution=merge-duplicates" },
      body: JSON.stringify({ id, value, updated_at: new Date().toISOString() })
    });
    console.log(`[Maestro:${id}] ✅ Guardado (${Array.isArray(value)?value.length:"?"} items)`);
  } catch(e) { console.error(`[Maestro:${id}] Error guardando:`, e); }
}

// ═══════════════════════════════════════════════════════════════════
// DATOS PRECARGADOS — PAÍSES (ISO 3166-1 alpha-2)
// (Exportados para que FriskuComercialModule pueda usarlos como
// fallback cuando Supabase aún no tiene la fila correspondiente.)
// ═══════════════════════════════════════════════════════════════════
export const PAISES_DEFAULT = [
  // Sudamérica (exportadores principales)
  {codigo:"CL", nombreEs:"Chile",        nombreEn:"Chile",         flag:"🇨🇱", region:"Sudamérica"},
  {codigo:"PE", nombreEs:"Perú",         nombreEn:"Peru",          flag:"🇵🇪", region:"Sudamérica"},
  {codigo:"BR", nombreEs:"Brasil",       nombreEn:"Brazil",        flag:"🇧🇷", region:"Sudamérica"},
  {codigo:"AR", nombreEs:"Argentina",    nombreEn:"Argentina",     flag:"🇦🇷", region:"Sudamérica"},
  {codigo:"CO", nombreEs:"Colombia",     nombreEn:"Colombia",      flag:"🇨🇴", region:"Sudamérica"},
  {codigo:"EC", nombreEs:"Ecuador",      nombreEn:"Ecuador",       flag:"🇪🇨", region:"Sudamérica"},
  {codigo:"UY", nombreEs:"Uruguay",      nombreEn:"Uruguay",       flag:"🇺🇾", region:"Sudamérica"},
  {codigo:"PY", nombreEs:"Paraguay",     nombreEn:"Paraguay",      flag:"🇵🇾", region:"Sudamérica"},
  {codigo:"BO", nombreEs:"Bolivia",      nombreEn:"Bolivia",       flag:"🇧🇴", region:"Sudamérica"},
  {codigo:"VE", nombreEs:"Venezuela",    nombreEn:"Venezuela",     flag:"🇻🇪", region:"Sudamérica"},
  // Centroamérica & Caribe
  {codigo:"MX", nombreEs:"México",       nombreEn:"Mexico",        flag:"🇲🇽", region:"Norteamérica"},
  {codigo:"GT", nombreEs:"Guatemala",    nombreEn:"Guatemala",     flag:"🇬🇹", region:"Centroamérica"},
  {codigo:"CR", nombreEs:"Costa Rica",   nombreEn:"Costa Rica",    flag:"🇨🇷", region:"Centroamérica"},
  {codigo:"PA", nombreEs:"Panamá",       nombreEn:"Panama",        flag:"🇵🇦", region:"Centroamérica"},
  {codigo:"DO", nombreEs:"República Dominicana", nombreEn:"Dominican Republic", flag:"🇩🇴", region:"Caribe"},
  {codigo:"CU", nombreEs:"Cuba",         nombreEn:"Cuba",          flag:"🇨🇺", region:"Caribe"},
  {codigo:"HN", nombreEs:"Honduras",     nombreEn:"Honduras",      flag:"🇭🇳", region:"Centroamérica"},
  {codigo:"NI", nombreEs:"Nicaragua",    nombreEn:"Nicaragua",     flag:"🇳🇮", region:"Centroamérica"},
  {codigo:"SV", nombreEs:"El Salvador",  nombreEn:"El Salvador",   flag:"🇸🇻", region:"Centroamérica"},
  // Norteamérica
  {codigo:"US", nombreEs:"Estados Unidos", nombreEn:"United States", flag:"🇺🇸", region:"Norteamérica"},
  {codigo:"CA", nombreEs:"Canadá",       nombreEn:"Canada",        flag:"🇨🇦", region:"Norteamérica"},
  // Europa Occidental
  {codigo:"GB", nombreEs:"Reino Unido",  nombreEn:"United Kingdom",flag:"🇬🇧", region:"Europa"},
  {codigo:"NL", nombreEs:"Países Bajos", nombreEn:"Netherlands",   flag:"🇳🇱", region:"Europa"},
  {codigo:"DE", nombreEs:"Alemania",     nombreEn:"Germany",       flag:"🇩🇪", region:"Europa"},
  {codigo:"ES", nombreEs:"España",       nombreEn:"Spain",         flag:"🇪🇸", region:"Europa"},
  {codigo:"FR", nombreEs:"Francia",      nombreEn:"France",        flag:"🇫🇷", region:"Europa"},
  {codigo:"IT", nombreEs:"Italia",       nombreEn:"Italy",         flag:"🇮🇹", region:"Europa"},
  {codigo:"PT", nombreEs:"Portugal",     nombreEn:"Portugal",      flag:"🇵🇹", region:"Europa"},
  {codigo:"BE", nombreEs:"Bélgica",      nombreEn:"Belgium",       flag:"🇧🇪", region:"Europa"},
  {codigo:"IE", nombreEs:"Irlanda",      nombreEn:"Ireland",       flag:"🇮🇪", region:"Europa"},
  {codigo:"CH", nombreEs:"Suiza",        nombreEn:"Switzerland",   flag:"🇨🇭", region:"Europa"},
  {codigo:"AT", nombreEs:"Austria",      nombreEn:"Austria",       flag:"🇦🇹", region:"Europa"},
  {codigo:"DK", nombreEs:"Dinamarca",    nombreEn:"Denmark",       flag:"🇩🇰", region:"Europa"},
  {codigo:"SE", nombreEs:"Suecia",       nombreEn:"Sweden",        flag:"🇸🇪", region:"Europa"},
  {codigo:"NO", nombreEs:"Noruega",      nombreEn:"Norway",        flag:"🇳🇴", region:"Europa"},
  {codigo:"FI", nombreEs:"Finlandia",    nombreEn:"Finland",       flag:"🇫🇮", region:"Europa"},
  {codigo:"GR", nombreEs:"Grecia",       nombreEn:"Greece",        flag:"🇬🇷", region:"Europa"},
  // Europa Oriental
  {codigo:"PL", nombreEs:"Polonia",      nombreEn:"Poland",        flag:"🇵🇱", region:"Europa"},
  {codigo:"CZ", nombreEs:"República Checa", nombreEn:"Czech Republic", flag:"🇨🇿", region:"Europa"},
  {codigo:"HU", nombreEs:"Hungría",      nombreEn:"Hungary",       flag:"🇭🇺", region:"Europa"},
  {codigo:"RO", nombreEs:"Rumania",      nombreEn:"Romania",       flag:"🇷🇴", region:"Europa"},
  {codigo:"RU", nombreEs:"Rusia",        nombreEn:"Russia",        flag:"🇷🇺", region:"Europa/Asia"},
  {codigo:"UA", nombreEs:"Ucrania",      nombreEn:"Ukraine",       flag:"🇺🇦", region:"Europa"},
  {codigo:"TR", nombreEs:"Turquía",      nombreEn:"Turkey",        flag:"🇹🇷", region:"Europa/Asia"},
  // Asia
  {codigo:"CN", nombreEs:"China",        nombreEn:"China",         flag:"🇨🇳", region:"Asia"},
  {codigo:"HK", nombreEs:"Hong Kong",    nombreEn:"Hong Kong",     flag:"🇭🇰", region:"Asia"},
  {codigo:"TW", nombreEs:"Taiwán",       nombreEn:"Taiwan",        flag:"🇹🇼", region:"Asia"},
  {codigo:"JP", nombreEs:"Japón",        nombreEn:"Japan",         flag:"🇯🇵", region:"Asia"},
  {codigo:"KR", nombreEs:"Corea del Sur",nombreEn:"South Korea",   flag:"🇰🇷", region:"Asia"},
  {codigo:"SG", nombreEs:"Singapur",     nombreEn:"Singapore",     flag:"🇸🇬", region:"Asia"},
  {codigo:"MY", nombreEs:"Malasia",      nombreEn:"Malaysia",      flag:"🇲🇾", region:"Asia"},
  {codigo:"TH", nombreEs:"Tailandia",    nombreEn:"Thailand",      flag:"🇹🇭", region:"Asia"},
  {codigo:"VN", nombreEs:"Vietnam",      nombreEn:"Vietnam",       flag:"🇻🇳", region:"Asia"},
  {codigo:"PH", nombreEs:"Filipinas",    nombreEn:"Philippines",   flag:"🇵🇭", region:"Asia"},
  {codigo:"ID", nombreEs:"Indonesia",    nombreEn:"Indonesia",     flag:"🇮🇩", region:"Asia"},
  {codigo:"IN", nombreEs:"India",        nombreEn:"India",         flag:"🇮🇳", region:"Asia"},
  {codigo:"PK", nombreEs:"Pakistán",     nombreEn:"Pakistan",      flag:"🇵🇰", region:"Asia"},
  {codigo:"BD", nombreEs:"Bangladesh",   nombreEn:"Bangladesh",    flag:"🇧🇩", region:"Asia"},
  // Medio Oriente
  {codigo:"AE", nombreEs:"Emiratos Árabes Unidos", nombreEn:"UAE", flag:"🇦🇪", region:"Medio Oriente"},
  {codigo:"SA", nombreEs:"Arabia Saudita", nombreEn:"Saudi Arabia",flag:"🇸🇦", region:"Medio Oriente"},
  {codigo:"IL", nombreEs:"Israel",       nombreEn:"Israel",        flag:"🇮🇱", region:"Medio Oriente"},
  {codigo:"QA", nombreEs:"Catar",        nombreEn:"Qatar",         flag:"🇶🇦", region:"Medio Oriente"},
  {codigo:"KW", nombreEs:"Kuwait",       nombreEn:"Kuwait",        flag:"🇰🇼", region:"Medio Oriente"},
  {codigo:"OM", nombreEs:"Omán",         nombreEn:"Oman",          flag:"🇴🇲", region:"Medio Oriente"},
  {codigo:"BH", nombreEs:"Baréin",       nombreEn:"Bahrain",       flag:"🇧🇭", region:"Medio Oriente"},
  {codigo:"JO", nombreEs:"Jordania",     nombreEn:"Jordan",        flag:"🇯🇴", region:"Medio Oriente"},
  {codigo:"LB", nombreEs:"Líbano",       nombreEn:"Lebanon",       flag:"🇱🇧", region:"Medio Oriente"},
  {codigo:"IR", nombreEs:"Irán",         nombreEn:"Iran",          flag:"🇮🇷", region:"Medio Oriente"},
  // África
  {codigo:"ZA", nombreEs:"Sudáfrica",    nombreEn:"South Africa",  flag:"🇿🇦", region:"África"},
  {codigo:"EG", nombreEs:"Egipto",       nombreEn:"Egypt",         flag:"🇪🇬", region:"África"},
  {codigo:"MA", nombreEs:"Marruecos",    nombreEn:"Morocco",       flag:"🇲🇦", region:"África"},
  {codigo:"NG", nombreEs:"Nigeria",      nombreEn:"Nigeria",       flag:"🇳🇬", region:"África"},
  {codigo:"KE", nombreEs:"Kenia",        nombreEn:"Kenya",         flag:"🇰🇪", region:"África"},
  {codigo:"GH", nombreEs:"Ghana",        nombreEn:"Ghana",         flag:"🇬🇭", region:"África"},
  {codigo:"TN", nombreEs:"Túnez",        nombreEn:"Tunisia",       flag:"🇹🇳", region:"África"},
  {codigo:"DZ", nombreEs:"Argelia",      nombreEn:"Algeria",       flag:"🇩🇿", region:"África"},
  // Oceanía
  {codigo:"AU", nombreEs:"Australia",    nombreEn:"Australia",     flag:"🇦🇺", region:"Oceanía"},
  {codigo:"NZ", nombreEs:"Nueva Zelanda",nombreEn:"New Zealand",   flag:"🇳🇿", region:"Oceanía"},
];

// ═══════════════════════════════════════════════════════════════════
// CIUDADES — relevantes para el negocio (producción + destino fruta fresca)
// Código convencional: PAIS-XXX (3 letras tipo IATA cuando aplica)
// ═══════════════════════════════════════════════════════════════════
export const CIUDADES_DEFAULT = [
  // CHILE — producción y logística
  {codigo:"CL-SCL", nombre:"Santiago",     paisCodigo:"CL", observ:"Capital, principal HUB aéreo"},
  {codigo:"CL-VAP", nombre:"Valparaíso",   paisCodigo:"CL", observ:"Puerto principal Pacífico"},
  {codigo:"CL-SAI", nombre:"San Antonio",  paisCodigo:"CL", observ:"Puerto principal carga"},
  {codigo:"CL-CUR", nombre:"Curicó",       paisCodigo:"CL", observ:"Zona cerezas/uva"},
  {codigo:"CL-TLC", nombre:"Talca",        paisCodigo:"CL", observ:"Zona frutícola"},
  {codigo:"CL-RAN", nombre:"Rancagua",     paisCodigo:"CL", observ:"Zona uva/cerezas"},
  {codigo:"CL-CCP", nombre:"Concepción",   paisCodigo:"CL", observ:""},
  {codigo:"CL-CNL", nombre:"Coronel",      paisCodigo:"CL", observ:"Puerto sur"},
  {codigo:"CL-LSC", nombre:"La Serena",    paisCodigo:"CL", observ:"Zona uva pisquera"},
  {codigo:"CL-IQQ", nombre:"Iquique",      paisCodigo:"CL", observ:""},
  {codigo:"CL-ANF", nombre:"Antofagasta",  paisCodigo:"CL", observ:""},
  // PERÚ — producción arándanos y logística
  {codigo:"PE-LIM", nombre:"Lima",         paisCodigo:"PE", observ:"Capital + Callao"},
  {codigo:"PE-PIU", nombre:"Piura",        paisCodigo:"PE", observ:"Zona arándanos / uva"},
  {codigo:"PE-TRU", nombre:"Trujillo",     paisCodigo:"PE", observ:"Zona arándanos"},
  {codigo:"PE-ICA", nombre:"Ica",          paisCodigo:"PE", observ:"Zona uva / paltas"},
  {codigo:"PE-PAI", nombre:"Paita",        paisCodigo:"PE", observ:"Puerto norte"},
  // BRASIL
  {codigo:"BR-GRU", nombre:"São Paulo",    paisCodigo:"BR", observ:"Principal mercado destino"},
  {codigo:"BR-SSZ", nombre:"Santos",       paisCodigo:"BR", observ:"Puerto principal"},
  {codigo:"BR-GIG", nombre:"Rio de Janeiro", paisCodigo:"BR", observ:""},
  {codigo:"BR-POA", nombre:"Porto Alegre", paisCodigo:"BR", observ:""},
  {codigo:"BR-CWB", nombre:"Curitiba",     paisCodigo:"BR", observ:""},
  // ARGENTINA
  {codigo:"AR-BUE", nombre:"Buenos Aires", paisCodigo:"AR", observ:""},
  {codigo:"AR-MDZ", nombre:"Mendoza",      paisCodigo:"AR", observ:"Zona vitivinícola"},
  {codigo:"AR-ROS", nombre:"Rosario",      paisCodigo:"AR", observ:""},
  // COLOMBIA / ECUADOR
  {codigo:"CO-BOG", nombre:"Bogotá",       paisCodigo:"CO", observ:""},
  {codigo:"CO-MDE", nombre:"Medellín",     paisCodigo:"CO", observ:""},
  {codigo:"CO-CTG", nombre:"Cartagena",    paisCodigo:"CO", observ:"Puerto Caribe"},
  {codigo:"CO-BUN", nombre:"Buenaventura", paisCodigo:"CO", observ:"Puerto Pacífico"},
  {codigo:"EC-UIO", nombre:"Quito",        paisCodigo:"EC", observ:""},
  {codigo:"EC-GYE", nombre:"Guayaquil",    paisCodigo:"EC", observ:"Puerto principal"},
  // MÉXICO
  {codigo:"MX-MEX", nombre:"Ciudad de México", paisCodigo:"MX", observ:""},
  {codigo:"MX-GDL", nombre:"Guadalajara",  paisCodigo:"MX", observ:""},
  {codigo:"MX-MTY", nombre:"Monterrey",    paisCodigo:"MX", observ:""},
  {codigo:"MX-VER", nombre:"Veracruz",     paisCodigo:"MX", observ:"Puerto Atlántico"},
  {codigo:"MX-MZT", nombre:"Manzanillo",   paisCodigo:"MX", observ:"Puerto Pacífico"},
  // USA — destino principal
  {codigo:"US-MIA", nombre:"Miami",        paisCodigo:"US", observ:"HUB fruta latam"},
  {codigo:"US-LAX", nombre:"Los Angeles",  paisCodigo:"US", observ:""},
  {codigo:"US-LGB", nombre:"Long Beach",   paisCodigo:"US", observ:"Puerto Pacífico"},
  {codigo:"US-NYC", nombre:"New York",     paisCodigo:"US", observ:""},
  {codigo:"US-PHL", nombre:"Philadelphia", paisCodigo:"US", observ:"Puerto Atlántico fruta"},
  {codigo:"US-HOU", nombre:"Houston",      paisCodigo:"US", observ:""},
  {codigo:"US-SFO", nombre:"San Francisco", paisCodigo:"US", observ:""},
  {codigo:"US-ORD", nombre:"Chicago",      paisCodigo:"US", observ:""},
  {codigo:"US-ATL", nombre:"Atlanta",      paisCodigo:"US", observ:""},
  {codigo:"US-DFW", nombre:"Dallas",       paisCodigo:"US", observ:""},
  {codigo:"US-SEA", nombre:"Seattle",      paisCodigo:"US", observ:""},
  // CANADÁ
  {codigo:"CA-YYZ", nombre:"Toronto",      paisCodigo:"CA", observ:""},
  {codigo:"CA-YVR", nombre:"Vancouver",    paisCodigo:"CA", observ:"Puerto Pacífico"},
  {codigo:"CA-YUL", nombre:"Montreal",     paisCodigo:"CA", observ:""},
  // EUROPA Occidental
  {codigo:"ES-MAD", nombre:"Madrid",       paisCodigo:"ES", observ:""},
  {codigo:"ES-BCN", nombre:"Barcelona",    paisCodigo:"ES", observ:""},
  {codigo:"PT-LIS", nombre:"Lisboa",       paisCodigo:"PT", observ:""},
  {codigo:"PT-OPO", nombre:"Porto",        paisCodigo:"PT", observ:""},
  {codigo:"IT-ROM", nombre:"Roma",         paisCodigo:"IT", observ:""},
  {codigo:"IT-MIL", nombre:"Milán",        paisCodigo:"IT", observ:""},
  {codigo:"FR-PAR", nombre:"París",        paisCodigo:"FR", observ:""},
  {codigo:"FR-MRS", nombre:"Marsella",     paisCodigo:"FR", observ:"Puerto Mediterráneo"},
  {codigo:"DE-FRA", nombre:"Frankfurt",    paisCodigo:"DE", observ:"HUB aéreo carga"},
  {codigo:"DE-HAM", nombre:"Hamburgo",     paisCodigo:"DE", observ:"Puerto principal"},
  {codigo:"DE-MUC", nombre:"Múnich",       paisCodigo:"DE", observ:""},
  {codigo:"NL-AMS", nombre:"Amsterdam",    paisCodigo:"NL", observ:""},
  {codigo:"NL-RTM", nombre:"Rotterdam",    paisCodigo:"NL", observ:"Mayor puerto europeo"},
  {codigo:"BE-BRU", nombre:"Bruselas",     paisCodigo:"BE", observ:""},
  {codigo:"BE-ANR", nombre:"Antwerp",      paisCodigo:"BE", observ:"Puerto principal"},
  {codigo:"GB-LON", nombre:"Londres",      paisCodigo:"GB", observ:""},
  {codigo:"GB-MAN", nombre:"Manchester",   paisCodigo:"GB", observ:""},
  {codigo:"CH-ZRH", nombre:"Zúrich",       paisCodigo:"CH", observ:""},
  {codigo:"AT-VIE", nombre:"Viena",        paisCodigo:"AT", observ:""},
  // EUROPA Norte / Báltico
  {codigo:"DK-CPH", nombre:"Copenhague",   paisCodigo:"DK", observ:""},
  {codigo:"SE-STO", nombre:"Estocolmo",    paisCodigo:"SE", observ:""},
  {codigo:"FI-HEL", nombre:"Helsinki",     paisCodigo:"FI", observ:""},
  {codigo:"NO-OSL", nombre:"Oslo",         paisCodigo:"NO", observ:""},
  // EUROPA del Este / Rusia
  {codigo:"RU-MOW", nombre:"Moscú",        paisCodigo:"RU", observ:""},
  {codigo:"RU-LED", nombre:"San Petersburgo", paisCodigo:"RU", observ:""},
  {codigo:"PL-WAW", nombre:"Varsovia",     paisCodigo:"PL", observ:""},
  {codigo:"TR-IST", nombre:"Estambul",     paisCodigo:"TR", observ:""},
  // ASIA — China (mercado clave cerezas)
  {codigo:"CN-PVG", nombre:"Shanghai",     paisCodigo:"CN", observ:"Mercado principal cerezas"},
  {codigo:"CN-PEK", nombre:"Beijing",      paisCodigo:"CN", observ:""},
  {codigo:"CN-CAN", nombre:"Guangzhou",    paisCodigo:"CN", observ:""},
  {codigo:"CN-SZX", nombre:"Shenzhen",     paisCodigo:"CN", observ:""},
  {codigo:"CN-NGB", nombre:"Ningbo",       paisCodigo:"CN", observ:""},
  {codigo:"HK-HKG", nombre:"Hong Kong",    paisCodigo:"HK", observ:""},
  {codigo:"TW-TPE", nombre:"Taipei",       paisCodigo:"TW", observ:""},
  // ASIA — Japón / Corea
  {codigo:"JP-TYO", nombre:"Tokio",        paisCodigo:"JP", observ:""},
  {codigo:"JP-OSA", nombre:"Osaka",        paisCodigo:"JP", observ:""},
  {codigo:"KR-SEL", nombre:"Seúl",         paisCodigo:"KR", observ:""},
  // ASIA — SE Asia / India
  {codigo:"SG-SIN", nombre:"Singapur",     paisCodigo:"SG", observ:"HUB regional"},
  {codigo:"MY-KUL", nombre:"Kuala Lumpur", paisCodigo:"MY", observ:""},
  {codigo:"TH-BKK", nombre:"Bangkok",      paisCodigo:"TH", observ:""},
  {codigo:"VN-SGN", nombre:"Ho Chi Minh",  paisCodigo:"VN", observ:""},
  {codigo:"PH-MNL", nombre:"Manila",       paisCodigo:"PH", observ:""},
  {codigo:"ID-JKT", nombre:"Yakarta",      paisCodigo:"ID", observ:""},
  {codigo:"IN-DEL", nombre:"Nueva Delhi",  paisCodigo:"IN", observ:""},
  {codigo:"IN-BOM", nombre:"Mumbai",       paisCodigo:"IN", observ:""},
  // MEDIO ORIENTE
  {codigo:"AE-DXB", nombre:"Dubai",        paisCodigo:"AE", observ:"HUB Medio Oriente"},
  {codigo:"AE-AUH", nombre:"Abu Dhabi",    paisCodigo:"AE", observ:""},
  {codigo:"SA-JED", nombre:"Jeddah",       paisCodigo:"SA", observ:""},
  {codigo:"SA-RUH", nombre:"Riad",         paisCodigo:"SA", observ:""},
  {codigo:"QA-DOH", nombre:"Doha",         paisCodigo:"QA", observ:""},
  {codigo:"IL-TLV", nombre:"Tel Aviv",     paisCodigo:"IL", observ:""},
  // ÁFRICA
  {codigo:"ZA-JNB", nombre:"Johannesburgo", paisCodigo:"ZA", observ:""},
  {codigo:"ZA-CPT", nombre:"Ciudad del Cabo", paisCodigo:"ZA", observ:""},
  {codigo:"EG-CAI", nombre:"El Cairo",     paisCodigo:"EG", observ:""},
  {codigo:"MA-CMN", nombre:"Casablanca",   paisCodigo:"MA", observ:""},
  // OCEANÍA
  {codigo:"AU-SYD", nombre:"Sydney",       paisCodigo:"AU", observ:""},
  {codigo:"AU-MEL", nombre:"Melbourne",    paisCodigo:"AU", observ:""},
  {codigo:"NZ-AKL", nombre:"Auckland",     paisCodigo:"NZ", observ:""},
];

// ═══════════════════════════════════════════════════════════════════
// PUERTOS — relevantes para fruta fresca (UN/LOCODE: PAÍS + 3 letras)
// ═══════════════════════════════════════════════════════════════════
export const PUERTOS_DEFAULT = [
  // CHILE (exportador principal)
  {codigo:"CLVAP", nombre:"Valparaíso",      paisCodigo:"CL", tipo:"Marítimo", ciudad:"Valparaíso"},
  {codigo:"CLSAI", nombre:"San Antonio",     paisCodigo:"CL", tipo:"Marítimo", ciudad:"San Antonio"},
  {codigo:"CLCNL", nombre:"Coronel",         paisCodigo:"CL", tipo:"Marítimo", ciudad:"Coronel"},
  {codigo:"CLLQN", nombre:"Lirquén",         paisCodigo:"CL", tipo:"Marítimo", ciudad:"Lirquén"},
  {codigo:"CLIQQ", nombre:"Iquique",         paisCodigo:"CL", tipo:"Marítimo", ciudad:"Iquique"},
  {codigo:"CLANF", nombre:"Antofagasta",     paisCodigo:"CL", tipo:"Marítimo", ciudad:"Antofagasta"},
  {codigo:"CLARI", nombre:"Arica",           paisCodigo:"CL", tipo:"Marítimo", ciudad:"Arica"},
  // PERÚ
  {codigo:"PECLL", nombre:"Callao",          paisCodigo:"PE", tipo:"Marítimo", ciudad:"Callao"},
  {codigo:"PEPAI", nombre:"Paita",           paisCodigo:"PE", tipo:"Marítimo", ciudad:"Paita"},
  {codigo:"PEMTV", nombre:"Matarani",        paisCodigo:"PE", tipo:"Marítimo", ciudad:"Matarani"},
  {codigo:"PESAL", nombre:"Salaverry",       paisCodigo:"PE", tipo:"Marítimo", ciudad:"Salaverry"},
  // BRASIL
  {codigo:"BRSSZ", nombre:"Santos",          paisCodigo:"BR", tipo:"Marítimo", ciudad:"Santos"},
  {codigo:"BRRIG", nombre:"Rio Grande",      paisCodigo:"BR", tipo:"Marítimo", ciudad:"Rio Grande"},
  {codigo:"BRPNG", nombre:"Paranaguá",       paisCodigo:"BR", tipo:"Marítimo", ciudad:"Paranaguá"},
  {codigo:"BRITJ", nombre:"Itajaí",          paisCodigo:"BR", tipo:"Marítimo", ciudad:"Itajaí"},
  {codigo:"BRSUA", nombre:"Suape",           paisCodigo:"BR", tipo:"Marítimo", ciudad:"Suape"},
  // ARGENTINA
  {codigo:"ARBUE", nombre:"Buenos Aires",    paisCodigo:"AR", tipo:"Marítimo", ciudad:"Buenos Aires"},
  {codigo:"ARROS", nombre:"Rosario",         paisCodigo:"AR", tipo:"Marítimo", ciudad:"Rosario"},
  {codigo:"ARZAE", nombre:"Zárate",          paisCodigo:"AR", tipo:"Marítimo", ciudad:"Zárate"},
  // ECUADOR / COLOMBIA
  {codigo:"ECGYE", nombre:"Guayaquil",       paisCodigo:"EC", tipo:"Marítimo", ciudad:"Guayaquil"},
  {codigo:"COCTG", nombre:"Cartagena",       paisCodigo:"CO", tipo:"Marítimo", ciudad:"Cartagena"},
  {codigo:"COBUN", nombre:"Buenaventura",    paisCodigo:"CO", tipo:"Marítimo", ciudad:"Buenaventura"},
  {codigo:"COBAQ", nombre:"Barranquilla",    paisCodigo:"CO", tipo:"Marítimo", ciudad:"Barranquilla"},
  // MÉXICO
  {codigo:"MXVER", nombre:"Veracruz",        paisCodigo:"MX", tipo:"Marítimo", ciudad:"Veracruz"},
  {codigo:"MXMZT", nombre:"Manzanillo",      paisCodigo:"MX", tipo:"Marítimo", ciudad:"Manzanillo"},
  {codigo:"MXATM", nombre:"Altamira",        paisCodigo:"MX", tipo:"Marítimo", ciudad:"Altamira"},
  {codigo:"MXLZC", nombre:"Lázaro Cárdenas", paisCodigo:"MX", tipo:"Marítimo", ciudad:"Lázaro Cárdenas"},
  // USA
  {codigo:"USLAX", nombre:"Los Angeles",     paisCodigo:"US", tipo:"Marítimo", ciudad:"Los Angeles"},
  {codigo:"USLGB", nombre:"Long Beach",      paisCodigo:"US", tipo:"Marítimo", ciudad:"Long Beach"},
  {codigo:"USOAK", nombre:"Oakland",         paisCodigo:"US", tipo:"Marítimo", ciudad:"Oakland"},
  {codigo:"USPHL", nombre:"Philadelphia",    paisCodigo:"US", tipo:"Marítimo", ciudad:"Philadelphia"},
  {codigo:"USNYC", nombre:"New York / NJ",   paisCodigo:"US", tipo:"Marítimo", ciudad:"New York"},
  {codigo:"USMIA", nombre:"Miami",           paisCodigo:"US", tipo:"Marítimo", ciudad:"Miami"},
  {codigo:"USHOU", nombre:"Houston",         paisCodigo:"US", tipo:"Marítimo", ciudad:"Houston"},
  {codigo:"USSAV", nombre:"Savannah",        paisCodigo:"US", tipo:"Marítimo", ciudad:"Savannah"},
  {codigo:"USCHS", nombre:"Charleston",      paisCodigo:"US", tipo:"Marítimo", ciudad:"Charleston"},
  // CANADÁ
  {codigo:"CAVAN", nombre:"Vancouver",       paisCodigo:"CA", tipo:"Marítimo", ciudad:"Vancouver"},
  {codigo:"CATOR", nombre:"Toronto",         paisCodigo:"CA", tipo:"Marítimo/Fluvial", ciudad:"Toronto"},
  {codigo:"CAMTR", nombre:"Montreal",        paisCodigo:"CA", tipo:"Marítimo", ciudad:"Montreal"},
  {codigo:"CAHAL", nombre:"Halifax",         paisCodigo:"CA", tipo:"Marítimo", ciudad:"Halifax"},
  // EUROPA — Norte
  {codigo:"NLRTM", nombre:"Rotterdam",       paisCodigo:"NL", tipo:"Marítimo", ciudad:"Rotterdam"},
  {codigo:"BEANR", nombre:"Antwerp",         paisCodigo:"BE", tipo:"Marítimo", ciudad:"Antwerp"},
  {codigo:"DEHAM", nombre:"Hamburgo",        paisCodigo:"DE", tipo:"Marítimo", ciudad:"Hamburgo"},
  {codigo:"DEBRV", nombre:"Bremerhaven",     paisCodigo:"DE", tipo:"Marítimo", ciudad:"Bremerhaven"},
  {codigo:"GBFXT", nombre:"Felixstowe",      paisCodigo:"GB", tipo:"Marítimo", ciudad:"Felixstowe"},
  {codigo:"GBLGP", nombre:"London Gateway",  paisCodigo:"GB", tipo:"Marítimo", ciudad:"Londres"},
  {codigo:"GBSOU", nombre:"Southampton",     paisCodigo:"GB", tipo:"Marítimo", ciudad:"Southampton"},
  {codigo:"FRLEH", nombre:"Le Havre",        paisCodigo:"FR", tipo:"Marítimo", ciudad:"Le Havre"},
  {codigo:"FRMRS", nombre:"Marsella",        paisCodigo:"FR", tipo:"Marítimo", ciudad:"Marsella"},
  {codigo:"NLAMS", nombre:"Amsterdam",       paisCodigo:"NL", tipo:"Marítimo", ciudad:"Amsterdam"},
  // EUROPA — Sur (Mediterráneo)
  {codigo:"ESALG", nombre:"Algeciras",       paisCodigo:"ES", tipo:"Marítimo", ciudad:"Algeciras"},
  {codigo:"ESVLC", nombre:"Valencia",        paisCodigo:"ES", tipo:"Marítimo", ciudad:"Valencia"},
  {codigo:"ESBCN", nombre:"Barcelona",       paisCodigo:"ES", tipo:"Marítimo", ciudad:"Barcelona"},
  {codigo:"ITGOA", nombre:"Génova",          paisCodigo:"IT", tipo:"Marítimo", ciudad:"Génova"},
  {codigo:"ITSPE", nombre:"La Spezia",       paisCodigo:"IT", tipo:"Marítimo", ciudad:"La Spezia"},
  {codigo:"ITLIV", nombre:"Livorno",         paisCodigo:"IT", tipo:"Marítimo", ciudad:"Livorno"},
  {codigo:"ITSAL", nombre:"Salerno",         paisCodigo:"IT", tipo:"Marítimo", ciudad:"Salerno"},
  {codigo:"PTLIS", nombre:"Lisboa",          paisCodigo:"PT", tipo:"Marítimo", ciudad:"Lisboa"},
  {codigo:"PTLEI", nombre:"Leixões",         paisCodigo:"PT", tipo:"Marítimo", ciudad:"Porto"},
  {codigo:"GRPIR", nombre:"Pireo",           paisCodigo:"GR", tipo:"Marítimo", ciudad:"Atenas"},
  // EUROPA — Báltico / Norte
  {codigo:"DKAAR", nombre:"Aarhus",          paisCodigo:"DK", tipo:"Marítimo", ciudad:"Aarhus"},
  {codigo:"SEGOT", nombre:"Gotemburgo",      paisCodigo:"SE", tipo:"Marítimo", ciudad:"Gotemburgo"},
  // RUSIA
  {codigo:"RUVVO", nombre:"Vladivostok",     paisCodigo:"RU", tipo:"Marítimo", ciudad:"Vladivostok"},
  {codigo:"RULED", nombre:"San Petersburgo", paisCodigo:"RU", tipo:"Marítimo", ciudad:"San Petersburgo"},
  {codigo:"RUNVS", nombre:"Novorossiysk",    paisCodigo:"RU", tipo:"Marítimo", ciudad:"Novorossiysk"},
  // ASIA — China
  {codigo:"CNSHA", nombre:"Shanghai",        paisCodigo:"CN", tipo:"Marítimo", ciudad:"Shanghai"},
  {codigo:"CNNGB", nombre:"Ningbo",          paisCodigo:"CN", tipo:"Marítimo", ciudad:"Ningbo"},
  {codigo:"CNQIN", nombre:"Qingdao",         paisCodigo:"CN", tipo:"Marítimo", ciudad:"Qingdao"},
  {codigo:"CNSZX", nombre:"Shenzhen",        paisCodigo:"CN", tipo:"Marítimo", ciudad:"Shenzhen"},
  {codigo:"CNGZH", nombre:"Guangzhou",       paisCodigo:"CN", tipo:"Marítimo", ciudad:"Guangzhou"},
  {codigo:"CNTAO", nombre:"Tianjin",         paisCodigo:"CN", tipo:"Marítimo", ciudad:"Tianjin"},
  {codigo:"CNDLC", nombre:"Dalian",          paisCodigo:"CN", tipo:"Marítimo", ciudad:"Dalian"},
  {codigo:"CNXMG", nombre:"Xiamen",          paisCodigo:"CN", tipo:"Marítimo", ciudad:"Xiamen"},
  // Hong Kong / Taiwán
  {codigo:"HKHKG", nombre:"Hong Kong",       paisCodigo:"HK", tipo:"Marítimo", ciudad:"Hong Kong"},
  {codigo:"TWKHH", nombre:"Kaohsiung",       paisCodigo:"TW", tipo:"Marítimo", ciudad:"Kaohsiung"},
  {codigo:"TWTPE", nombre:"Taipei",          paisCodigo:"TW", tipo:"Marítimo", ciudad:"Taipei"},
  // Japón / Corea
  {codigo:"JPYOK", nombre:"Yokohama",        paisCodigo:"JP", tipo:"Marítimo", ciudad:"Yokohama"},
  {codigo:"JPUKB", nombre:"Kobe",            paisCodigo:"JP", tipo:"Marítimo", ciudad:"Kobe"},
  {codigo:"JPTYO", nombre:"Tokio",           paisCodigo:"JP", tipo:"Marítimo", ciudad:"Tokio"},
  {codigo:"JPNGO", nombre:"Nagoya",          paisCodigo:"JP", tipo:"Marítimo", ciudad:"Nagoya"},
  {codigo:"JPOSA", nombre:"Osaka",           paisCodigo:"JP", tipo:"Marítimo", ciudad:"Osaka"},
  {codigo:"KRPUS", nombre:"Busan",           paisCodigo:"KR", tipo:"Marítimo", ciudad:"Busan"},
  {codigo:"KRINC", nombre:"Incheon",         paisCodigo:"KR", tipo:"Marítimo", ciudad:"Incheon"},
  // SE Asia
  {codigo:"SGSIN", nombre:"Singapur",        paisCodigo:"SG", tipo:"Marítimo", ciudad:"Singapur"},
  {codigo:"MYPKG", nombre:"Port Klang",      paisCodigo:"MY", tipo:"Marítimo", ciudad:"Port Klang"},
  {codigo:"MYTPP", nombre:"Tanjung Pelepas", paisCodigo:"MY", tipo:"Marítimo", ciudad:"Johor"},
  {codigo:"THLCH", nombre:"Laem Chabang",    paisCodigo:"TH", tipo:"Marítimo", ciudad:"Laem Chabang"},
  {codigo:"THBKK", nombre:"Bangkok",         paisCodigo:"TH", tipo:"Marítimo", ciudad:"Bangkok"},
  {codigo:"VNHPH", nombre:"Hai Phong",       paisCodigo:"VN", tipo:"Marítimo", ciudad:"Hai Phong"},
  {codigo:"VNSGN", nombre:"Ho Chi Minh",     paisCodigo:"VN", tipo:"Marítimo", ciudad:"Ho Chi Minh"},
  {codigo:"PHMNL", nombre:"Manila",          paisCodigo:"PH", tipo:"Marítimo", ciudad:"Manila"},
  {codigo:"IDJKT", nombre:"Tanjung Priok",   paisCodigo:"ID", tipo:"Marítimo", ciudad:"Yakarta"},
  // India / Pakistán
  {codigo:"INNSA", nombre:"Nhava Sheva",     paisCodigo:"IN", tipo:"Marítimo", ciudad:"Mumbai"},
  {codigo:"INMUN", nombre:"Mundra",          paisCodigo:"IN", tipo:"Marítimo", ciudad:"Mundra"},
  {codigo:"INCCU", nombre:"Calcuta",         paisCodigo:"IN", tipo:"Marítimo", ciudad:"Calcuta"},
  {codigo:"INMAA", nombre:"Chennai",         paisCodigo:"IN", tipo:"Marítimo", ciudad:"Chennai"},
  {codigo:"PKKHI", nombre:"Karachi",         paisCodigo:"PK", tipo:"Marítimo", ciudad:"Karachi"},
  // Medio Oriente
  {codigo:"AEJEA", nombre:"Jebel Ali",       paisCodigo:"AE", tipo:"Marítimo", ciudad:"Dubai"},
  {codigo:"AEAUH", nombre:"Abu Dhabi",       paisCodigo:"AE", tipo:"Marítimo", ciudad:"Abu Dhabi"},
  {codigo:"SAJED", nombre:"Jeddah",          paisCodigo:"SA", tipo:"Marítimo", ciudad:"Jeddah"},
  {codigo:"SADMM", nombre:"Dammam",          paisCodigo:"SA", tipo:"Marítimo", ciudad:"Dammam"},
  {codigo:"OMSLL", nombre:"Salalah",         paisCodigo:"OM", tipo:"Marítimo", ciudad:"Salalah"},
  {codigo:"QADOH", nombre:"Doha",            paisCodigo:"QA", tipo:"Marítimo", ciudad:"Doha"},
  {codigo:"ILHFA", nombre:"Haifa",           paisCodigo:"IL", tipo:"Marítimo", ciudad:"Haifa"},
  {codigo:"ILASH", nombre:"Ashdod",          paisCodigo:"IL", tipo:"Marítimo", ciudad:"Ashdod"},
  {codigo:"IRBND", nombre:"Bandar Abbas",    paisCodigo:"IR", tipo:"Marítimo", ciudad:"Bandar Abbas"},
  // ÁFRICA
  {codigo:"ZADUR", nombre:"Durban",          paisCodigo:"ZA", tipo:"Marítimo", ciudad:"Durban"},
  {codigo:"ZACPT", nombre:"Ciudad del Cabo", paisCodigo:"ZA", tipo:"Marítimo", ciudad:"Ciudad del Cabo"},
  {codigo:"EGALY", nombre:"Alejandría",      paisCodigo:"EG", tipo:"Marítimo", ciudad:"Alejandría"},
  {codigo:"EGPSD", nombre:"Port Said",       paisCodigo:"EG", tipo:"Marítimo", ciudad:"Port Said"},
  {codigo:"MACAS", nombre:"Casablanca",      paisCodigo:"MA", tipo:"Marítimo", ciudad:"Casablanca"},
  // OCEANÍA
  {codigo:"AUSYD", nombre:"Sydney",          paisCodigo:"AU", tipo:"Marítimo", ciudad:"Sydney"},
  {codigo:"AUMEL", nombre:"Melbourne",       paisCodigo:"AU", tipo:"Marítimo", ciudad:"Melbourne"},
  {codigo:"AUBNE", nombre:"Brisbane",        paisCodigo:"AU", tipo:"Marítimo", ciudad:"Brisbane"},
  {codigo:"NZAKL", nombre:"Auckland",        paisCodigo:"NZ", tipo:"Marítimo", ciudad:"Auckland"},
];

// ═══════════════════════════════════════════════════════════════════
// AEROPUERTOS — IATA principales para carga aérea de fruta fresca
// ═══════════════════════════════════════════════════════════════════
export const AEROPUERTOS_DEFAULT = [
  // SUDAMÉRICA
  {codigo:"SCL", nombre:"Aeropuerto Arturo Merino Benítez", paisCodigo:"CL", ciudad:"Santiago"},
  {codigo:"LIM", nombre:"Jorge Chávez Internacional",       paisCodigo:"PE", ciudad:"Lima"},
  {codigo:"GRU", nombre:"Guarulhos",                        paisCodigo:"BR", ciudad:"São Paulo"},
  {codigo:"GIG", nombre:"Galeão",                           paisCodigo:"BR", ciudad:"Rio de Janeiro"},
  {codigo:"VCP", nombre:"Viracopos",                        paisCodigo:"BR", ciudad:"Campinas"},
  {codigo:"EZE", nombre:"Ministro Pistarini",               paisCodigo:"AR", ciudad:"Buenos Aires"},
  {codigo:"BOG", nombre:"El Dorado",                        paisCodigo:"CO", ciudad:"Bogotá"},
  {codigo:"UIO", nombre:"Mariscal Sucre",                   paisCodigo:"EC", ciudad:"Quito"},
  {codigo:"GYE", nombre:"José Joaquín de Olmedo",           paisCodigo:"EC", ciudad:"Guayaquil"},
  // NORTEAMÉRICA
  {codigo:"MIA", nombre:"Miami International",              paisCodigo:"US", ciudad:"Miami"},
  {codigo:"JFK", nombre:"John F. Kennedy",                  paisCodigo:"US", ciudad:"New York"},
  {codigo:"LAX", nombre:"Los Angeles International",        paisCodigo:"US", ciudad:"Los Angeles"},
  {codigo:"ORD", nombre:"O'Hare",                           paisCodigo:"US", ciudad:"Chicago"},
  {codigo:"ATL", nombre:"Hartsfield–Jackson",               paisCodigo:"US", ciudad:"Atlanta"},
  {codigo:"DFW", nombre:"Dallas-Fort Worth",                paisCodigo:"US", ciudad:"Dallas"},
  {codigo:"SFO", nombre:"San Francisco International",      paisCodigo:"US", ciudad:"San Francisco"},
  {codigo:"IAH", nombre:"George Bush Intercontinental",     paisCodigo:"US", ciudad:"Houston"},
  {codigo:"PHL", nombre:"Philadelphia International",       paisCodigo:"US", ciudad:"Philadelphia"},
  {codigo:"YYZ", nombre:"Pearson",                          paisCodigo:"CA", ciudad:"Toronto"},
  {codigo:"YVR", nombre:"Vancouver International",          paisCodigo:"CA", ciudad:"Vancouver"},
  {codigo:"MEX", nombre:"Benito Juárez",                    paisCodigo:"MX", ciudad:"Ciudad de México"},
  // EUROPA
  {codigo:"AMS", nombre:"Schiphol",                         paisCodigo:"NL", ciudad:"Amsterdam"},
  {codigo:"FRA", nombre:"Frankfurt am Main",                paisCodigo:"DE", ciudad:"Frankfurt"},
  {codigo:"MUC", nombre:"Múnich",                           paisCodigo:"DE", ciudad:"Múnich"},
  {codigo:"LHR", nombre:"Heathrow",                         paisCodigo:"GB", ciudad:"Londres"},
  {codigo:"LGW", nombre:"Gatwick",                          paisCodigo:"GB", ciudad:"Londres"},
  {codigo:"CDG", nombre:"Charles de Gaulle",                paisCodigo:"FR", ciudad:"París"},
  {codigo:"ORY", nombre:"Orly",                             paisCodigo:"FR", ciudad:"París"},
  {codigo:"MAD", nombre:"Adolfo Suárez Madrid-Barajas",     paisCodigo:"ES", ciudad:"Madrid"},
  {codigo:"BCN", nombre:"El Prat",                          paisCodigo:"ES", ciudad:"Barcelona"},
  {codigo:"FCO", nombre:"Fiumicino",                        paisCodigo:"IT", ciudad:"Roma"},
  {codigo:"MXP", nombre:"Malpensa",                         paisCodigo:"IT", ciudad:"Milán"},
  {codigo:"BRU", nombre:"Bruselas Zaventem",                paisCodigo:"BE", ciudad:"Bruselas"},
  {codigo:"LIS", nombre:"Humberto Delgado",                 paisCodigo:"PT", ciudad:"Lisboa"},
  {codigo:"VIE", nombre:"Schwechat",                        paisCodigo:"AT", ciudad:"Viena"},
  {codigo:"ZRH", nombre:"Zúrich",                           paisCodigo:"CH", ciudad:"Zúrich"},
  {codigo:"CPH", nombre:"Copenhague",                       paisCodigo:"DK", ciudad:"Copenhague"},
  {codigo:"ARN", nombre:"Arlanda",                          paisCodigo:"SE", ciudad:"Estocolmo"},
  {codigo:"HEL", nombre:"Helsinki-Vantaa",                  paisCodigo:"FI", ciudad:"Helsinki"},
  {codigo:"IST", nombre:"Istanbul",                         paisCodigo:"TR", ciudad:"Estambul"},
  {codigo:"SVO", nombre:"Sheremetyevo",                     paisCodigo:"RU", ciudad:"Moscú"},
  // ASIA
  {codigo:"PVG", nombre:"Pudong",                           paisCodigo:"CN", ciudad:"Shanghai"},
  {codigo:"PEK", nombre:"Capital",                          paisCodigo:"CN", ciudad:"Beijing"},
  {codigo:"CAN", nombre:"Baiyun",                           paisCodigo:"CN", ciudad:"Guangzhou"},
  {codigo:"SZX", nombre:"Bao'an",                           paisCodigo:"CN", ciudad:"Shenzhen"},
  {codigo:"HKG", nombre:"Hong Kong International",          paisCodigo:"HK", ciudad:"Hong Kong"},
  {codigo:"TPE", nombre:"Taoyuan",                          paisCodigo:"TW", ciudad:"Taipei"},
  {codigo:"NRT", nombre:"Narita",                           paisCodigo:"JP", ciudad:"Tokio"},
  {codigo:"HND", nombre:"Haneda",                           paisCodigo:"JP", ciudad:"Tokio"},
  {codigo:"KIX", nombre:"Kansai",                           paisCodigo:"JP", ciudad:"Osaka"},
  {codigo:"ICN", nombre:"Incheon",                          paisCodigo:"KR", ciudad:"Seúl"},
  {codigo:"SIN", nombre:"Changi",                           paisCodigo:"SG", ciudad:"Singapur"},
  {codigo:"KUL", nombre:"Kuala Lumpur",                     paisCodigo:"MY", ciudad:"Kuala Lumpur"},
  {codigo:"BKK", nombre:"Suvarnabhumi",                     paisCodigo:"TH", ciudad:"Bangkok"},
  {codigo:"SGN", nombre:"Tan Son Nhat",                     paisCodigo:"VN", ciudad:"Ho Chi Minh"},
  {codigo:"MNL", nombre:"Ninoy Aquino",                     paisCodigo:"PH", ciudad:"Manila"},
  {codigo:"CGK", nombre:"Soekarno-Hatta",                   paisCodigo:"ID", ciudad:"Yakarta"},
  {codigo:"DEL", nombre:"Indira Gandhi",                    paisCodigo:"IN", ciudad:"Nueva Delhi"},
  {codigo:"BOM", nombre:"Chhatrapati Shivaji",              paisCodigo:"IN", ciudad:"Mumbai"},
  {codigo:"BLR", nombre:"Kempegowda",                       paisCodigo:"IN", ciudad:"Bangalore"},
  // MEDIO ORIENTE
  {codigo:"DXB", nombre:"Dubai International",              paisCodigo:"AE", ciudad:"Dubai"},
  {codigo:"AUH", nombre:"Abu Dhabi International",          paisCodigo:"AE", ciudad:"Abu Dhabi"},
  {codigo:"DOH", nombre:"Hamad",                            paisCodigo:"QA", ciudad:"Doha"},
  {codigo:"JED", nombre:"King Abdulaziz",                   paisCodigo:"SA", ciudad:"Jeddah"},
  {codigo:"RUH", nombre:"King Khalid",                      paisCodigo:"SA", ciudad:"Riad"},
  {codigo:"TLV", nombre:"Ben Gurion",                       paisCodigo:"IL", ciudad:"Tel Aviv"},
  {codigo:"KWI", nombre:"Kuwait International",             paisCodigo:"KW", ciudad:"Kuwait"},
  {codigo:"BAH", nombre:"Bahrain International",            paisCodigo:"BH", ciudad:"Manama"},
  // ÁFRICA
  {codigo:"JNB", nombre:"O. R. Tambo",                      paisCodigo:"ZA", ciudad:"Johannesburgo"},
  {codigo:"CPT", nombre:"Cape Town International",          paisCodigo:"ZA", ciudad:"Ciudad del Cabo"},
  {codigo:"CAI", nombre:"Cairo International",              paisCodigo:"EG", ciudad:"El Cairo"},
  {codigo:"CMN", nombre:"Mohammed V",                       paisCodigo:"MA", ciudad:"Casablanca"},
  {codigo:"NBO", nombre:"Jomo Kenyatta",                    paisCodigo:"KE", ciudad:"Nairobi"},
  // OCEANÍA
  {codigo:"SYD", nombre:"Kingsford Smith",                  paisCodigo:"AU", ciudad:"Sydney"},
  {codigo:"MEL", nombre:"Tullamarine",                      paisCodigo:"AU", ciudad:"Melbourne"},
  {codigo:"BNE", nombre:"Brisbane",                         paisCodigo:"AU", ciudad:"Brisbane"},
  {codigo:"AKL", nombre:"Auckland International",           paisCodigo:"NZ", ciudad:"Auckland"},
];

// ═══════════════════════════════════════════════════════════════════
// SHIPPING LINES — principales navieras globales
// ═══════════════════════════════════════════════════════════════════
export const SHIPPING_LINES_DEFAULT = [
  {codigo:"MAEU", nombre:"Maersk Line",            paisCodigo:"DK", website:"maersk.com",         observ:"Líder mundial, fuerte en reefer"},
  {codigo:"MSCU", nombre:"MSC",                    paisCodigo:"CH", website:"msc.com",            observ:"Segunda más grande del mundo"},
  {codigo:"CMDU", nombre:"CMA CGM",                paisCodigo:"FR", website:"cma-cgm.com",        observ:"Tercera global"},
  {codigo:"HLCU", nombre:"Hapag-Lloyd",            paisCodigo:"DE", website:"hapag-lloyd.com",    observ:"Fuerte en Atlántico Norte"},
  {codigo:"COSU", nombre:"COSCO Shipping",         paisCodigo:"CN", website:"coscoshipping.com",  observ:"China estatal"},
  {codigo:"ONEY", nombre:"Ocean Network Express (ONE)", paisCodigo:"SG", website:"one-line.com",  observ:"Joint venture japonesa"},
  {codigo:"EGLV", nombre:"Evergreen Marine",       paisCodigo:"TW", website:"evergreen-marine.com", observ:"Taiwán"},
  {codigo:"ZIMU", nombre:"ZIM",                    paisCodigo:"IL", website:"zim.com",            observ:"Israel"},
  {codigo:"YMLU", nombre:"Yang Ming Marine",       paisCodigo:"TW", website:"yangming.com",       observ:"Taiwán"},
  {codigo:"HDMU", nombre:"HMM (Hyundai)",          paisCodigo:"KR", website:"hmm21.com",          observ:"Corea del Sur"},
  {codigo:"PILU", nombre:"PIL (Pacific International Lines)", paisCodigo:"SG", website:"pilship.com", observ:"Singapur"},
  {codigo:"WHLC", nombre:"Wan Hai Lines",          paisCodigo:"TW", website:"wanhai.com",         observ:"Intra-Asia fuerte"},
  {codigo:"OOLU", nombre:"OOCL",                   paisCodigo:"HK", website:"oocl.com",           observ:"Subsidiaria COSCO"},
  {codigo:"OOLI", nombre:"APL (CMA CGM Group)",    paisCodigo:"SG", website:"apl.com",            observ:"Subsidiaria CMA CGM"},
  {codigo:"SUDU", nombre:"Hamburg Süd",            paisCodigo:"DE", website:"hamburgsud-line.com", observ:"Subsidiaria Maersk, fuerte reefer SudAm"},
];

// ═══════════════════════════════════════════════════════════════════
// LÍNEAS AÉREAS — cargueras relevantes para fruta fresca perecedera
// Códigos: IATA (2 letras) cuando aplica + ICAO (3 letras) opcional
// ═══════════════════════════════════════════════════════════════════
export const LINEAS_AEREAS_DEFAULT = [
  // Cargueras puras (todo-carga)
  {codigo:"CV", nombre:"Cargolux",                paisCodigo:"LU", website:"cargolux.com",          observ:"Carguera pura, hub Luxemburgo"},
  {codigo:"FX", nombre:"FedEx Express",           paisCodigo:"US", website:"fedex.com",             observ:"Red global express"},
  {codigo:"5X", nombre:"UPS Airlines",            paisCodigo:"US", website:"ups.com",               observ:"Red global express"},
  {codigo:"D0", nombre:"DHL Aviation",            paisCodigo:"DE", website:"dhl.com",               observ:"Carguera express global"},
  // Cargueras de aerolíneas comerciales — Sudamérica (clave para Chile/Perú)
  {codigo:"LA", nombre:"LATAM Cargo",             paisCodigo:"CL", website:"latamcargo.com",        observ:"Principal exportación fruta Chile/Perú"},
  {codigo:"AV", nombre:"Avianca Cargo",           paisCodigo:"CO", website:"aviancacargo.com",      observ:""},
  {codigo:"AM", nombre:"Aeroméxico Cargo",        paisCodigo:"MX", website:"aeromexicocargo.com",   observ:""},
  // Medio Oriente — hubs clave hacia Asia
  {codigo:"EK", nombre:"Emirates SkyCargo",       paisCodigo:"AE", website:"emirates.com/cargo",    observ:"Hub Dubai, fuerte en perecederos"},
  {codigo:"QR", nombre:"Qatar Airways Cargo",     paisCodigo:"QA", website:"qrcargo.com",           observ:"Hub Doha"},
  {codigo:"EY", nombre:"Etihad Cargo",            paisCodigo:"AE", website:"etihadcargo.com",       observ:"Hub Abu Dhabi"},
  {codigo:"TK", nombre:"Turkish Cargo",           paisCodigo:"TR", website:"turkishcargo.com",      observ:"Hub Estambul, red amplia"},
  // Europa
  {codigo:"LH", nombre:"Lufthansa Cargo",         paisCodigo:"DE", website:"lufthansa-cargo.com",   observ:"Hub Frankfurt, líder europea"},
  {codigo:"KL", nombre:"KLM Cargo",               paisCodigo:"NL", website:"afklcargo.com",         observ:"Hub Amsterdam"},
  {codigo:"AF", nombre:"Air France Cargo",        paisCodigo:"FR", website:"afklcargo.com",         observ:"Hub París CDG"},
  {codigo:"BA", nombre:"IAG Cargo (BA)",          paisCodigo:"GB", website:"iagcargo.com",          observ:"Hub Londres LHR"},
  {codigo:"IB", nombre:"IAG Cargo (Iberia)",      paisCodigo:"ES", website:"iagcargo.com",          observ:"Hub Madrid, fuerte LATAM"},
  // Asia
  {codigo:"CX", nombre:"Cathay Pacific Cargo",    paisCodigo:"HK", website:"cathaycargo.com",       observ:"Hub Hong Kong"},
  {codigo:"SQ", nombre:"Singapore Airlines Cargo",paisCodigo:"SG", website:"siacargo.com",          observ:"Hub Singapur"},
  {codigo:"KE", nombre:"Korean Air Cargo",        paisCodigo:"KR", website:"cargo.koreanair.com",   observ:"Hub Incheon"},
  {codigo:"CZ", nombre:"China Southern Cargo",    paisCodigo:"CN", website:"csair.com",             observ:"Hub Guangzhou"},
  {codigo:"CI", nombre:"China Airlines Cargo",    paisCodigo:"TW", website:"china-airlines.com",    observ:"Hub Taipei"},
  {codigo:"NH", nombre:"ANA Cargo",               paisCodigo:"JP", website:"anacargo.jp",           observ:"Hub Narita"},
  // USA pasajeros con división cargo
  {codigo:"AA", nombre:"American Airlines Cargo", paisCodigo:"US", website:"aacargo.com",           observ:"Hub Miami / DFW"},
  {codigo:"UA", nombre:"United Cargo",            paisCodigo:"US", website:"unitedcargo.com",       observ:""},
  {codigo:"DL", nombre:"Delta Cargo",             paisCodigo:"US", website:"deltacargo.com",        observ:""},
];

// ═══════════════════════════════════════════════════════════════════
// TIPOS DE EMBARQUE
// ═══════════════════════════════════════════════════════════════════
export const TIPOS_EMBARQUE_DEFAULT = [
  {codigo:"MAR-FCL",  nombre:"Marítimo FCL",        descripcion:"Contenedor completo (Full Container Load)", icono:"🚢"},
  {codigo:"MAR-LCL",  nombre:"Marítimo LCL",        descripcion:"Carga consolidada (Less than Container Load)", icono:"📦"},
  {codigo:"MAR-REF",  nombre:"Marítimo Refrigerado",descripcion:"Contenedor reefer para fruta fresca", icono:"❄️"},
  {codigo:"AER-CARG", nombre:"Aéreo Carga",         descripcion:"Carga aérea estándar", icono:"✈️"},
  {codigo:"AER-PER",  nombre:"Aéreo Perecibles",    descripcion:"Carga aérea perecedera con cadena de frío", icono:"🌡️"},
  {codigo:"TER-CAM",  nombre:"Terrestre Camión",    descripcion:"Transporte terrestre en camión", icono:"🚛"},
  {codigo:"TER-REF",  nombre:"Terrestre Refrigerado", descripcion:"Camión refrigerado", icono:"🧊"},
  {codigo:"MULT",     nombre:"Multimodal",          descripcion:"Combinación de modos de transporte", icono:"🔄"},
];

// ═══════════════════════════════════════════════════════════════════
// TIPOS DE EMBALAJE — base, parametrizable por especie
// ═══════════════════════════════════════════════════════════════════
export const TIPOS_EMBALAJE_DEFAULT = [
  // CEREZAS
  {codigo:"CHE-5KG-CB", nombre:"Caja Cereza 5kg",        especieCodigo:"CHE", kgPorUnidad:5.0,  unidad:"kg", observ:"Caja exportación estándar"},
  {codigo:"CHE-25KG",   nombre:"Caja Cereza 2.5kg",      especieCodigo:"CHE", kgPorUnidad:2.5,  unidad:"kg", observ:""},
  {codigo:"CHE-CLAM",   nombre:"Clamshell 500g × 10",    especieCodigo:"CHE", kgPorUnidad:5.0,  unidad:"kg", observ:"Retail-ready"},
  // ARÁNDANOS
  {codigo:"BLB-125GR",  nombre:"Clamshell 125g × 12",    especieCodigo:"BLB", kgPorUnidad:1.5,  unidad:"kg", observ:"Retail Asia/EU"},
  {codigo:"BLB-PINT",   nombre:"Pint × 12",              especieCodigo:"BLB", kgPorUnidad:2.04, unidad:"kg", observ:"USA - pint 170g"},
  {codigo:"BLB-6OZ",    nombre:"Clamshell 6oz × 12",     especieCodigo:"BLB", kgPorUnidad:2.04, unidad:"kg", observ:"USA estándar"},
  {codigo:"BLB-18OZ",   nombre:"Clamshell 18oz × 8",     especieCodigo:"BLB", kgPorUnidad:4.08, unidad:"kg", observ:"USA familiar"},
  // UVAS
  {codigo:"GRP-82KG",   nombre:"Caja Uva 8.2kg",         especieCodigo:"GRP", kgPorUnidad:8.2,  unidad:"kg", observ:"USA"},
  {codigo:"GRP-5KG",    nombre:"Caja Uva 5kg",           especieCodigo:"GRP", kgPorUnidad:5.0,  unidad:"kg", observ:"Europa"},
  // CIRUELAS
  {codigo:"PLM-5KG",    nombre:"Caja Ciruela 5kg",       especieCodigo:"PLM", kgPorUnidad:5.0,  unidad:"kg", observ:""},
  // KIWI
  {codigo:"KWI-3KG",    nombre:"Caja Kiwi 3kg",          especieCodigo:"KWI", kgPorUnidad:3.0,  unidad:"kg", observ:""},
  // PALTAS
  {codigo:"AVO-4KG",    nombre:"Caja Palta 4kg",         especieCodigo:"AVO", kgPorUnidad:4.0,  unidad:"kg", observ:""},
];

// ═══════════════════════════════════════════════════════════════════
// MERCADOS DE DESTINO — agrupaciones comerciales
// ═══════════════════════════════════════════════════════════════════
export const MERCADOS_DEFAULT = [
  // Norteamérica
  {codigo:"USA",   nombre:"Estados Unidos",        region:"Norteamérica", paisesCodigos:["US"]},
  {codigo:"CAN",   nombre:"Canadá",                region:"Norteamérica", paisesCodigos:["CA"]},
  {codigo:"MEX",   nombre:"México",                region:"Norteamérica", paisesCodigos:["MX"]},
  // Europa Occidental — separados por país para precios/condiciones distintas
  {codigo:"UK",    nombre:"Reino Unido",           region:"Europa",       paisesCodigos:["GB"]},
  {codigo:"DE",    nombre:"Alemania",              region:"Europa",       paisesCodigos:["DE"]},
  {codigo:"NL",    nombre:"Países Bajos",          region:"Europa",       paisesCodigos:["NL"]},
  {codigo:"FR",    nombre:"Francia",               region:"Europa",       paisesCodigos:["FR"]},
  {codigo:"ES",    nombre:"España",                region:"Europa",       paisesCodigos:["ES"]},
  {codigo:"IT",    nombre:"Italia",                region:"Europa",       paisesCodigos:["IT"]},
  {codigo:"BE",    nombre:"Bélgica",               region:"Europa",       paisesCodigos:["BE"]},
  {codigo:"PT",    nombre:"Portugal",              region:"Europa",       paisesCodigos:["PT"]},
  {codigo:"IE",    nombre:"Irlanda",               region:"Europa",       paisesCodigos:["IE"]},
  {codigo:"CH",    nombre:"Suiza",                 region:"Europa",       paisesCodigos:["CH"]},
  {codigo:"AT",    nombre:"Austria",               region:"Europa",       paisesCodigos:["AT"]},
  // Europa Nórdica
  {codigo:"DK",    nombre:"Dinamarca",             region:"Europa",       paisesCodigos:["DK"]},
  {codigo:"SE",    nombre:"Suecia",                region:"Europa",       paisesCodigos:["SE"]},
  {codigo:"NO",    nombre:"Noruega",               region:"Europa",       paisesCodigos:["NO"]},
  {codigo:"FI",    nombre:"Finlandia",             region:"Europa",       paisesCodigos:["FI"]},
  // Europa Sur / Este
  {codigo:"GR",    nombre:"Grecia",                region:"Europa",       paisesCodigos:["GR"]},
  {codigo:"PL",    nombre:"Polonia",               region:"Europa",       paisesCodigos:["PL"]},
  {codigo:"CZ",    nombre:"República Checa",       region:"Europa",       paisesCodigos:["CZ"]},
  {codigo:"HU",    nombre:"Hungría",               region:"Europa",       paisesCodigos:["HU"]},
  {codigo:"RO",    nombre:"Rumania",               region:"Europa",       paisesCodigos:["RO"]},
  // Eurasia
  {codigo:"RU",    nombre:"Rusia",                 region:"Europa/Asia",  paisesCodigos:["RU"]},
  {codigo:"UA",    nombre:"Ucrania",               region:"Europa",       paisesCodigos:["UA"]},
  {codigo:"TR",    nombre:"Turquía",               region:"Europa/Asia",  paisesCodigos:["TR"]},
  // Asia
  {codigo:"CHN",   nombre:"China Continental",     region:"Asia",         paisesCodigos:["CN"]},
  {codigo:"HK",    nombre:"Hong Kong",             region:"Asia",         paisesCodigos:["HK"]},
  {codigo:"TW",    nombre:"Taiwán",                region:"Asia",         paisesCodigos:["TW"]},
  {codigo:"JP",    nombre:"Japón",                 region:"Asia",         paisesCodigos:["JP"]},
  {codigo:"KR",    nombre:"Corea del Sur",         region:"Asia",         paisesCodigos:["KR"]},
  {codigo:"SG",    nombre:"Singapur",              region:"Asia",         paisesCodigos:["SG"]},
  {codigo:"MY",    nombre:"Malasia",               region:"Asia",         paisesCodigos:["MY"]},
  {codigo:"TH",    nombre:"Tailandia",             region:"Asia",         paisesCodigos:["TH"]},
  {codigo:"VN",    nombre:"Vietnam",               region:"Asia",         paisesCodigos:["VN"]},
  {codigo:"PH",    nombre:"Filipinas",             region:"Asia",         paisesCodigos:["PH"]},
  {codigo:"ID",    nombre:"Indonesia",             region:"Asia",         paisesCodigos:["ID"]},
  {codigo:"IND",   nombre:"India",                 region:"Asia",         paisesCodigos:["IN"]},
  // Medio Oriente — separados por país por practicidad logística
  {codigo:"AE",    nombre:"Emiratos Árabes Unidos",region:"Medio Oriente",paisesCodigos:["AE"]},
  {codigo:"SA",    nombre:"Arabia Saudita",        region:"Medio Oriente",paisesCodigos:["SA"]},
  {codigo:"QA",    nombre:"Catar",                 region:"Medio Oriente",paisesCodigos:["QA"]},
  {codigo:"KW",    nombre:"Kuwait",                region:"Medio Oriente",paisesCodigos:["KW"]},
  {codigo:"IL",    nombre:"Israel",                region:"Medio Oriente",paisesCodigos:["IL"]},
  {codigo:"OM",    nombre:"Omán",                  region:"Medio Oriente",paisesCodigos:["OM"]},
  {codigo:"BH",    nombre:"Baréin",                region:"Medio Oriente",paisesCodigos:["BH"]},
  // África
  {codigo:"ZA",    nombre:"Sudáfrica",             region:"África",       paisesCodigos:["ZA"]},
  {codigo:"EG",    nombre:"Egipto",                region:"África",       paisesCodigos:["EG"]},
  {codigo:"MA",    nombre:"Marruecos",             region:"África",       paisesCodigos:["MA"]},
  {codigo:"KE",    nombre:"Kenia",                 region:"África",       paisesCodigos:["KE"]},
  {codigo:"NG",    nombre:"Nigeria",               region:"África",       paisesCodigos:["NG"]},
  // Oceanía
  {codigo:"AU",    nombre:"Australia",             region:"Oceanía",      paisesCodigos:["AU"]},
  {codigo:"NZ",    nombre:"Nueva Zelanda",         region:"Oceanía",      paisesCodigos:["NZ"]},
  // Sudamérica (otros mercados destino)
  {codigo:"BR",    nombre:"Brasil",                region:"Sudamérica",   paisesCodigos:["BR"]},
  {codigo:"CO",    nombre:"Colombia",              region:"Sudamérica",   paisesCodigos:["CO"]},
  {codigo:"EC",    nombre:"Ecuador",               region:"Sudamérica",   paisesCodigos:["EC"]},
  {codigo:"VE",    nombre:"Venezuela",             region:"Sudamérica",   paisesCodigos:["VE"]},
  {codigo:"PA",    nombre:"Panamá",                region:"Sudamérica",   paisesCodigos:["PA"]},
  {codigo:"CR",    nombre:"Costa Rica",            region:"Sudamérica",   paisesCodigos:["CR"]},
  // Doméstico
  {codigo:"DOM",   nombre:"Doméstico",             region:"Local",        paisesCodigos:[]},
];

// ═══════════════════════════════════════════════════════════════════
// MONEDAS (ISO 4217)
// ═══════════════════════════════════════════════════════════════════
export const MONEDAS_DEFAULT = [
  {codigo:"USD", nombre:"Dólar Estadounidense",   simbolo:"US$",  paisCodigo:"US", default:true},
  {codigo:"EUR", nombre:"Euro",                   simbolo:"€",    paisCodigo:"DE", default:false},
  {codigo:"GBP", nombre:"Libra Esterlina",        simbolo:"£",    paisCodigo:"GB", default:false},
  {codigo:"CLP", nombre:"Peso Chileno",           simbolo:"$",    paisCodigo:"CL", default:false},
  {codigo:"PEN", nombre:"Sol Peruano",            simbolo:"S/",   paisCodigo:"PE", default:false},
  {codigo:"BRL", nombre:"Real Brasileño",         simbolo:"R$",   paisCodigo:"BR", default:false},
  {codigo:"ARS", nombre:"Peso Argentino",         simbolo:"$",    paisCodigo:"AR", default:false},
  {codigo:"MXN", nombre:"Peso Mexicano",          simbolo:"$",    paisCodigo:"MX", default:false},
  {codigo:"COP", nombre:"Peso Colombiano",        simbolo:"$",    paisCodigo:"CO", default:false},
  {codigo:"CNY", nombre:"Yuan Renminbi",          simbolo:"¥",    paisCodigo:"CN", default:false},
  {codigo:"HKD", nombre:"Dólar de Hong Kong",     simbolo:"HK$",  paisCodigo:"HK", default:false},
  {codigo:"JPY", nombre:"Yen Japonés",            simbolo:"¥",    paisCodigo:"JP", default:false},
  {codigo:"KRW", nombre:"Won Coreano",            simbolo:"₩",    paisCodigo:"KR", default:false},
  {codigo:"SGD", nombre:"Dólar de Singapur",      simbolo:"S$",   paisCodigo:"SG", default:false},
  {codigo:"AED", nombre:"Dírham EAU",             simbolo:"د.إ",  paisCodigo:"AE", default:false},
  {codigo:"SAR", nombre:"Riyal Saudí",            simbolo:"﷼",   paisCodigo:"SA", default:false},
  {codigo:"ILS", nombre:"Shéquel Israelí",        simbolo:"₪",    paisCodigo:"IL", default:false},
  {codigo:"AUD", nombre:"Dólar Australiano",      simbolo:"A$",   paisCodigo:"AU", default:false},
  {codigo:"CAD", nombre:"Dólar Canadiense",       simbolo:"C$",   paisCodigo:"CA", default:false},
  {codigo:"CHF", nombre:"Franco Suizo",           simbolo:"CHF",  paisCodigo:"CH", default:false},
  {codigo:"RUB", nombre:"Rublo Ruso",             simbolo:"₽",    paisCodigo:"RU", default:false},
  {codigo:"INR", nombre:"Rupia India",            simbolo:"₹",    paisCodigo:"IN", default:false},
];

// ═══════════════════════════════════════════════════════════════════
// ESPECIES (Fase 2) — catálogo normalizado de frutas exportadas
// Reemplaza el string libre `especie` que vive en TIPOS_EMBALAJE_DEFAULT.
// ═══════════════════════════════════════════════════════════════════
export const ESPECIES_DEFAULT = [
  {codigo:"CHE", nombreEs:"Cerezas",     nombreEn:"Cherries",     icono:"🍒", familia:"Carozos",    kgPorCajaDefault:5.0,  unidadComercial:"kg", temporadaInicio:"Nov", temporadaFin:"Feb", observ:"Especie principal Allegria"},
  {codigo:"BLB", nombreEs:"Arándanos",   nombreEn:"Blueberries",  icono:"🫐", familia:"Berries",    kgPorCajaDefault:1.5,  unidadComercial:"kg", temporadaInicio:"Oct", temporadaFin:"Mar", observ:"Allpa Perú + Chile"},
  {codigo:"GRP", nombreEs:"Uvas",        nombreEn:"Grapes",       icono:"🍇", familia:"Berries",    kgPorCajaDefault:8.2,  unidadComercial:"kg", temporadaInicio:"Dic", temporadaFin:"Abr", observ:""},
  {codigo:"PLM", nombreEs:"Ciruelas",    nombreEn:"Plums",        icono:"🟣", familia:"Carozos",    kgPorCajaDefault:5.0,  unidadComercial:"kg", temporadaInicio:"Dic", temporadaFin:"Mar", observ:"Sin emoji oficial — se usa círculo morado"},
  {codigo:"PCH", nombreEs:"Duraznos",    nombreEn:"Peaches",      icono:"🍑", familia:"Carozos",    kgPorCajaDefault:5.0,  unidadComercial:"kg", temporadaInicio:"Nov", temporadaFin:"Feb", observ:""},
  {codigo:"NCT", nombreEs:"Nectarinas",  nombreEn:"Nectarines",   icono:"🍑", familia:"Carozos",    kgPorCajaDefault:5.0,  unidadComercial:"kg", temporadaInicio:"Nov", temporadaFin:"Feb", observ:""},
  {codigo:"KWI", nombreEs:"Kiwi",        nombreEn:"Kiwifruit",    icono:"🥝", familia:"Otros",      kgPorCajaDefault:3.0,  unidadComercial:"kg", temporadaInicio:"Abr", temporadaFin:"Oct", observ:""},
  {codigo:"AVO", nombreEs:"Paltas",      nombreEn:"Avocados",     icono:"🥑", familia:"Tropicales", kgPorCajaDefault:4.0,  unidadComercial:"kg", temporadaInicio:"Jul", temporadaFin:"Mar", observ:""},
  {codigo:"APL", nombreEs:"Manzanas",    nombreEn:"Apples",       icono:"🍎", familia:"Pomáceas",   kgPorCajaDefault:18.0, unidadComercial:"kg", temporadaInicio:"Mar", temporadaFin:"Sep", observ:""},
  {codigo:"PER", nombreEs:"Peras",       nombreEn:"Pears",        icono:"🍐", familia:"Pomáceas",   kgPorCajaDefault:18.0, unidadComercial:"kg", temporadaInicio:"Feb", temporadaFin:"Jul", observ:""},
  {codigo:"ORG", nombreEs:"Naranjas",    nombreEn:"Oranges",      icono:"🍊", familia:"Cítricos",   kgPorCajaDefault:15.0, unidadComercial:"kg", temporadaInicio:"Jun", temporadaFin:"Dic", observ:""},
  {codigo:"LMN", nombreEs:"Limones",     nombreEn:"Lemons",       icono:"🍋", familia:"Cítricos",   kgPorCajaDefault:15.0, unidadComercial:"kg", temporadaInicio:"May", temporadaFin:"Sep", observ:""},
  {codigo:"MND", nombreEs:"Mandarinas",  nombreEn:"Mandarins",    icono:"🍊", familia:"Cítricos",   kgPorCajaDefault:10.0, unidadComercial:"kg", temporadaInicio:"May", temporadaFin:"Sep", observ:""},
  {codigo:"MNG", nombreEs:"Mango",       nombreEn:"Mango",        icono:"🥭", familia:"Tropicales", kgPorCajaDefault:4.0,  unidadComercial:"kg", temporadaInicio:"Oct", temporadaFin:"Feb", observ:""},
  {codigo:"STR", nombreEs:"Frutillas",   nombreEn:"Strawberries", icono:"🍓", familia:"Berries",    kgPorCajaDefault:2.5,  unidadComercial:"kg", temporadaInicio:"Sep", temporadaFin:"Feb", observ:""},
  {codigo:"RSP", nombreEs:"Frambuesas",  nombreEn:"Raspberries",  icono:"🩷", familia:"Berries",    kgPorCajaDefault:1.5,  unidadComercial:"kg", temporadaInicio:"Nov", temporadaFin:"Mar", observ:"Sin emoji oficial — se usa corazón rosa"},
];

// ═══════════════════════════════════════════════════════════════════
// TEMPORADAS AGRÍCOLAS — julio a junio del año siguiente
// ═══════════════════════════════════════════════════════════════════
export const TEMPORADAS_DEFAULT = Array.from({length:20}, (_,i)=>`${2021+i}-${2022+i}`);

// ═══════════════════════════════════════════════════════════════════
// CHECKLIST DOCUMENTAL — plantillas comunes preconfiguradas
// ═══════════════════════════════════════════════════════════════════
export const CHECKLIST_DOCS_DEFAULT = [
  {
    codigo:"MAR-UE",
    nombre:"Embarque Marítimo a Unión Europea",
    tipoEmbarqueCodigo:"MAR-REF",
    mercadoCodigo:"UE",
    documentos:[
      {codigo:"FACT-COM", nombre:"Factura Comercial",      requerido:true, observ:"Detalle de la operación"},
      {codigo:"BL",       nombre:"Bill of Lading (B/L)",   requerido:true, observ:"Documento de embarque"},
      {codigo:"PACK",     nombre:"Packing List",           requerido:true, observ:"Detalle de bultos"},
      {codigo:"COO",      nombre:"Certificado de Origen",  requerido:true, observ:"SAG/SENASA según corresponda"},
      {codigo:"PHYTO",    nombre:"Certificado Fitosanitario", requerido:true, observ:"SAG/SENASA"},
      {codigo:"EUR1",     nombre:"EUR.1 (preferencia arancelaria)", requerido:true, observ:"Acuerdo Chile-UE"},
      {codigo:"SEG",      nombre:"Póliza de Seguro",       requerido:false, observ:"CIF si aplica"},
      {codigo:"DUS",      nombre:"DUS (Documento Único de Salida)", requerido:true, observ:"Aduana origen"},
    ]
  },
  {
    codigo:"MAR-USA",
    nombre:"Embarque Marítimo a Estados Unidos",
    tipoEmbarqueCodigo:"MAR-REF",
    mercadoCodigo:"USA",
    documentos:[
      {codigo:"FACT-COM", nombre:"Factura Comercial",      requerido:true, observ:""},
      {codigo:"BL",       nombre:"Bill of Lading",         requerido:true, observ:""},
      {codigo:"PACK",     nombre:"Packing List",           requerido:true, observ:""},
      {codigo:"COO",      nombre:"Certificado de Origen",  requerido:true, observ:""},
      {codigo:"PHYTO",    nombre:"Certificado Fitosanitario", requerido:true, observ:""},
      {codigo:"FDA",      nombre:"FDA Prior Notice",       requerido:true, observ:"Notificación previa FDA"},
      {codigo:"ISF",      nombre:"ISF-10+2 (Importer Security Filing)", requerido:true, observ:"USA Customs"},
      {codigo:"DUS",      nombre:"DUS Aduana Origen",      requerido:true, observ:""},
    ]
  },
  {
    codigo:"MAR-CN",
    nombre:"Embarque Marítimo a China",
    tipoEmbarqueCodigo:"MAR-REF",
    mercadoCodigo:"CHN",
    documentos:[
      {codigo:"FACT-COM", nombre:"Factura Comercial",      requerido:true, observ:""},
      {codigo:"BL",       nombre:"Bill of Lading",         requerido:true, observ:""},
      {codigo:"PACK",     nombre:"Packing List",           requerido:true, observ:""},
      {codigo:"COO-FTA",  nombre:"Certificado de Origen (FTA Chile-China)", requerido:true, observ:""},
      {codigo:"PHYTO",    nombre:"Certificado Fitosanitario", requerido:true, observ:"SAG/SENASA con protocolo China"},
      {codigo:"PROT-EXP", nombre:"Carta de Protocolo de Exportación", requerido:true, observ:"Anexo país-especie"},
      {codigo:"GACC",     nombre:"Registro GACC",          requerido:true, observ:"Registro huerto+packing autorizados"},
      {codigo:"DUS",      nombre:"DUS Aduana Origen",      requerido:true, observ:""},
    ]
  },
  {
    codigo:"AER-ASIA",
    nombre:"Embarque Aéreo a Asia",
    tipoEmbarqueCodigo:"AER-PER",
    mercadoCodigo:"CHN",
    documentos:[
      {codigo:"FACT-COM", nombre:"Factura Comercial",      requerido:true, observ:""},
      {codigo:"AWB",      nombre:"Air Waybill (AWB)",      requerido:true, observ:"Documento embarque aéreo"},
      {codigo:"PACK",     nombre:"Packing List",           requerido:true, observ:""},
      {codigo:"COO",      nombre:"Certificado de Origen",  requerido:true, observ:""},
      {codigo:"PHYTO",    nombre:"Certificado Fitosanitario", requerido:true, observ:""},
      {codigo:"TEMP",     nombre:"Temperature log",        requerido:false, observ:"Si requiere cadena de frío certificada"},
      {codigo:"DUS",      nombre:"DUS Aduana Origen",      requerido:true, observ:""},
    ]
  },
  {
    codigo:"MAR-ME",
    nombre:"Embarque Marítimo a Medio Oriente",
    tipoEmbarqueCodigo:"MAR-REF",
    mercadoCodigo:"ME",
    documentos:[
      {codigo:"FACT-COM", nombre:"Factura Comercial (Legalizada)", requerido:true, observ:"Cámara comercio + consulado"},
      {codigo:"BL",       nombre:"Bill of Lading",         requerido:true, observ:""},
      {codigo:"PACK",     nombre:"Packing List",           requerido:true, observ:""},
      {codigo:"COO",      nombre:"Certificado de Origen (Legalizado)", requerido:true, observ:""},
      {codigo:"PHYTO",    nombre:"Certificado Fitosanitario", requerido:true, observ:""},
      {codigo:"HALAL",    nombre:"Certificado Halal",      requerido:false, observ:"Si corresponde a producto"},
      {codigo:"DUS",      nombre:"DUS Aduana Origen",      requerido:true, observ:""},
    ]
  },
];

// ═══════════════════════════════════════════════════════════════════
// HELPERS UI
// ═══════════════════════════════════════════════════════════════════
const inputSt = {
  width:"100%", padding:"6px 10px", borderRadius:6, border:`1px solid ${C.border}`,
  background:C.card2, color:C.text, fontSize:12, boxSizing:"border-box", outline:"none"
};
const lblSt = { fontSize:10, color:C.muted, fontWeight:600, marginBottom:3, textTransform:"uppercase", letterSpacing:0.4 };
const btnSt = (color=C.blue, ghost=false) => ({
  padding:"6px 12px", borderRadius:6, border:ghost?`1px solid ${color}`:"none",
  background:ghost?"transparent":color, color:ghost?color:"#fff",
  fontWeight:600, fontSize:11, cursor:"pointer"
});

function Card({children, title, icon}) {
  return (
    <div style={{background:C.card, borderRadius:14, padding:18, border:`1px solid ${C.border}`}}>
      {title && (
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:14, borderBottom:`1px solid ${C.border}`, paddingBottom:10}}>
          {icon && <span style={{fontSize:18}}>{icon}</span>}
          <h3 style={{margin:0, color:C.text, fontSize:14, fontWeight:700}}>{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

function exportarCSV(data, nombre, columnas) {
  if(!Array.isArray(data) || !data.length) { alert("No hay datos para exportar"); return; }
  const escapar = (v) => {
    if(v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[,;"\n]/.test(s) ? `"${s}"` : s;
  };
  const header = columnas.map(c => c.label).join(",");
  const rows = data.map(row => columnas.map(c => escapar(row[c.key])).join(",")).join("\n");
  const csv = `${header}\n${rows}`;
  const blob = new Blob(["\ufeff" + csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${nombre}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR DE TEMPORADAS
// ═══════════════════════════════════════════════════════════════════
function AgregarTemporada({temporadas, setTemporadas}) {
  const [anio, setAnio] = useState("");
  const valor = anio && /^\d{4}$/.test(anio) ? `${anio}-${Number(anio)+1}` : "";
  const yaExiste = temporadas.includes(valor);
  const agregar = () => {
    if(!valor || yaExiste) return;
    setTemporadas(prev=>[...prev, valor].sort());
    setAnio("");
  };
  return (
    <div style={{display:"flex", gap:8, alignItems:"flex-end", flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:10, color:C.muted, fontWeight:600, marginBottom:3, textTransform:"uppercase", letterSpacing:0.4}}>Año inicio</div>
        <input type="number" value={anio} onChange={e=>setAnio(e.target.value)}
          placeholder="2042" min="2000" max="2099"
          onKeyDown={e=>e.key==="Enter"&&agregar()}
          style={{width:110, padding:"6px 10px", borderRadius:6, border:`1px solid ${C.border}`, background:C.card2, color:C.text, fontSize:12, outline:"none"}}/>
      </div>
      {valor && <div style={{fontSize:11, color:C.muted, paddingBottom:7}}>→ Temporada {valor} (01-jul-{anio} a 30-jun-{Number(anio)+1})</div>}
      <button onClick={agregar} disabled={!valor||yaExiste}
        style={{padding:"6px 14px", borderRadius:6, border:`1px solid ${yaExiste||!valor?C.border:C.green}`,
          background:"transparent", color:yaExiste||!valor?C.muted:C.green,
          fontWeight:600, fontSize:11, cursor:valor&&!yaExiste?"pointer":"default", marginBottom:1}}>
        {yaExiste?"Ya existe":"+ Agregar"}
      </button>
    </div>
  );
}

function TemporadasEditor({temporadas, setTemporadas, canEdit}) {
  return (
    <div style={{background:C.card, borderRadius:14, padding:18, border:`1px solid ${C.border}`}}>
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:14, borderBottom:`1px solid ${C.border}`, paddingBottom:10}}>
        <span style={{fontSize:18}}>📅</span>
        <h3 style={{margin:0, color:C.text, fontSize:14, fontWeight:700, flex:1}}>Temporadas</h3>
        <span style={{fontSize:11, color:C.muted}}>{temporadas.length} temporadas</span>
      </div>
      <div style={{fontSize:11, color:C.muted, marginBottom:14, lineHeight:1.5}}>
        Cada temporada corre del <strong style={{color:C.text}}>1 de julio</strong> al <strong style={{color:C.text}}>30 de junio</strong> del año siguiente.
        Se usan en Business Closures para identificar el período comercial.
      </div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px,1fr))", gap:8, marginBottom:16}}>
        {temporadas.map(t=>{
          const [a1, a2] = t.split("-");
          return (
            <div key={t} style={{display:"flex", alignItems:"center", justifyContent:"space-between",
              background:C.card2, padding:"8px 12px", borderRadius:6, border:`1px solid ${C.border}`}}>
              <div>
                <div style={{fontWeight:700, color:C.text, fontSize:12}}>Temporada {t}</div>
                <div style={{fontSize:9, color:C.muted, marginTop:2}}>{a1}-07-01 → {a2}-06-30</div>
              </div>
              {canEdit && (
                <button onClick={()=>setTemporadas(prev=>prev.filter(x=>x!==t))}
                  style={{padding:"2px 8px", borderRadius:4, border:`1px solid ${C.accent}44`,
                    background:"transparent", color:C.accent, cursor:"pointer", fontSize:10, fontWeight:700}}>×</button>
              )}
            </div>
          );
        })}
      </div>
      {canEdit && <AgregarTemporada temporadas={temporadas} setTemporadas={setTemporadas}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTE GENÉRICO: TablaMaestro
// Recibe: titulo, datos, setDatos, columnas, formNuevo, canEdit
// Maneja: búsqueda, agregar, editar inline, eliminar, exportar CSV
// ═══════════════════════════════════════════════════════════════════
function TablaMaestro({titulo, icono, datos, setDatos, columnas, defaultItem, canEdit=true, busquedaPlaceholder="Buscar...", presetsParcial=null, onPresetRestore}) {
  const [busqueda, setBusqueda] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editBuffer, setEditBuffer] = useState({});
  const [agregando, setAgregando] = useState(false);
  const [nuevoItem, setNuevoItem] = useState(defaultItem || {});

  const filtrados = useMemo(()=>{
    if(!busqueda.trim()) return datos;
    const q = busqueda.toLowerCase();
    return datos.filter(d => columnas.some(c => String(d[c.key]||"").toLowerCase().includes(q)));
  },[datos, busqueda, columnas]);

  const handleEditar = (item) => {
    const id = item.codigo || item.id;
    setEditingId(id);
    setEditBuffer({...item});
  };
  const handleGuardarEdit = () => {
    setDatos(prev => prev.map(d => (d.codigo||d.id) === editingId ? editBuffer : d));
    setEditingId(null);
    setEditBuffer({});
  };
  const handleCancelarEdit = () => {
    setEditingId(null);
    setEditBuffer({});
  };
  const handleEliminar = (item) => {
    const id = item.codigo || item.id;
    if(!window.confirm(`Eliminar "${item.nombre || item.codigo || id}"?`)) return;
    setDatos(prev => prev.filter(d => (d.codigo||d.id) !== id));
  };
  const handleAgregar = () => {
    if(!nuevoItem.codigo && !nuevoItem.id) {
      alert("Debe ingresar al menos código o ID");
      return;
    }
    const id = nuevoItem.codigo || nuevoItem.id;
    if(datos.some(d => (d.codigo||d.id) === id)) {
      alert(`Ya existe un registro con código/ID "${id}"`);
      return;
    }
    setDatos(prev => [...prev, {...nuevoItem}]);
    setAgregando(false);
    setNuevoItem(defaultItem || {});
  };

  return (
    <Card title={titulo} icon={icono}>
      <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"center"}}>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          placeholder={busquedaPlaceholder}
          style={{...inputSt, flex:"1 1 240px", maxWidth:380}}/>
        <div style={{fontSize:11, color:C.muted}}>
          {filtrados.length} de {datos.length} registros
        </div>
        <div style={{display:"flex", gap:6, marginLeft:"auto"}}>
          <button onClick={()=>exportarCSV(filtrados, titulo.replace(/\s+/g,"_").toLowerCase(), columnas)} style={btnSt(C.teal, true)}>
            ⇩ CSV
          </button>
          {canEdit && presetsParcial && onPresetRestore && (
            <button onClick={onPresetRestore} style={btnSt(C.purple, true)} title="Recargar valores por defecto (no borra los existentes, sólo agrega los que falten)">
              ↻ Recargar presets
            </button>
          )}
          {canEdit && (
            <button onClick={()=>setAgregando(true)} style={btnSt(C.green)}>
              + Agregar
            </button>
          )}
        </div>
      </div>

      <div style={{overflowX:"auto", borderRadius:8, border:`1px solid ${C.border}`}}>
        <table style={{borderCollapse:"collapse", width:"100%", fontSize:11, minWidth:600}}>
          <thead>
            <tr style={{background:C.bg2}}>
              {columnas.map(c => (
                <th key={c.key} style={{padding:"8px 10px", textAlign:c.align||"left",
                  color:C.muted, fontWeight:700, fontSize:10, textTransform:"uppercase",
                  letterSpacing:0.4, borderBottom:`2px solid ${C.border}`, whiteSpace:"nowrap"}}>
                  {c.label}
                </th>
              ))}
              {canEdit && <th style={{padding:"8px 10px", textAlign:"center",
                color:C.muted, fontWeight:700, fontSize:10, borderBottom:`2px solid ${C.border}`}}>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {agregando && (
              <tr style={{background:`${C.green}11`, borderBottom:`1px solid ${C.green}44`}}>
                {columnas.map(c => (
                  <td key={c.key} style={{padding:"6px 8px"}}>
                    {c.options ? (
                      <select value={nuevoItem[c.key]||""} onChange={e=>setNuevoItem({...nuevoItem,[c.key]:e.target.value})} style={inputSt}>
                        <option value="">— seleccionar —</option>
                        {c.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input value={nuevoItem[c.key]||""} onChange={e=>setNuevoItem({...nuevoItem,[c.key]:e.target.value})}
                        type={c.type||"text"} placeholder={c.label} style={inputSt}/>
                    )}
                  </td>
                ))}
                <td style={{padding:"6px 8px", textAlign:"center", whiteSpace:"nowrap"}}>
                  <button onClick={handleAgregar} style={btnSt(C.green)}>✓ Guardar</button>
                  <button onClick={()=>{setAgregando(false); setNuevoItem(defaultItem||{});}}
                    style={{...btnSt(C.muted, true), marginLeft:5}}>✕</button>
                </td>
              </tr>
            )}
            {filtrados.length === 0 && !agregando && (
              <tr>
                <td colSpan={columnas.length + (canEdit?1:0)} style={{padding:30, textAlign:"center", color:C.muted, fontSize:12}}>
                  {busqueda ? "Sin resultados para la búsqueda" : "Sin registros"}
                </td>
              </tr>
            )}
            {filtrados.map((item, idx) => {
              const id = item.codigo || item.id;
              const isEditing = editingId === id;
              return (
                <tr key={id} style={{borderBottom:`1px solid ${C.border}22`, background:idx%2===0?"transparent":`${C.border}06`}}>
                  {columnas.map(c => (
                    <td key={c.key} style={{padding:"6px 10px", textAlign:c.align||"left", color:C.text, fontSize:11}}>
                      {isEditing ? (
                        c.options ? (
                          <select value={editBuffer[c.key]||""} onChange={e=>setEditBuffer({...editBuffer,[c.key]:e.target.value})} style={inputSt}>
                            <option value="">— seleccionar —</option>
                            {c.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <input value={editBuffer[c.key]||""} onChange={e=>setEditBuffer({...editBuffer,[c.key]:e.target.value})}
                            type={c.type||"text"} style={inputSt}/>
                        )
                      ) : (
                        c.render ? c.render(item[c.key], item) : (item[c.key] ?? "—")
                      )}
                    </td>
                  ))}
                  {canEdit && (
                    <td style={{padding:"6px 10px", textAlign:"center", whiteSpace:"nowrap"}}>
                      {isEditing ? (
                        <>
                          <button onClick={handleGuardarEdit} style={btnSt(C.green)}>✓</button>
                          <button onClick={handleCancelarEdit} style={{...btnSt(C.muted, true), marginLeft:4}}>✕</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>handleEditar(item)} style={{...btnSt(C.blue, true), padding:"4px 8px"}} title="Editar">✎</button>
                          <button onClick={()=>handleEliminar(item)} style={{...btnSt(C.accent, true), padding:"4px 8px", marginLeft:4}} title="Eliminar">×</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENTE: ChecklistDocsEditor
// El maestro de checklist requiere edición de la lista de documentos
// dentro de cada plantilla, así que tiene UI custom (no usa TablaMaestro)
// ═══════════════════════════════════════════════════════════════════
function ChecklistDocsEditor({datos, setDatos, tiposEmbarque, mercados, canEdit}) {
  const [editingId, setEditingId] = useState(null);
  const [editBuffer, setEditBuffer] = useState(null);
  const [agregandoPlantilla, setAgregandoPlantilla] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const plantillaVacia = {
    codigo:"", nombre:"", tipoEmbarqueCodigo:"", mercadoCodigo:"", documentos:[]
  };
  const docVacio = {codigo:"", nombre:"", requerido:true, observ:""};

  const handleEditar = (plantilla) => {
    setEditingId(plantilla.codigo);
    setEditBuffer(JSON.parse(JSON.stringify(plantilla)));
  };
  const handleGuardar = () => {
    setDatos(prev => {
      if(prev.some(p => p.codigo === editBuffer.codigo && p.codigo !== editingId)) {
        alert("Ya existe una plantilla con ese código");
        return prev;
      }
      return prev.map(p => p.codigo === editingId ? editBuffer : p);
    });
    setEditingId(null);
    setEditBuffer(null);
  };
  const handleNueva = () => {
    setEditBuffer({...plantillaVacia});
    setAgregandoPlantilla(true);
  };
  const handleGuardarNueva = () => {
    if(!editBuffer.codigo || !editBuffer.nombre) {
      alert("Debe ingresar código y nombre"); return;
    }
    if(datos.some(p => p.codigo === editBuffer.codigo)) {
      alert("Ya existe una plantilla con ese código"); return;
    }
    setDatos(prev => [...prev, editBuffer]);
    setAgregandoPlantilla(false);
    setEditBuffer(null);
  };
  const handleEliminar = (plantilla) => {
    if(!window.confirm(`Eliminar plantilla "${plantilla.nombre}"?`)) return;
    setDatos(prev => prev.filter(p => p.codigo !== plantilla.codigo));
  };

  const plantillasFiltradas = useMemo(()=>{
    if(!busqueda.trim()) return datos;
    const q = busqueda.toLowerCase();
    return datos.filter(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
  },[datos, busqueda]);

  const editorPlantilla = (esNueva=false) => editBuffer && (
    <div style={{background:`${C.blue}11`, padding:14, borderRadius:8, border:`1px solid ${C.blue}44`, marginBottom:14}}>
      <h4 style={{margin:"0 0 12px", color:C.blue, fontSize:13}}>
        {esNueva ? "📋 Nueva plantilla" : `✎ Editando: ${editBuffer.nombre || editBuffer.codigo}`}
      </h4>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10, marginBottom:14}}>
        <div>
          <div style={lblSt}>Código *</div>
          <input value={editBuffer.codigo} onChange={e=>setEditBuffer({...editBuffer, codigo:e.target.value})}
            disabled={!esNueva} placeholder="ej. MAR-UE" style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Nombre *</div>
          <input value={editBuffer.nombre} onChange={e=>setEditBuffer({...editBuffer, nombre:e.target.value})}
            placeholder="ej. Embarque a UE" style={inputSt}/>
        </div>
        <div>
          <div style={lblSt}>Tipo de Embarque</div>
          <select value={editBuffer.tipoEmbarqueCodigo||""} onChange={e=>setEditBuffer({...editBuffer, tipoEmbarqueCodigo:e.target.value})} style={inputSt}>
            <option value="">— ninguno —</option>
            {tiposEmbarque.map(t => <option key={t.codigo} value={t.codigo}>{t.icono} {t.nombre}</option>)}
          </select>
        </div>
        <div>
          <div style={lblSt}>Mercado</div>
          <select value={editBuffer.mercadoCodigo||""} onChange={e=>setEditBuffer({...editBuffer, mercadoCodigo:e.target.value})} style={inputSt}>
            <option value="">— ninguno —</option>
            {mercados.map(m => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
          </select>
        </div>
      </div>

      <div style={{borderTop:`1px solid ${C.border}`, paddingTop:12, marginBottom:10}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
          <strong style={{color:C.text, fontSize:12}}>Documentos requeridos ({editBuffer.documentos?.length||0})</strong>
          <button onClick={()=>setEditBuffer({...editBuffer, documentos:[...(editBuffer.documentos||[]), {...docVacio}]})}
            style={btnSt(C.green, true)}>+ Agregar doc</button>
        </div>
        {(editBuffer.documentos || []).map((doc, di) => (
          <div key={di} style={{display:"grid", gridTemplateColumns:"110px 1fr 80px 1.5fr 36px", gap:8, marginBottom:6, alignItems:"center"}}>
            <input value={doc.codigo} onChange={e=>{
              const nuevos = [...editBuffer.documentos]; nuevos[di] = {...nuevos[di], codigo:e.target.value};
              setEditBuffer({...editBuffer, documentos:nuevos});
            }} placeholder="Código" style={inputSt}/>
            <input value={doc.nombre} onChange={e=>{
              const nuevos = [...editBuffer.documentos]; nuevos[di] = {...nuevos[di], nombre:e.target.value};
              setEditBuffer({...editBuffer, documentos:nuevos});
            }} placeholder="Nombre del documento" style={inputSt}/>
            <label style={{display:"flex", alignItems:"center", gap:4, fontSize:11, color:C.muted, cursor:"pointer"}}>
              <input type="checkbox" checked={!!doc.requerido} onChange={e=>{
                const nuevos = [...editBuffer.documentos]; nuevos[di] = {...nuevos[di], requerido:e.target.checked};
                setEditBuffer({...editBuffer, documentos:nuevos});
              }}/>
              Requerido
            </label>
            <input value={doc.observ||""} onChange={e=>{
              const nuevos = [...editBuffer.documentos]; nuevos[di] = {...nuevos[di], observ:e.target.value};
              setEditBuffer({...editBuffer, documentos:nuevos});
            }} placeholder="Observación / regulación" style={inputSt}/>
            <button onClick={()=>{
              const nuevos = editBuffer.documentos.filter((_,i)=>i!==di);
              setEditBuffer({...editBuffer, documentos:nuevos});
            }} style={{...btnSt(C.accent, true), padding:"4px 8px"}}>×</button>
          </div>
        ))}
        {(editBuffer.documentos||[]).length === 0 && (
          <div style={{padding:20, textAlign:"center", color:C.muted, fontSize:11, background:C.card2, borderRadius:6}}>
            Sin documentos. Click "+ Agregar doc" para empezar.
          </div>
        )}
      </div>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
        <button onClick={()=>{setEditingId(null); setEditBuffer(null); setAgregandoPlantilla(false);}}
          style={btnSt(C.muted, true)}>Cancelar</button>
        <button onClick={esNueva ? handleGuardarNueva : handleGuardar} style={btnSt(C.green)}>
          {esNueva ? "+ Crear plantilla" : "✓ Guardar cambios"}
        </button>
      </div>
    </div>
  );

  return (
    <Card title="Checklist Documental por Tipo de Embarque" icon="📋">
      <div style={{fontSize:11, color:C.muted, marginBottom:14, lineHeight:1.5}}>
        Plantillas de documentos requeridos según tipo de embarque y mercado de destino.
        Cada plantilla se aplica automáticamente al crear una nueva Orden de Embarque/Despacho que coincida con su tipo+mercado.
      </div>

      <div style={{display:"flex", gap:10, marginBottom:14, flexWrap:"wrap"}}>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          placeholder="Buscar plantilla..."
          style={{...inputSt, flex:"1 1 240px", maxWidth:380}}/>
        <div style={{fontSize:11, color:C.muted, alignSelf:"center"}}>
          {plantillasFiltradas.length} de {datos.length} plantillas
        </div>
        {canEdit && !agregandoPlantilla && !editingId && (
          <button onClick={handleNueva} style={{...btnSt(C.green), marginLeft:"auto"}}>+ Nueva plantilla</button>
        )}
      </div>

      {agregandoPlantilla && editorPlantilla(true)}
      {editingId && editorPlantilla(false)}

      <div style={{display:"grid", gap:10}}>
        {plantillasFiltradas.map(p => {
          const isEditing = editingId === p.codigo;
          if(isEditing) return null;
          const tipoEmb = tiposEmbarque.find(t => t.codigo === p.tipoEmbarqueCodigo);
          const merc   = mercados.find(m => m.codigo === p.mercadoCodigo);
          const docsReq = (p.documentos||[]).filter(d => d.requerido).length;
          const docsOpt = (p.documentos||[]).filter(d => !d.requerido).length;
          return (
            <div key={p.codigo} style={{background:C.card2, padding:14, borderRadius:8, border:`1px solid ${C.border}`}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:8}}>
                <div>
                  <div style={{fontWeight:700, color:C.text, fontSize:13, marginBottom:2}}>
                    {p.nombre}
                  </div>
                  <div style={{fontSize:10, color:C.muted, fontFamily:"monospace"}}>{p.codigo}</div>
                  <div style={{display:"flex", gap:10, marginTop:6, fontSize:11, color:C.muted}}>
                    {tipoEmb && <span>{tipoEmb.icono} {tipoEmb.nombre}</span>}
                    {merc && <span>🎯 {merc.nombre}</span>}
                    <span><strong style={{color:C.green}}>{docsReq}</strong> requeridos · <strong style={{color:C.muted}}>{docsOpt}</strong> opcionales</span>
                  </div>
                </div>
                {canEdit && (
                  <div style={{display:"flex", gap:6}}>
                    <button onClick={()=>handleEditar(p)} style={{...btnSt(C.blue, true), padding:"4px 10px"}}>✎ Editar</button>
                    <button onClick={()=>handleEliminar(p)} style={{...btnSt(C.accent, true), padding:"4px 10px"}}>×</button>
                  </div>
                )}
              </div>
              <div style={{marginTop:8, display:"flex", gap:6, flexWrap:"wrap"}}>
                {(p.documentos||[]).map((d, di) => (
                  <div key={di} style={{
                    padding:"3px 8px", borderRadius:4, fontSize:10,
                    background:d.requerido ? `${C.green}22` : `${C.muted}22`,
                    color:d.requerido ? C.green : C.muted,
                    border:`1px solid ${d.requerido ? C.green : C.muted}44`,
                  }} title={d.observ}>
                    {d.requerido ? "●" : "○"} {d.nombre}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {plantillasFiltradas.length === 0 && (
          <div style={{padding:30, textAlign:"center", color:C.muted, fontSize:12, background:C.card2, borderRadius:8}}>
            {busqueda ? "Sin resultados" : "Sin plantillas. Click + Nueva plantilla para crear una."}
          </div>
        )}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENTE: TipoCambioEditor
// Estructura: tcData = { "USD-CLP":[{fecha,valor,fuente}], ... }
// UI: lista plana + filtros + botones actualización APIs + CRUD manual
// ═══════════════════════════════════════════════════════════════════
function TipoCambioEditor({tcData, setTcData, monedas, canEdit}) {
  const [filtroPar, setFiltroPar] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [actualizando, setActualizando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [nuevoTC, setNuevoTC] = useState({par:"USD-CLP", fecha:fechaISO(), valor:"", fuente:"manual"});
  const [editingKey, setEditingKey] = useState(null);
  const [editBuffer, setEditBuffer] = useState({});

  // Aplanar a lista de filas {par, fecha, valor, fuente}
  const filas = useMemo(()=>{
    const out = [];
    Object.entries(tcData || {}).forEach(([par, serie])=>{
      (Array.isArray(serie)?serie:[]).forEach(entry => {
        if(entry?.fecha != null && entry.valor != null) {
          out.push({par, fecha:entry.fecha, valor:Number(entry.valor), fuente:entry.fuente||"manual"});
        }
      });
    });
    return out.sort((a,b)=> b.fecha.localeCompare(a.fecha) || a.par.localeCompare(b.par));
  },[tcData]);

  const filasFiltradas = useMemo(()=>{
    return filas.filter(f => {
      if(filtroPar && !f.par.includes(filtroPar.toUpperCase())) return false;
      if(filtroFecha && !f.fecha.startsWith(filtroFecha)) return false;
      return true;
    });
  },[filas, filtroPar, filtroFecha]);

  // Resumen: última fecha por par
  const resumen = useMemo(()=>{
    const r = {};
    filas.forEach(f => {
      if(!r[f.par] || r[f.par].fecha < f.fecha) r[f.par] = f;
    });
    return Object.entries(r).map(([par, f]) => ({par, ...f}))
      .sort((a,b)=>a.par.localeCompare(b.par));
  },[filas]);

  const handleActualizar = async (fechas) => {
    if(!canEdit) return;
    setActualizando(true);
    setMensaje("");
    try {
      let totalActualizados = 0;
      for(const f of fechas) {
        const updates = await actualizarTCDesdeAPIs(TC_PARES_DEFAULT, f);
        const numPares = Object.keys(updates).length;
        if(numPares > 0) {
          setTcData(prev => aplicarUpdatesATCData(prev, updates));
          totalActualizados += numPares;
        }
      }
      setMensaje(`✓ ${totalActualizados} entradas actualizadas (${fechas.length} fecha${fechas.length>1?"s":""})`);
    } catch(e) {
      setMensaje(`✕ Error: ${e.message}`);
    } finally {
      setActualizando(false);
      setTimeout(()=>setMensaje(""), 6000);
    }
  };

  const fechasRango = (dias) => {
    const out = [];
    for(let i=0; i<dias; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(fechaISO(d));
    }
    return out;
  };

  const handleAgregarManual = () => {
    if(!nuevoTC.par || !nuevoTC.fecha || !nuevoTC.valor) {
      alert("Par, fecha y valor son requeridos"); return;
    }
    const valor = Number(nuevoTC.valor);
    if(isNaN(valor) || valor <= 0) { alert("Valor inválido"); return; }
    if(!/^[A-Z]{3}-[A-Z]{3}$/.test(nuevoTC.par)) { alert("Par debe ser formato 'USD-CLP'"); return; }
    setTcData(prev => ({
      ...prev,
      [nuevoTC.par]: mergeTCSerie(prev[nuevoTC.par], [{fecha:nuevoTC.fecha, valor, fuente:"manual"}])
    }));
    setNuevoTC({par:"USD-CLP", fecha:fechaISO(), valor:"", fuente:"manual"});
    setAgregando(false);
  };

  const handleEditar = (fila) => {
    setEditingKey(`${fila.par}__${fila.fecha}`);
    setEditBuffer({...fila});
  };

  const handleGuardarEdit = () => {
    const valor = Number(editBuffer.valor);
    if(isNaN(valor) || valor <= 0) { alert("Valor inválido"); return; }
    const [parOrig, fechaOrig] = editingKey.split("__");
    setTcData(prev => {
      const out = {...prev};
      // remover entrada vieja
      if(out[parOrig]) {
        out[parOrig] = out[parOrig].filter(e => e.fecha !== fechaOrig);
        if(!out[parOrig].length) delete out[parOrig];
      }
      // agregar nueva (puede haber cambiado de par/fecha)
      out[editBuffer.par] = mergeTCSerie(out[editBuffer.par], [{
        fecha: editBuffer.fecha, valor, fuente: editBuffer.fuente || "manual"
      }]);
      return out;
    });
    setEditingKey(null);
    setEditBuffer({});
  };

  const handleEliminar = (fila) => {
    if(!window.confirm(`Eliminar ${fila.par} ${fila.fecha} = ${fila.valor}?`)) return;
    setTcData(prev => {
      const out = {...prev};
      if(out[fila.par]) {
        out[fila.par] = out[fila.par].filter(e => e.fecha !== fila.fecha);
        if(!out[fila.par].length) delete out[fila.par];
      }
      return out;
    });
  };

  const exportar = () => {
    if(!filasFiltradas.length) { alert("No hay datos"); return; }
    exportarCSV(filasFiltradas, "tipo_cambio", [
      {key:"par", label:"Par"},
      {key:"fecha", label:"Fecha"},
      {key:"valor", label:"Valor"},
      {key:"fuente", label:"Fuente"},
    ]);
  };

  const monedasMap = useMemo(()=>{
    const m = {}; (monedas||[]).forEach(x => m[x.codigo] = x); return m;
  },[monedas]);

  return (
    <Card title="Tipo de Cambio Histórico" icon="💱">
      <div style={{fontSize:11, color:C.muted, marginBottom:14, lineHeight:1.5}}>
        Tabla histórica de tasas. Fuentes: <strong>mindicador.cl</strong> (Banco Central Chile, para CLP) y{" "}
        <strong>frankfurter.app</strong> (Banco Central Europeo, resto del mundo).
        Las entradas manuales no se sobrescriben automáticamente.
      </div>

      {/* Botones de actualización */}
      {canEdit && (
        <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:14, alignItems:"center"}}>
          <button onClick={()=>handleActualizar([fechaISO()])} disabled={actualizando} style={btnSt(C.blue)}>
            🔄 Actualizar hoy
          </button>
          <button onClick={()=>handleActualizar(fechasRango(7))} disabled={actualizando} style={btnSt(C.teal)}>
            📅 Últimos 7 días
          </button>
          <button onClick={()=>handleActualizar(fechasRango(30))} disabled={actualizando} style={btnSt(C.teal, true)}>
            📅 Últimos 30 días
          </button>
          <button onClick={()=>setAgregando(!agregando)} style={btnSt(C.green, true)}>
            {agregando ? "✕ Cancelar" : "+ Agregar manual"}
          </button>
          <button onClick={exportar} style={btnSt(C.muted, true)}>⇩ CSV</button>
          {actualizando && <span style={{color:C.yellow, fontSize:11}}>⏳ Llamando APIs…</span>}
          {mensaje && <span style={{color: mensaje.startsWith("✓")?C.green:C.accent, fontSize:11}}>{mensaje}</span>}
        </div>
      )}

      {/* Form agregar manual */}
      {agregando && canEdit && (
        <div style={{background:`${C.green}11`, padding:12, borderRadius:8, marginBottom:14, border:`1px solid ${C.green}44`}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:8, alignItems:"end"}}>
            <div>
              <div style={lblSt}>Par (ej. USD-CLP)</div>
              <input value={nuevoTC.par} onChange={e=>setNuevoTC({...nuevoTC, par:e.target.value.toUpperCase()})}
                placeholder="USD-CLP" style={inputSt}/>
            </div>
            <div>
              <div style={lblSt}>Fecha</div>
              <input type="date" value={nuevoTC.fecha} onChange={e=>setNuevoTC({...nuevoTC, fecha:e.target.value})} style={inputSt}/>
            </div>
            <div>
              <div style={lblSt}>Valor (1 origen = X destino)</div>
              <input type="number" step="0.0001" value={nuevoTC.valor} onChange={e=>setNuevoTC({...nuevoTC, valor:e.target.value})}
                placeholder="950.25" style={inputSt}/>
            </div>
            <button onClick={handleAgregarManual} style={btnSt(C.green)}>✓ Agregar</button>
          </div>
        </div>
      )}

      {/* Resumen por par (última fecha disponible) */}
      {resumen.length > 0 && (
        <div style={{marginBottom:14}}>
          <div style={{...lblSt, marginBottom:6}}>Última cotización por par ({resumen.length})</div>
          <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
            {resumen.map(r => {
              const [orig, dest] = r.par.split("-");
              const simbDest = monedasMap[dest]?.simbolo || dest;
              return (
                <div key={r.par} style={{
                  background:C.card2, padding:"6px 10px", borderRadius:6,
                  border:`1px solid ${C.border}`, fontSize:11,
                }}>
                  <div style={{fontWeight:700, color:C.text, fontSize:12}}>
                    {orig} → {dest}
                  </div>
                  <div style={{color:C.muted, fontSize:10}}>
                    {r.fecha} · <strong style={{color:C.text}}>{simbDest} {r.valor.toLocaleString("es-CL",{maximumFractionDigits:4})}</strong>
                  </div>
                  <div style={{fontSize:9, color:r.fuente==="manual"?C.yellow:C.green}}>{r.fuente}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{display:"flex", gap:8, marginBottom:10, flexWrap:"wrap"}}>
        <input value={filtroPar} onChange={e=>setFiltroPar(e.target.value)}
          placeholder="Filtrar por par (ej. USD)" style={{...inputSt, maxWidth:200}}/>
        <input type="text" value={filtroFecha} onChange={e=>setFiltroFecha(e.target.value)}
          placeholder="Filtrar fecha (ej. 2026-05)" style={{...inputSt, maxWidth:200}}/>
        <div style={{fontSize:11, color:C.muted, alignSelf:"center"}}>
          {filasFiltradas.length} de {filas.length} entradas
        </div>
      </div>

      {/* Tabla */}
      <div style={{overflowX:"auto", borderRadius:8, border:`1px solid ${C.border}`}}>
        <table style={{borderCollapse:"collapse", width:"100%", fontSize:11, minWidth:600}}>
          <thead>
            <tr style={{background:C.bg2}}>
              <th style={{padding:"8px 10px", textAlign:"left", color:C.muted, fontWeight:700, fontSize:10, borderBottom:`2px solid ${C.border}`}}>Par</th>
              <th style={{padding:"8px 10px", textAlign:"left", color:C.muted, fontWeight:700, fontSize:10, borderBottom:`2px solid ${C.border}`}}>Fecha</th>
              <th style={{padding:"8px 10px", textAlign:"right", color:C.muted, fontWeight:700, fontSize:10, borderBottom:`2px solid ${C.border}`}}>Valor</th>
              <th style={{padding:"8px 10px", textAlign:"center", color:C.muted, fontWeight:700, fontSize:10, borderBottom:`2px solid ${C.border}`}}>Fuente</th>
              {canEdit && <th style={{padding:"8px 10px", textAlign:"center", color:C.muted, fontWeight:700, fontSize:10, borderBottom:`2px solid ${C.border}`}}>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.length === 0 && (
              <tr><td colSpan={canEdit?5:4} style={{padding:30, textAlign:"center", color:C.muted, fontSize:12}}>
                {filas.length ? "Sin resultados con esos filtros" : "Sin tasas cargadas. Click \"🔄 Actualizar hoy\" para empezar."}
              </td></tr>
            )}
            {filasFiltradas.map(f => {
              const key = `${f.par}__${f.fecha}`;
              const isEditing = editingKey === key;
              return (
                <tr key={key} style={{borderBottom:`1px solid ${C.border}22`}}>
                  {isEditing ? (
                    <>
                      <td style={{padding:"6px 10px"}}>
                        <input value={editBuffer.par} onChange={e=>setEditBuffer({...editBuffer, par:e.target.value.toUpperCase()})} style={inputSt}/>
                      </td>
                      <td style={{padding:"6px 10px"}}>
                        <input type="date" value={editBuffer.fecha} onChange={e=>setEditBuffer({...editBuffer, fecha:e.target.value})} style={inputSt}/>
                      </td>
                      <td style={{padding:"6px 10px"}}>
                        <input type="number" step="0.0001" value={editBuffer.valor} onChange={e=>setEditBuffer({...editBuffer, valor:e.target.value})} style={inputSt}/>
                      </td>
                      <td style={{padding:"6px 10px"}}>
                        <select value={editBuffer.fuente||"manual"} onChange={e=>setEditBuffer({...editBuffer, fuente:e.target.value})} style={inputSt}>
                          <option value="manual">manual</option>
                          <option value="mindicador">mindicador</option>
                          <option value="frankfurter">frankfurter</option>
                        </select>
                      </td>
                      <td style={{padding:"6px 10px", textAlign:"center", whiteSpace:"nowrap"}}>
                        <button onClick={handleGuardarEdit} style={btnSt(C.green)}>✓</button>
                        <button onClick={()=>{setEditingKey(null); setEditBuffer({});}} style={{...btnSt(C.muted, true), marginLeft:4}}>✕</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{padding:"6px 10px", color:C.text, fontWeight:600}}>{f.par}</td>
                      <td style={{padding:"6px 10px", color:C.text, fontFamily:"monospace"}}>{f.fecha}</td>
                      <td style={{padding:"6px 10px", color:C.text, textAlign:"right", fontFamily:"monospace"}}>
                        {f.valor.toLocaleString("es-CL", {maximumFractionDigits:6})}
                      </td>
                      <td style={{padding:"6px 10px", textAlign:"center"}}>
                        <span style={{
                          fontSize:9, padding:"2px 6px", borderRadius:4,
                          background: f.fuente==="manual" ? `${C.yellow}22` : `${C.green}22`,
                          color:      f.fuente==="manual" ? C.yellow : C.green,
                        }}>{f.fuente}</span>
                      </td>
                      {canEdit && (
                        <td style={{padding:"6px 10px", textAlign:"center", whiteSpace:"nowrap"}}>
                          <button onClick={()=>handleEditar(f)} style={{...btnSt(C.blue, true), padding:"4px 8px"}}>✎</button>
                          <button onClick={()=>handleEliminar(f)} style={{...btnSt(C.accent, true), padding:"4px 8px", marginLeft:4}}>×</button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function FriskuMaestrosModule({canEdit=true, onBack}) {
  // Estado por maestro
  const [paises,         setPaises]         = useState([]);
  const [ciudades,       setCiudades]       = useState([]);
  const [puertos,        setPuertos]        = useState([]);
  const [aeropuertos,    setAeropuertos]    = useState([]);
  const [shippingLines,  setShippingLines]  = useState([]);
  const [lineasAereas,   setLineasAereas]   = useState([]);
  const [tiposEmbarque,  setTiposEmbarque]  = useState([]);
  const [tiposEmbalaje,  setTiposEmbalaje]  = useState([]);
  const [mercados,       setMercados]       = useState([]);
  const [monedas,        setMonedas]        = useState([]);
  const [especies,       setEspecies]       = useState([]);
  const [tcData,         setTcData]         = useState({});
  const [checklistDocs,  setChecklistDocs]  = useState([]);
  const [temporadas,     setTemporadas]     = useState([]);

  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState("paises");
  const [guardando, setGuardando] = useState({});

  // Cargar todos los maestros al montar
  useEffect(()=>{
    let alive = true;
    (async ()=>{
      // loadConSeed: si la fila no existe en Supabase, graba defaults
      // y los retorna (queda persistido para todos los usuarios).
      // dbLoadMaestro normal para los que NO se siembran (Ciudades vacío
      // intencionalmente, TC es objeto y se carga vía APIs externas).
      const [p, c, pu, ae, sl, la, te, tb, me, mo, es, tc, cd, tmp] = await Promise.all([
        loadConSeed("maestro_paises",         PAISES_DEFAULT),
        loadConSeed("maestro_ciudades",       CIUDADES_DEFAULT),
        loadConSeed("maestro_puertos",        PUERTOS_DEFAULT),
        loadConSeed("maestro_aeropuertos",    AEROPUERTOS_DEFAULT),
        loadConSeed("maestro_shipping_lines", SHIPPING_LINES_DEFAULT),
        loadConSeed("maestro_lineas_aereas",  LINEAS_AEREAS_DEFAULT),
        loadConSeed("maestro_tipos_embarque", TIPOS_EMBARQUE_DEFAULT),
        loadConSeed("maestro_tipos_embalaje", TIPOS_EMBALAJE_DEFAULT),
        loadConSeed("maestro_mercados",       MERCADOS_DEFAULT),
        loadConSeed("maestro_monedas",        MONEDAS_DEFAULT),
        loadConSeed("maestro_especies",       ESPECIES_DEFAULT),
        dbLoadMaestro("maestro_tc"),
        loadConSeed("maestro_checklist_docs", CHECKLIST_DOCS_DEFAULT),
        loadConSeed("maestro_temporadas",     TEMPORADAS_DEFAULT),
      ]);
      if(!alive) return;
      // Defensa en profundidad: si loadConSeed retornó algo inesperado
      // (red caída, JSON malformado), caer al default en memoria.
      setPaises(Array.isArray(p) ? p : PAISES_DEFAULT);
      setCiudades(Array.isArray(c) ? c : CIUDADES_DEFAULT);
      setPuertos(Array.isArray(pu) ? pu : PUERTOS_DEFAULT);
      setAeropuertos(Array.isArray(ae) ? ae : AEROPUERTOS_DEFAULT);
      setShippingLines(Array.isArray(sl) ? sl : SHIPPING_LINES_DEFAULT);
      setLineasAereas(Array.isArray(la) ? la : LINEAS_AEREAS_DEFAULT);
      setTiposEmbarque(Array.isArray(te) ? te : TIPOS_EMBARQUE_DEFAULT);
      setTiposEmbalaje(Array.isArray(tb) ? tb : TIPOS_EMBALAJE_DEFAULT);
      setMercados(Array.isArray(me) ? me : MERCADOS_DEFAULT);
      setMonedas(Array.isArray(mo) ? mo : MONEDAS_DEFAULT);
      setEspecies(Array.isArray(es) ? es : ESPECIES_DEFAULT);
      setTcData(tc && typeof tc === "object" && !Array.isArray(tc) ? tc : {});
      setChecklistDocs(Array.isArray(cd) ? cd : CHECKLIST_DOCS_DEFAULT);
      setTemporadas(Array.isArray(tmp) ? tmp : TEMPORADAS_DEFAULT);
      setCargando(false);
    })();
    return ()=>{alive=false;};
  },[]);

  // Auto-save por maestro (debounce 1s)
  const useAutoSave = (id, valor, listo=true) => {
    const timer = useRef(null);
    const primero = useRef(true);
    useEffect(()=>{
      if(cargando || !listo) return;
      if(primero.current) { primero.current = false; return; }
      if(timer.current) clearTimeout(timer.current);
      setGuardando(g => ({...g, [id]:true}));
      timer.current = setTimeout(async ()=>{
        await dbSaveMaestro(id, valor);
        setGuardando(g => ({...g, [id]:false}));
      }, 1000);
    },[valor]);
  };
  useAutoSave("maestro_paises", paises);
  useAutoSave("maestro_ciudades", ciudades);
  useAutoSave("maestro_puertos", puertos);
  useAutoSave("maestro_aeropuertos", aeropuertos);
  useAutoSave("maestro_shipping_lines", shippingLines);
  useAutoSave("maestro_lineas_aereas", lineasAereas);
  useAutoSave("maestro_tipos_embarque", tiposEmbarque);
  useAutoSave("maestro_tipos_embalaje", tiposEmbalaje);
  useAutoSave("maestro_mercados", mercados);
  useAutoSave("maestro_monedas", monedas);
  useAutoSave("maestro_especies", especies);
  useAutoSave("maestro_tc", tcData);
  useAutoSave("maestro_checklist_docs", checklistDocs);
  useAutoSave("maestro_temporadas", temporadas);

  // Mapas para mostrar nombres en lugar de códigos
  const paisesMap = useMemo(()=>{
    const m = {}; paises.forEach(p => m[p.codigo] = p); return m;
  },[paises]);

  // Helper para columnas que muestran país
  const renderPais = (codigo) => {
    const p = paisesMap[codigo];
    if(!p) return codigo || "—";
    return <span title={p.nombreEs}>{p.flag} {p.nombreEs}</span>;
  };

  // Opciones de país para selects
  const opcionesPaises = useMemo(()=>{
    return paises.map(p => ({value:p.codigo, label:`${p.flag} ${p.nombreEs} (${p.codigo})`}));
  },[paises]);

  // Restaurar presets faltantes (no borra existentes)
  const recargarPresets = (datosActuales, defaults, setDatos, claveId="codigo") => {
    const existentes = new Set(datosActuales.map(d => d[claveId]));
    const faltantes = defaults.filter(d => !existentes.has(d[claveId]));
    if(!faltantes.length) {
      alert("Todos los presets ya están cargados.");
      return;
    }
    if(window.confirm(`Esto agregará ${faltantes.length} registros faltantes desde los presets. ¿Continuar?`)) {
      setDatos([...datosActuales, ...faltantes]);
    }
  };

  if(cargando) {
    return (
      <div style={{padding:40, textAlign:"center", color:C.muted}}>
        Cargando maestros desde Supabase…
      </div>
    );
  }

  const tabs = [
    {id:"paises",          label:"🌍 Países",            count:paises.length},
    {id:"ciudades",        label:"🏙️ Ciudades",          count:ciudades.length},
    {id:"puertos",         label:"🚢 Puertos",           count:puertos.length},
    {id:"aeropuertos",     label:"✈️ Aeropuertos",       count:aeropuertos.length},
    {id:"shipping",        label:"⚓ Shipping Lines",    count:shippingLines.length},
    {id:"lineas_aereas",   label:"✈️ Líneas Aéreas",     count:lineasAereas.length},
    {id:"tipos_embarque",  label:"📦 Tipos de Embarque", count:tiposEmbarque.length},
    {id:"especies",        label:"🍒 Especies",          count:especies.length},
    {id:"tipos_embalaje",  label:"📐 Tipos de Embalaje", count:tiposEmbalaje.length},
    {id:"mercados",        label:"🎯 Mercados",          count:mercados.length},
    {id:"monedas",         label:"💱 Monedas",           count:monedas.length},
    {id:"tc",              label:"📈 Tipo de Cambio",    count:Object.keys(tcData||{}).length},
    {id:"checklist",       label:"📋 Checklist Docs",    count:checklistDocs.length},
    {id:"temporadas",      label:"📅 Temporadas",         count:temporadas.length},
  ];

  return (
    <div style={{padding:18, background:C.bg, minHeight:"100vh", color:C.text}}>
      {/* Header */}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, flexWrap:"wrap", gap:10}}>
        <div>
          <h2 style={{margin:0, fontSize:22, fontWeight:800, color:C.text}}>
            🗂️ Maestros Globales
          </h2>
          <div style={{fontSize:11, color:C.muted, marginTop:4}}>
            Frisku Foods · Catálogos base del sistema
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10, fontSize:11, color:C.muted}}>
          {Object.values(guardando).some(Boolean) ? (
            <span style={{color:C.yellow}}>💾 Guardando...</span>
          ) : (
            <span style={{color:C.green}}>● Sincronizado</span>
          )}
          {onBack && (
            <button onClick={onBack} style={btnSt(C.muted, true)}>← Volver</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex", flexWrap:"wrap", gap:4, marginBottom:18, borderBottom:`2px solid ${C.border}`}}>
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{
              padding:"9px 14px", border:"none", cursor:"pointer", fontSize:12,
              background: tab===t.id ? C.card : "transparent",
              color: tab===t.id ? C.text : C.muted,
              fontWeight: tab===t.id ? 700 : 500,
              borderBottom: tab===t.id ? `3px solid ${C.blue}` : "3px solid transparent",
              marginBottom:-2, borderRadius:"6px 6px 0 0",
              display:"flex", alignItems:"center", gap:6,
            }}>
            <span>{t.label}</span>
            <span style={{
              fontSize:9, padding:"1px 6px", borderRadius:8,
              background:tab===t.id ? C.blue : C.border,
              color:"#fff", fontWeight:700,
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Contenido de cada tab */}
      {tab === "paises" && (
        <TablaMaestro
          titulo="Países"
          icono="🌍"
          datos={paises}
          setDatos={setPaises}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(paises, PAISES_DEFAULT, setPaises)}
          busquedaPlaceholder="Buscar por código, nombre o región..."
          defaultItem={{codigo:"", nombreEs:"", nombreEn:"", flag:"🏳️", region:""}}
          columnas={[
            {key:"flag",     label:"",          align:"center", render:(v)=>v||"🏳️"},
            {key:"codigo",   label:"Código ISO"},
            {key:"nombreEs", label:"Nombre (ES)"},
            {key:"nombreEn", label:"Nombre (EN)"},
            {key:"region",   label:"Región"},
          ]}
        />
      )}

      {tab === "ciudades" && (
        <TablaMaestro
          titulo="Ciudades"
          icono="🏙️"
          datos={ciudades}
          setDatos={setCiudades}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(ciudades, CIUDADES_DEFAULT, setCiudades)}
          busquedaPlaceholder="Buscar ciudad..."
          defaultItem={{codigo:"", nombre:"", paisCodigo:"", observ:""}}
          columnas={[
            {key:"codigo",     label:"Código"},
            {key:"nombre",     label:"Nombre"},
            {key:"paisCodigo", label:"País", options:opcionesPaises, render:renderPais},
            {key:"observ",     label:"Observación"},
          ]}
        />
      )}

      {tab === "puertos" && (
        <TablaMaestro
          titulo="Puertos"
          icono="🚢"
          datos={puertos}
          setDatos={setPuertos}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(puertos, PUERTOS_DEFAULT, setPuertos)}
          busquedaPlaceholder="Buscar puerto por nombre, código UN/LOCODE o ciudad..."
          defaultItem={{codigo:"", nombre:"", paisCodigo:"", tipo:"Marítimo", ciudad:""}}
          columnas={[
            {key:"codigo",     label:"UN/LOCODE"},
            {key:"nombre",     label:"Nombre"},
            {key:"ciudad",     label:"Ciudad"},
            {key:"paisCodigo", label:"País", options:opcionesPaises, render:renderPais},
            {key:"tipo",       label:"Tipo", options:[
              {value:"Marítimo", label:"Marítimo"},
              {value:"Fluvial",  label:"Fluvial"},
              {value:"Marítimo/Fluvial", label:"Marítimo/Fluvial"},
            ]},
          ]}
        />
      )}

      {tab === "aeropuertos" && (
        <TablaMaestro
          titulo="Aeropuertos"
          icono="✈️"
          datos={aeropuertos}
          setDatos={setAeropuertos}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(aeropuertos, AEROPUERTOS_DEFAULT, setAeropuertos)}
          busquedaPlaceholder="Buscar por código IATA, nombre o ciudad..."
          defaultItem={{codigo:"", nombre:"", paisCodigo:"", ciudad:""}}
          columnas={[
            {key:"codigo",     label:"IATA"},
            {key:"nombre",     label:"Nombre"},
            {key:"ciudad",     label:"Ciudad"},
            {key:"paisCodigo", label:"País", options:opcionesPaises, render:renderPais},
          ]}
        />
      )}

      {tab === "shipping" && (
        <TablaMaestro
          titulo="Shipping Lines"
          icono="⚓"
          datos={shippingLines}
          setDatos={setShippingLines}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(shippingLines, SHIPPING_LINES_DEFAULT, setShippingLines)}
          busquedaPlaceholder="Buscar naviera..."
          defaultItem={{codigo:"", nombre:"", paisCodigo:"", website:"", observ:""}}
          columnas={[
            {key:"codigo",     label:"SCAC", align:"center"},
            {key:"nombre",     label:"Nombre"},
            {key:"paisCodigo", label:"País Origen", options:opcionesPaises, render:renderPais},
            {key:"website",    label:"Website"},
            {key:"observ",     label:"Observación"},
          ]}
        />
      )}

      {tab === "lineas_aereas" && (
        <TablaMaestro
          titulo="Líneas Aéreas"
          icono="✈️"
          datos={lineasAereas}
          setDatos={setLineasAereas}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(lineasAereas, LINEAS_AEREAS_DEFAULT, setLineasAereas)}
          busquedaPlaceholder="Buscar línea aérea..."
          defaultItem={{codigo:"", nombre:"", paisCodigo:"", website:"", observ:""}}
          columnas={[
            {key:"codigo",     label:"IATA", align:"center"},
            {key:"nombre",     label:"Nombre"},
            {key:"paisCodigo", label:"País Origen", options:opcionesPaises, render:renderPais},
            {key:"website",    label:"Website"},
            {key:"observ",     label:"Observación"},
          ]}
        />
      )}

      {tab === "tipos_embarque" && (
        <TablaMaestro
          titulo="Tipos de Embarque"
          icono="📦"
          datos={tiposEmbarque}
          setDatos={setTiposEmbarque}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(tiposEmbarque, TIPOS_EMBARQUE_DEFAULT, setTiposEmbarque)}
          busquedaPlaceholder="Buscar tipo de embarque..."
          defaultItem={{codigo:"", nombre:"", descripcion:"", icono:"📦"}}
          columnas={[
            {key:"icono",       label:"", align:"center"},
            {key:"codigo",      label:"Código"},
            {key:"nombre",      label:"Nombre"},
            {key:"descripcion", label:"Descripción"},
          ]}
        />
      )}

      {tab === "especies" && (
        <TablaMaestro
          titulo="Especies de Fruta"
          icono="🍒"
          datos={especies}
          setDatos={setEspecies}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(especies, ESPECIES_DEFAULT, setEspecies)}
          busquedaPlaceholder="Buscar especie por código, nombre o familia..."
          defaultItem={{codigo:"", nombreEs:"", nombreEn:"", icono:"🍎", familia:"Otros", kgPorCajaDefault:0, unidadComercial:"kg", temporadaInicio:"", temporadaFin:"", observ:""}}
          columnas={[
            {key:"icono",             label:"",          align:"center", render:(v)=>v||"🍎"},
            {key:"codigo",            label:"Código"},
            {key:"nombreEs",          label:"Nombre (ES)"},
            {key:"nombreEn",          label:"Nombre (EN)"},
            {key:"familia",           label:"Familia", options:[
              {value:"Carozos",     label:"Carozos"},
              {value:"Berries",     label:"Berries"},
              {value:"Pomáceas",    label:"Pomáceas"},
              {value:"Cítricos",    label:"Cítricos"},
              {value:"Tropicales",  label:"Tropicales"},
              {value:"Otros",       label:"Otros"},
            ]},
            {key:"kgPorCajaDefault",  label:"Kg/Caja", type:"number", align:"right"},
            {key:"unidadComercial",   label:"Unidad", align:"center"},
            {key:"temporadaInicio",   label:"Temp. Inicio", align:"center"},
            {key:"temporadaFin",      label:"Temp. Fin", align:"center"},
            {key:"observ",            label:"Observación"},
          ]}
        />
      )}

      {tab === "tipos_embalaje" && (()=> {
        // Detectar items con `especie` legacy pero sin `especieCodigo` que puedan migrarse
        const legacyMigrables = tiposEmbalaje.filter(t => {
          if(t.especieCodigo) return false;
          if(!t.especie) return false;
          return especies.some(e => e.nombreEs.toLowerCase() === String(t.especie).toLowerCase());
        });
        const legacySinMatch = tiposEmbalaje.filter(t => {
          if(t.especieCodigo) return false;
          if(!t.especie) return false;
          return !especies.some(e => e.nombreEs.toLowerCase() === String(t.especie).toLowerCase());
        });
        const migrarLegacy = () => {
          if(!window.confirm(`Se asignará "especieCodigo" a ${legacyMigrables.length} embalaje${legacyMigrables.length>1?"s":""} basado en el campo "especie" actual. El campo legacy se mantiene como respaldo. ¿Continuar?`)) return;
          setTiposEmbalaje(prev => prev.map(t => {
            if(t.especieCodigo) return t;
            const match = especies.find(e => e.nombreEs.toLowerCase() === String(t.especie||"").toLowerCase());
            return match ? {...t, especieCodigo: match.codigo} : t;
          }));
        };
        return (
          <>
            {(legacyMigrables.length > 0 || legacySinMatch.length > 0) && canEdit && (
              <div style={{
                marginBottom:14, padding:"10px 14px", borderRadius:8,
                background:`${C.yellow}11`, border:`1px solid ${C.yellow}44`,
                display:"flex", alignItems:"center", gap:12, flexWrap:"wrap",
              }}>
                <span style={{fontSize:18}}>⚠️</span>
                <div style={{flex:1, fontSize:11, color:C.text, lineHeight:1.5}}>
                  {legacyMigrables.length > 0 && (
                    <div>
                      <strong>{legacyMigrables.length}</strong> embalaje{legacyMigrables.length>1?"s":""} con especie legacy (texto libre) que se {legacyMigrables.length>1?"pueden":"puede"} vincular automáticamente al maestro de Especies.
                    </div>
                  )}
                  {legacySinMatch.length > 0 && (
                    <div style={{color:C.muted, marginTop:legacyMigrables.length?4:0}}>
                      <strong>{legacySinMatch.length}</strong> con especie "{legacySinMatch.map(t=>t.especie).filter((v,i,a)=>a.indexOf(v)===i).join(", ")}" no tiene match en el maestro — agrega esa especie primero o edítalas manualmente.
                    </div>
                  )}
                </div>
                {legacyMigrables.length > 0 && (
                  <button onClick={migrarLegacy} style={btnSt(C.yellow)}>
                    🔗 Migrar {legacyMigrables.length} embalaje{legacyMigrables.length>1?"s":""}
                  </button>
                )}
              </div>
            )}
            <TablaMaestro
              titulo="Tipos de Embalaje"
              icono="📐"
              datos={tiposEmbalaje}
              setDatos={setTiposEmbalaje}
              canEdit={canEdit}
              presetsParcial={true}
              onPresetRestore={()=>recargarPresets(tiposEmbalaje, TIPOS_EMBALAJE_DEFAULT, setTiposEmbalaje)}
              busquedaPlaceholder="Buscar embalaje por especie o nombre..."
              defaultItem={{codigo:"", nombre:"", especieCodigo:"", kgPorUnidad:0, unidad:"kg", observ:""}}
              columnas={[
                {key:"codigo",         label:"Código"},
                {key:"nombre",         label:"Nombre"},
                {key:"especieCodigo",  label:"Especie", options:especies.map(e=>({value:e.codigo, label:`${e.icono} ${e.nombreEs}`})),
                  render:(v, row) => {
                    if(v) {
                      const e = especies.find(e=>e.codigo===v);
                      return e ? <span>{e.icono} {e.nombreEs}</span> : v;
                    }
                    return row.especie ? <span style={{color:C.yellow}} title="Campo legacy — use el botón de migración">{row.especie}</span> : "—";
                  }},
                {key:"kgPorUnidad",    label:"Kg/Unidad", type:"number", align:"right"},
                {key:"unidad",         label:"Unidad"},
                {key:"observ",         label:"Observación"},
              ]}
            />
          </>
        );
      })()}

      {tab === "mercados" && (
        <TablaMaestro
          titulo="Mercados de Destino"
          icono="🎯"
          datos={mercados}
          setDatos={setMercados}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(mercados, MERCADOS_DEFAULT, setMercados)}
          busquedaPlaceholder="Buscar mercado..."
          defaultItem={{codigo:"", nombre:"", region:"", paisesCodigos:[]}}
          columnas={[
            {key:"codigo", label:"Código"},
            {key:"nombre", label:"Nombre"},
            {key:"region", label:"Región"},
            {key:"paisesCodigos", label:"Países", render:(v) => {
              if(!Array.isArray(v) || !v.length) return <span style={{color:C.muted2}}>—</span>;
              return <span style={{fontSize:10}}>{v.map(c => paisesMap[c]?.flag || c).join(" ")}  <span style={{color:C.muted}}>({v.length})</span></span>;
            }},
          ]}
        />
      )}

      {tab === "monedas" && (
        <TablaMaestro
          titulo="Monedas (ISO 4217)"
          icono="💱"
          datos={monedas}
          setDatos={setMonedas}
          canEdit={canEdit}
          presetsParcial={true}
          onPresetRestore={()=>recargarPresets(monedas, MONEDAS_DEFAULT, setMonedas)}
          busquedaPlaceholder="Buscar moneda..."
          defaultItem={{codigo:"", nombre:"", simbolo:"", paisCodigo:"", default:false}}
          columnas={[
            {key:"codigo",     label:"ISO", align:"center"},
            {key:"simbolo",    label:"Símbolo", align:"center"},
            {key:"nombre",     label:"Nombre"},
            {key:"paisCodigo", label:"País", options:opcionesPaises, render:renderPais},
            {key:"default",    label:"Default", align:"center", render:(v) => v ? "★" : "—"},
          ]}
        />
      )}

      {tab === "tc" && (
        <TipoCambioEditor
          tcData={tcData}
          setTcData={setTcData}
          monedas={monedas}
          canEdit={canEdit}
        />
      )}

      {tab === "checklist" && (
        <ChecklistDocsEditor
          datos={checklistDocs}
          setDatos={setChecklistDocs}
          tiposEmbarque={tiposEmbarque}
          mercados={mercados}
          canEdit={canEdit}
        />
      )}

      {tab === "temporadas" && (
        <TemporadasEditor
          temporadas={temporadas}
          setTemporadas={setTemporadas}
          canEdit={canEdit}
        />
      )}

      {/* Footer info */}
      <div style={{marginTop:30, padding:14, background:C.card2, borderRadius:8, fontSize:11, color:C.muted, lineHeight:1.6}}>
        💡 <strong>Notas:</strong>
        <ul style={{margin:"6px 0 0 16px", padding:0}}>
          <li>Los cambios se guardan automáticamente cada segundo en Supabase</li>
          <li>El botón <strong>↻ Recargar presets</strong> agrega los valores por defecto que falten, sin tocar los que ya tienes</li>
          <li>El botón <strong>⇩ CSV</strong> exporta los datos actuales (después del filtro de búsqueda)</li>
          <li>Las plantillas de Checklist se aplicarán automáticamente cuando crees una Orden de Embarque que coincida con su tipo+mercado (Fase siguiente)</li>
        </ul>
      </div>
    </div>
  );
}
