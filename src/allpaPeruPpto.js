/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// PRESUPUESTO OPERACIÓN — Allpa Farms Perú 2026 (USD, mensual Ene→Dic)
// Fuente: "carga ptto 2026 allpa per.xlsx". Reconcilia exacto con el
// presupuesto (total 2026 = US$4.298.006, incluye Imprevistos).
// Los costos crecen +5% por año CALENDARIO sobre el patrón 2026.
// Flujo Allpa Perú se maneja aparte (fuera del consolidado, IAS 28).
// ═══════════════════════════════════════════════════════════════════
export const ALLPA_PERU_GROWTH = 0.05;

// ── INGRESOS base 2026 (parametrizables, editables en la app) ──
// Producción de kilos por mes calendario (Ene..Dic) y precio USD/kg.
// Ingreso mensual = kilos_mes × precio. Cosecha Jun–Dic. Total 2026 = US$5.635.322.
export const ALLPA_PERU_KG_2026 = [0,0,0,0,0,1406.59,71979.11,199387.15,328168.69,325172.44,81270.21,17219.82];
export const ALLPA_PERU_PRECIO_2026 = 5.5;

// cat: egr_var | egr_fijo · base: 12 meses Ene..Dic 2026 (USD)
export const ALLPA_PERU_PPTO_2026 = [
  { cat:'egr_var', label:'Var Campo · PROGRAMA FITOSANITARIO', base:[42435.8,28257.4,34051.2,19176.2,25734.6,30019,25384.4,15946.2,29434.9,14006.7,12272.5,27889.2] },
  { cat:'egr_var', label:'Var Campo · PROGRAMA FERTILIZANTES', base:[8333.63,7595.38,12921,11439.1,13044.3,17693.4,15903.7,16210.5,19596.3,14314.6,15577.3,4407.65] },
  { cat:'egr_var', label:'Var Campo · AGUA PARA RIEGO', base:[9800,7840,9800,7840,7840,9800,7840,7840,9800,7840,9560,7600] },
  { cat:'egr_var', label:'Var Campo · ALQUILER DE BAÑOS QUÍMICOS', base:[970.59,485.29,485.29,485.29,485.29,0,0,0,0,0,0,0] },
  { cat:'egr_var', label:'Var Campo · ATENCIÓN MÉDICA', base:[0,0,0,50,50,50,50,50,50,50,50,50] },
  { cat:'egr_var', label:'Var Campo · EXÁMENES MÉDICOS OCUPACIONALES', base:[0,0,0,0,0,1866.67,0,0,0,0,0,0] },
  { cat:'egr_var', label:'Var Campo · EPPS', base:[100,100,100,100,100,533.33,533.33,533.33,533.33,533.33,533.33,533.33] },
  { cat:'egr_var', label:'Var Campo · ENERGÍA ELÉCTRICA (TENDIDO ELÉCTRICO)', base:[5000,5000,5000,5000,5000,5000,5000,5000,5000,5000,5000,5000] },
  { cat:'egr_var', label:'Var Campo · ALQUILER DE GRUPO ELECTRÓGENO', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_var', label:'Var Campo · COMBUSTIBLE PARA GRUPO ELECTRÓGENO', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_var', label:'Var Campo · LABORES CULTURALES', base:[30298.2,17481.8,14758.4,22856.9,16374.3,15455.2,21300.8,19446.4,16431.7,18687.8,14600.9,45895.4] },
  { cat:'egr_var', label:'Var Campo · COSECHA', base:[0,0,0,0,3074.95,42723.4,179179,229644,194127,92837.9,18135.7,375.82] },
  { cat:'egr_var', label:'Var Campo · RETENCION DE PERSONAL DE COSECHA(SORTEOS/PREMIOS/ETC)', base:[0,0,0,0,0,0,2500,4000,4000,5000,2000,1000] },
  { cat:'egr_var', label:'Var Campo · MAQUINARIA  (ARRIENDO)', base:[1637.33,1644.23,1837.43,2009.93,16693.9,31272.4,28895.4,25028.3,18251.8,9508.19,592.31,168.78] },
  { cat:'egr_var', label:'Var Campo · SUMINISTROS DIVERSOS', base:[4500.37,2658.58,10766.4,27097,28104.4,5719.5,4328.84,2658.58,4336.84,2792.2,4557.47,5791.47] },
  { cat:'egr_var', label:'Var Campo · TRANSPORTE DE PERSONAL', base:[760.75,439.32,371.21,574.54,485.62,1439.17,4958.29,6158.62,5204.58,2759.18,811.33,1288.96] },
  { cat:'egr_fijo', label:'Fijo Campo · ALIMENTACIÓN AL PERSONAL CAMPO / ADMINISTRACION - OPERACIONES', base:[950.93,549.15,464.02,718.18,607.03,1798.96,6197.87,7698.27,6505.73,3448.98,1014.16,1611.2] },
  { cat:'egr_fijo', label:'Fijo Campo · ALQUILER DE CAMIONETA PARA CAMPO', base:[1840,1840,1840,1840,1840,1840,1840,1840,1840,1840,1840,1840] },
  { cat:'egr_fijo', label:'Fijo Campo · ANÁLISIS DE LABORATORIO', base:[829.41,694.12,1311.76,617.65,694.12,1235.29,752.94,617.65,1235.29,617.65,617.65,0] },
  { cat:'egr_fijo', label:'Fijo Campo · ASESORÍA AGRÍCOLA', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · ALOJAMIENTO ASESOR', base:[250,250,250,250,250,250,250,250,250,250,250,250] },
  { cat:'egr_fijo', label:'Fijo Campo · ASESORÍA PARA CERTIFICACIÓN DE CAMPO', base:[0,300,300,300,300,300,300,200,0,0,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · AUDITORÍA PARA CERTIFICACIÓN GLOBAL', base:[0,0,2500,2500,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · CONTROL AVIAR', base:[0,0,0,0,0,2453.33,2453.33,2453.33,2453.33,2453.33,2453.33,2453.33] },
  { cat:'egr_fijo', label:'Fijo Campo · CISTERNA PARA RIEGO DE CAMINOS', base:[160,160,160,160,160,160,160,160,160,160,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · CONTROL HIDROELÉCTRICO DE POZOS', base:[0,367.65,0,367.65,0,367.65,0,367.65,0,367.65,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · LIMPIEZA DE BIODIGESTORES', base:[0,0,0,0,0,735.29,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · MANTENIMIENTO DE CAMINOS', base:[0,0,0,0,4200,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · MANTENIMIENTO DE EDIFICACIONES', base:[0,0,0,0,0,0,350,0,0,350,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · MANTENIMIENTO DE PLANTA DE OSMOSIS', base:[441.18,0,0,0,0,0,0,147.06,0,0,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · MANTENIMIENTO DE LÍNEA ELÉCTRICA', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · MANTENIMIENTO DE EQUIPOS DE RIEGO', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · MANTENIMIENTO MAQUINARIA AGRÍCOLA', base:[205.88,205.88,205.88,205.88,205.88,205.88,205.88,205.88,205.88,205.88,205.88,205.88] },
  { cat:'egr_fijo', label:'Fijo Campo · MANTENIMIENTO DE MOBILIARIO', base:[0,200,0,200,0,200,0,200,0,0,0,0] },
  { cat:'egr_fijo', label:'Fijo Campo · REPUESTOS', base:[200,200,200,200,200,200,200,200,200,200,200,0] },
  { cat:'egr_fijo', label:'Fijo Campo · JEFE DE PRODUCCIÓN', base:[5812.26,5812.26,5812.26,5812.26,8922.09,5812.26,11625.7,5812.26,5812.26,5812.26,8922.09,11625.7] },
  { cat:'egr_fijo', label:'Fijo Campo · JEFA DE FUNDO', base:[2564.71,2564.71,2564.71,2564.71,3936.94,2564.71,5129.92,2564.71,2564.71,2564.71,3936.94,5129.92] },
  { cat:'egr_fijo', label:'Fijo Campo · SUPERVISORA DE PRODUCCIÓN', base:[1057.94,1057.94,1057.94,1057.94,1623.99,1057.94,2116.09,1057.94,1057.94,1057.94,1623.99,2116.09] },
  { cat:'egr_fijo', label:'Fijo Campo · SUPERVISOR DE SANIDAD', base:[1099.62,1099.62,1099.62,1099.62,1687.96,1099.62,2199.46,1099.62,1099.62,1099.62,1687.96,2199.46] },
  { cat:'egr_fijo', label:'Fijo Campo · SUPERVISOR DE RIEGO', base:[0,0,961.76,961.76,961.76,961.76,961.76,961.76,961.76,961.76,961.76,961.76] },
  { cat:'egr_fijo', label:'Fijo Campo · SUPERVISOR DE SEGURIDAD Y SALUD', base:[0,843.15,843.15,843.15,843.15,843.15,843.15,843.15,843.15,843.15,843.15,843.15] },
  { cat:'egr_fijo', label:'Fijo Campo · ENFERMERA', base:[0,0,0,0,0,682.85,682.85,682.85,682.85,682.85,682.85,682.85] },
  { cat:'egr_fijo', label:'Fijo Campo · SUPERVISOR DE CALIDAD DE CERTIFICACIONES', base:[0,0,0,0,0,843.15,843.15,843.15,843.15,843.15,843.15,843.15] },
  { cat:'egr_fijo', label:'Fijo Campo · ÚTILES DE LIMPIEZA', base:[50,50,50,200,100,93.33,93.33,93.33,93.33,93.33,93.33,93.33] },
  { cat:'egr_fijo', label:'Fijo Campo · ÚTILES DE OFICINA', base:[100,100,100,100,100,80,80,80,80,80,80,80] },
  { cat:'egr_fijo', label:'Fijo Campo · VIGILANCIA PRIVADA', base:[4059.82,4059.82,4059.82,4059.82,4059.82,4059.82,4059.82,4059.82,4059.82,4059.82,4059.82,4059.82] },
  { cat:'egr_fijo', label:'Admin · ALIMENTACIÓN PERSONAL ADMINISTRATIVO', base:[735.29,735.29,735.29,735.29,735.29,1029.41,1029.41,1029.41,1029.41,1029.41,1029.41,1029.41] },
  { cat:'egr_fijo', label:'Admin · ALQUILER DE CAMIONETA PARA ADMINISTRACIÓN', base:[1840,1840,1840,1840,1840,1840,1840,1840,1840,1840,1840,1840] },
  { cat:'egr_fijo', label:'Admin · ASESORÍA LEGAL', base:[500,500,500,500,500,500,500,500,500,500,500,500] },
  { cat:'egr_fijo', label:'Admin · ASESORÍA CONTABLE-TRIBUTARIA', base:[600,600,600,600,600,600,600,600,600,600,600,441.18] },
  { cat:'egr_fijo', label:'Admin · AUDITORÍA FINANCIERA', base:[0,0,0,0,0,0,0,6000,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · EXÁMENES MÉDICOS OCUPACIONALES', base:[0,0,0,0,0,2941.18,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · DISPOSICIÓN DE RESIDUOS PELIGROSOS', base:[0,0,0,0,0,323.53,0,0,0,0,323.53,0] },
  { cat:'egr_fijo', label:'Admin · IMPACTO AMBIENTAL (PAMA)', base:[0,5000,5000,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · IMPLEMENTACIÓN SEGURIDAD Y SALUD EN EL TRABAJO', base:[0,0,5000,5000,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · MONITOREO AMBIENTAL ANUAL', base:[0,0,0,0,1744.77,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · MONITOREO AMBIENTAL RUIDO', base:[0,872.38,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · CERTIFICADO ITSE- DEFENSA CIVIL', base:[0,88.24,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · LICENCIA DE FUNCIONAMIENTO- MUNICIPALIDAD', base:[1600,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · CERTIFICADO DE LUGAR DE PRODUCCIÓN- SENASA', base:[0,432.94,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · COMBUSTIBLES Y PEAJES', base:[1760,1760,1760,1760,1760,1760,1760,3760,1760,1760,1760,1760] },
  { cat:'egr_fijo', label:'Admin · MANTENIMIENTO NISIRA', base:[0,0,2300,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · SERVIDOR NUBE NISIRA', base:[350,350,350,350,350,350,350,350,350,350,350,350] },
  { cat:'egr_fijo', label:'Admin · INTERNET STARLINK', base:[200,200,200,200,200,200,200,200,200,200,200,200] },
  { cat:'egr_fijo', label:'Admin · TELEFONIA', base:[160,160,160,160,160,160,160,160,160,160,160,160] },
  { cat:'egr_fijo', label:'Admin · LIMPIEZA DE BIODIGESTORES', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · MANTENIMIENTO DE EDIFICACIONES', base:[0,0,350,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · MANTENIMIENTO DE EQUIPOS DIVERSOS', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · MANTENIMIENTO DE AIRE ACONDICIONADO', base:[400,0,0,0,0,0,400,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · MANTENIMIENTO DE CAMIONETA', base:[533.33,533,533.33,533,533.33,533,533.33,533,533.33,533,533.33,533] },
  { cat:'egr_fijo', label:'Admin · ACTIVOS MENORES', base:[0,0,0,0,100,100,100,100,100,100,100,10] },
  { cat:'egr_fijo', label:'Admin · AGUA EN BIDÓN', base:[35,35,35,35,35,35,35,35,35,35,35,35] },
  { cat:'egr_fijo', label:'Admin · CONTROL DE PLAGAS', base:[13.33,13.33,13.33,13.33,13.33,13.33,13.33,13.33,13.33,13.33,13.33,13] },
  { cat:'egr_fijo', label:'Admin · DESRATIZACIÓN / FUMIGACIÓN', base:[0,0,0,200,0,0,0,200,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · EVENTOS Y AGASAJOS', base:[0,0,0,0,3600,4000,0,0,0,0,0,8427] },
  { cat:'egr_fijo', label:'Admin · FORMATOS E IMPRESIONES', base:[10,10,10,10,10,20,20,20,20,20,20,20] },
  { cat:'egr_fijo', label:'Admin · MEDICAMENTOS', base:[213.33,0,213,0,213.33,0,213,0,213.33,0,0,0] },
  { cat:'egr_fijo', label:'Admin · PASAJES AÉREOS ADMINISTRACIÓN', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · SOBRES Y ENCOMIENDAS', base:[13.33,13.33,13.33,13.33,13.33,13.33,40,40,40,40,40,40] },
  { cat:'egr_fijo', label:'Admin · ÚTILES DE LIMPIEZA', base:[320,0,320,0,320,0,320,0,320,0,0,320] },
  { cat:'egr_fijo', label:'Admin · ÚTILES DE OFICINA', base:[713.33,0,213,0,713.33,0,713,0,713.33,0,0,713] },
  { cat:'egr_fijo', label:'Admin · SEGURO MULTIRRIESGO', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · SEGURO ROBO', base:[0,0,0,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · SEGURO SOAT', base:[0,0,0,58.82,0,0,0,0,0,0,0,58.82] },
  { cat:'egr_fijo', label:'Admin · SEGURO VEHICULAR', base:[0,0,0,1200,0,0,0,0,0,0,0,1200] },
  { cat:'egr_fijo', label:'Admin · SEGURO FUNDO ALLPA', base:[666.67,666.67,666.67,666.67,666.67,666.67,666.67,666.67,666.67,666.67,666.67,666.67] },
  { cat:'egr_fijo', label:'Admin · JEFE DE ADMINISTRACIÓN', base:[2862.85,2862.85,2862.85,2862.85,4394.61,2862.85,5726.28,2862.85,2862.85,2862.85,4394.61,5726.28] },
  { cat:'egr_fijo', label:'Admin · COORDINADOR DE RECURSOS HUMANOS', base:[1388.15,1388.15,1388.15,1388.15,2130.87,1388.15,2776.57,1388.15,1388.15,1388.15,2130.87,2776.57] },
  { cat:'egr_fijo', label:'Admin · LOGISTICA', base:[865.59,865.59,865.59,865.59,1328.72,865.59,1731.35,865.59,865.59,865.59,1328.72,1731.35] },
  { cat:'egr_fijo', label:'Admin · AUXILIAR DE ALMACEN', base:[641.18,641.18,641.18,641.18,984.24,641.18,1282.48,641.18,641.18,641.18,984.24,1282.48] },
  { cat:'egr_fijo', label:'Admin · CONTADOR', base:[2292.21,2292.21,2292.21,2292.21,3518.64,2292.21,4584.87,2292.21,2292.21,2292.21,3518.64,4584.87] },
  { cat:'egr_fijo', label:'Admin · ASISTENTE DE CONTABILIDAD', base:[0,0,0,0,0,0,641.18,641.18,641.18,641.18,869.88,1282.48] },
  { cat:'egr_fijo', label:'Admin · ASISTENTE DE RECURSOS HUMANOS', base:[0,0,0,0,0,0,641.18,641.18,641.18,641.18,869.88,1282.48] },
  { cat:'egr_fijo', label:'Admin · COMERCIO EXTERIOR', base:[0,0,0,0,0,0,641.18,641.18,641.18,641.18,869.88,1282.48] },
  { cat:'egr_fijo', label:'Admin · CUOTA DE ASOCIADO CÁMARA DE COMERCIO', base:[0,0,323.53,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · CUOTA DE ASOCIADO PRO ARANDANOS ( SACARLO )', base:[0,0,900,0,0,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · INFORMES AGRÍCOLAS', base:[0,0,0,0,735.29,0,0,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · GASTOS CORPORATIVOS', base:[1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000] },
  { cat:'egr_var', label:'Packing · Traslado a maquila', base:[0,0,0,0,0,3700.01,17446.7,29867.4,37745.8,10678,2881.9,0] },
  { cat:'egr_var', label:'Packing · Servicio de maquila', base:[0,0,0,0,0,11100,52340.1,89602.2,113237,32033.9,8645.71,0] },
  { cat:'egr_var', label:'Packing · Materiales', base:[0,0,0,0,0,8584.01,40476.3,69292.4,87570.2,24772.9,6686.02,0] },
  { cat:'egr_var', label:'Packing · Servicio logístico', base:[0,0,0,0,0,7400.01,34893.4,59734.8,75491.5,21355.9,5763.81,0] },
  { cat:'egr_var', label:'Otros · ROYALTY IQ', base:[0,0,0,0,138000,0,0,0,0,0,0,0] },
  { cat:'egr_var', label:'Otros · FEE DE ADMINISTRACIÓN', base:[0,0,0,92000,0,0,0,0,0,0,0,0] },
  { cat:'egr_var', label:'Otros · FEE ALLEGRIA FOODS', base:[0,0,0,0,0,386.81,19794.3,54831.5,90246.4,89422.4,22349.3,4735.45] },
  { cat:'egr_var', label:'Otros · ALQUILER DE TERRENO', base:[0,0,0,0,0,0,315000,0,0,0,0,0] },
  { cat:'egr_fijo', label:'Admin · IMPREVISTOS EN LA CAMPAÑA', base:[3000,3000,3000,3000,3000,3000,3000,3000,3000,3000,3000,3000] },
];

// Genera proy de 63 meses (Apr-26 → Jun-31) con +5%/año calendario.
// Devuelve { egr_var:[{label,proy}], egr_fijo:[{label,proy}] }.
export function buildAllpaPeruLineas() {
  const horizon = [];
  let y = 2026, m = 3;                 // Apr-26
  while (horizon.length < 63) { horizon.push({ y, cm:m }); m++; if (m > 11) { m = 0; y++; } }
  const out = { egr_var:[], egr_fijo:[] };
  ALLPA_PERU_PPTO_2026.forEach(ln => {
    const proy = horizon.map(({ y, cm }) => {
      // Abr-May-Jun 2026 (cm 3,4,5) van en cero; el patrón base se conserva
      // para que 2027+ sigan proyectando esos meses con el +5%.
      if (y === 2026 && cm >= 3 && cm <= 5) return 0;
      const f = Math.pow(1 + ALLPA_PERU_GROWTH, y - 2026);
      return Math.round(((ln.base[cm] || 0) * f) * 100) / 100;
    });
    (out[ln.cat] || (out[ln.cat] = [])).push({ label: ln.label, proy });
  });
  return out;
}
