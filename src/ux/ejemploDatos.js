/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// UX EJECUTIVO · BLOB DE EJEMPLO
// ═══════════════════════════════════════════════════════════════════
//
// Datos ficticios con la MISMA forma que la fila `calendario_data` id="osiris":
// claves `contratos / clientes / obtentores / variedades / especies / viveros`,
// con `plantaciones[]` y `ordenesCompra[]` dentro de cada contrato.
//
// Sirve para dos cosas: montar el prototipo sin tocar la base, y darle a las
// pruebas un caso con todos los estados representados (firmado y sin firmar,
// vigente, por vencer y vencido, tarifa en cero, sin mes de facturación).
//
// Nombres inventados a propósito. Ningún dato real de clientes del grupo
// vive en este archivo.

// Fecha de referencia fija: las pruebas necesitan que "vence en 45 días"
// siga siendo 45 días el año que viene.
//
// Se construye con componentes LOCALES y no desde una cadena ISO con Z. Con
// `new Date("2026-08-28T12:00:00Z")` la fecha depende del huso de la máquina
// que corre la prueba: en Chile es el 28 de agosto, en UTC+14 es el 29, y las
// cuentas de días daban distinto según dónde se corriera. Así el ejemplo es
// el mismo día de calendario en cualquier parte.
export const HOY_EJEMPLO = new Date(2026, 7, 28, 12, 0, 0);

// Día de calendario a N días de la referencia, en formato "AAAA-MM-DD".
// `setDate` resuelve solo el cambio de mes, de año y el horario de verano.
const dias = (n) => {
  const d = new Date(2026, 7, 28);
  d.setDate(d.getDate() + n);
  const dosDigitos = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
};

export const DATOS_EJEMPLO = {
  clientes: [
    { id: "cli1", razonSocial: "Agrícola Los Maitenes", nombreComercial: "Los Maitenes", taxID: "76.111.222-3", pais: "Chile", ciudad: "Curicó", repLegal: "M. Rojas", contactoCobranza: "cobranza@ejemplo.cl" },
    { id: "cli2", razonSocial: "Valle Norte SAC", nombreComercial: "Valle Norte", taxID: "20501234567", pais: "Peru", ciudad: "Trujillo", repLegal: "J. Ramírez", contactoCobranza: "" },
    { id: "cli3", razonSocial: "Campos del Bajío", nombreComercial: "", taxID: "CDB900101ABC", pais: "Mexico", ciudad: "Guanajuato", repLegal: "", contactoCobranza: "" },
  ],

  especies: [
    { id: "esp1", nombre: "Arándano", color: "#4c6ef5" },
    { id: "esp2", nombre: "Cereza", color: "#c0392b" },
  ],

  variedades: [
    { id: "var1", especie: "Arándano", variedad: "Ventura", obtentor: "Genética Austral", nRegistro: "PBR-1120" },
    { id: "var2", especie: "Arándano", variedad: "Rocío", obtentor: "Genética Austral", nRegistro: "PBR-1121" },
    { id: "var3", especie: "Cereza", variedad: "Emerald", obtentor: "Breeding House", nRegistro: "" },
  ],

  obtentores: [
    {
      id: "obt1",
      obtentor: "Genética Austral",
      pais: "Chile",
      contacto: "contacto@ejemplo.cl",
      representanteLegal: "P. Soto",
      f_inicio: "2022-01-01",
      f_vencimiento: dias(400),
      renovable: true,
      exclusividad: "Sí",
      estado_contrato: "Vigente",
      minimoGarantizado: 50000,
      monedaMinimo: "USD",
      derechoAuditoria: true,
      especies: [{ id: "e1", especie: "Arándano", variedad: "Ventura" }],
      pbr: [{ id: "p1", especie: "Arándano", variedad: "Ventura", pais: "Chile", estado: "Concedido", nRegistro: "PBR-1120" }],
      participacionIngresos: [
        { id: "pi1", tipoIngreso: "royalty_planta", especie: "", variedad: "", tipoCalculo: "porcentaje", valor: 70, wht: 0 },
        { id: "pi2", tipoIngreso: "contract_fee", especie: "", variedad: "", tipoCalculo: "porcentaje", valor: 50, wht: 0 },
      ],
    },
    {
      id: "obt2",
      obtentor: "Breeding House",
      pais: "Estados Unidos",
      f_inicio: "2021-06-01",
      // Vencido: dispara alerta crítica de obtentor.
      f_vencimiento: dias(-60),
      renovable: false,
      estado_contrato: "Borrador",
      especies: [],
      // Sin PBR y sin reglas: dispara dos alertas más.
      pbr: [],
      participacionIngresos: [],
    },
  ],

  viveros: [
    {
      id: "viv1",
      viverista: "Vivero Andes",
      pais: "Chile",
      f_contrato: "2023-03-01",
      f_vencimiento: dias(30),
      estado_contrato: "Vigente",
      forma_pago: "Transferencia",
      variedades: [{ id: "vv1", especie: "Arándano", variedad: "Ventura", fee_usd: 0.35 }],
      ordenesCompra: [],
    },
  ],

  contratos: [
    {
      // Sano: firmado, vigente, con tarifas y mes de facturación.
      id: "ct1",
      razonSocial: "Agrícola Los Maitenes",
      clienteId: "cli1",
      taxID: "76.111.222-3",
      pais: "Chile",
      tipoContrato: "Licencia",
      moneda: "USD",
      fechaContrato: "2024-09-23",
      fechaTermino: dias(720),
      firmadoLicenciado: true,
      firmadoOsiris: true,
      anexo1: { activo: true, firmadoOsiris: true, firmadoLicenciado: true },
      anexo2: false,
      anexo3: false,
      nombreRep: "M. Rojas",
      nombrePredio: "Fundo El Peral",
      region: "Maule",
      tipoContractFee: "Sin Devolución",
      montoContractFee: 30000,
      contractFeePagado: true,
      valorRoyaltyPlanta: 0.85,
      valorRoyaltyComercial: 3000,
      royaltyInflacion: false,
      mesFacuracionRC: "Abril",
      plantaciones: [
        { id: "pl1", especie: "Arándano", variedad: "Ventura", nPlantas: 42000, hectareas: 10, tipoPlantacion: "Comercial", estado: "Confirmado" },
        { id: "pl2", especie: "Arándano", variedad: "Rocío", nPlantas: 8000, hectareas: 2, tipoPlantacion: "Prueba", estado: "Confirmado" },
      ],
      ordenesCompra: [{ id: "oc1", n_oc: "OC-2026-001", fecha_oc: "2026-02-10", estado: "Confirmada", plantacionIds: ["pl1"] }],
    },
    {
      // Sin firma del licenciado + fee sin cobrar + sin mes de facturación.
      id: "ct2",
      razonSocial: "Valle Norte SAC",
      clienteId: "cli2",
      pais: "Peru",
      tipoContrato: "Licencia",
      moneda: "USD",
      fechaContrato: "2026-03-01",
      fechaTermino: dias(45),
      firmadoLicenciado: false,
      firmadoOsiris: true,
      anexo1: false,
      anexo2: false,
      anexo3: false,
      tipoContractFee: "Con Devolución",
      montoContractFee: 30000,
      contractFeePagado: false,
      valorRoyaltyPlanta: 1.0,
      valorRoyaltyComercial: 3000,
      mesFacuracionRC: "",
      plantaciones: [
        { id: "pl3", especie: "Arándano", variedad: "Ventura", nPlantas: 15000, hectareas: 4, tipoPlantacion: "Comercial" },
      ],
      ordenesCompra: [],
    },
    {
      // Vencido + tarifa de royalty planta en cero + plantación sin plantas.
      id: "ct3",
      razonSocial: "Campos del Bajío",
      clienteId: "cli3",
      pais: "Mexico",
      tipoContrato: "No Exclusiva",
      moneda: "USD",
      fechaContrato: "2022-07-30",
      fechaTermino: dias(-120),
      firmadoLicenciado: true,
      firmadoOsiris: true,
      anexo1: { activo: true },
      anexo2: false,
      anexo3: false,
      tipoContractFee: "Sin Contract Fee",
      montoContractFee: 0,
      valorRoyaltyPlanta: 0,
      valorRoyaltyComercial: 3000,
      mesFacuracionRC: "Julio",
      plantaciones: [
        { id: "pl4", especie: "Cereza", variedad: "Emerald", nPlantas: 0, hectareas: 3, tipoPlantacion: "Comercial" },
      ],
      ordenesCompra: [],
    },
  ],
};

export default DATOS_EJEMPLO;
