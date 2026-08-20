/* eslint-disable */
// Tests de la IAM migration matrix (node). Ejecutar: node src/iam/iamMigration.test.mjs
import { normEmail, normNombre, resolverEmpresa, construirMatriz, proponiblesParaSeed } from "./iamMigration.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`);

// Catálogo contab_empresas simulado (autoritativo)
const EMP = [
  { id: "5aa10886-2a76-4a9e-9bc3-303fb776cd49", codigo: "ALS", nombre: "Allegria Service" },
  { id: "11111111-1111-1111-1111-111111111111", codigo: "ALF", nombre: "Allegria Foods" },
  { id: "22222222-2222-2222-2222-222222222222", codigo: "FRK", nombre: "Frisku Foods" },
];

// normalización
eq(normEmail("  User@Grupo.CL "), "user@grupo.cl", "normEmail lower+trim");
eq(normEmail(""), null, "normEmail vacío → null");
eq(normEmail(null), null, "normEmail null → null");
eq(normNombre("  Allegria   Service "), "allegria service", "normNombre colapsa espacios");

// resolverEmpresa
eq(resolverEmpresa("ALS", EMP).status, "A", "resolver por codigo exacto → A");
eq(resolverEmpresa("allegria service", EMP).status, "A", "resolver por nombre (case-insensitive) → A");
eq(resolverEmpresa("ALS", EMP).matches[0].id, "5aa10886-2a76-4a9e-9bc3-303fb776cd49", "A devuelve el uuid correcto");
eq(resolverEmpresa("Inexistente", EMP).status, "C", "empresa no encontrada → C");
{
  const amb = [{ id: "a", codigo: "X", nombre: "Dup" }, { id: "b", codigo: "Y", nombre: "Dup" }];
  eq(resolverEmpresa("Dup", amb).status, "D", "match múltiple → D (ambiguo)");
}

// construirMatriz — casos A/C/D/F
{
  const users = [
    { nombre: "Ana", email: "ana@grupo.cl", empresas_permitidas: ["ALS"] },                 // A
    { nombre: "Beto", email: "beto@grupo.cl", empresas_permitidas: ["Allegria Service", "Nope"] }, // A + C
    { nombre: "Caro", email: "caro@grupo.cl", empresas_permitidas: [] },                    // F
    { nombre: "Sin", email: "", empresas_permitidas: ["ALS"] },                             // sinEmail (A membership igual)
  ];
  const mx = construirMatriz(users, EMP);
  eq(mx.resumen.usuarios_descubiertos, 4, "matriz: 4 usuarios");
  eq(mx.resumen.usuarios_sin_email, 1, "matriz: 1 sin email");
  eq(mx.resumen.membership_A_exacta, 3, "matriz: 3 memberships A (Ana ALS, Beto AS, Sin ALS)");
  eq(mx.resumen.membership_C_no_encontrada, 1, "matriz: 1 C (Beto Nope)");
  eq(mx.resumen.membership_F_legado_vacio, 1, "matriz: 1 F (Caro vacío)");
  const prop = proponiblesParaSeed(mx);
  eq(prop.length, 3, "sólo 3 A proponibles para seed");
  ok(prop.every((m) => m.status === "A" && m.empresaUuid), "todo proponible tiene uuid resuelto");
  ok(prop.every((m) => m.action === "PROPONER SEED (A)"), "acción correcta");
}

// email duplicado degrada memberships del usuario a E (identidad ambigua → no seed)
{
  const users = [
    { nombre: "Dup1", email: "dup@grupo.cl", empresas_permitidas: ["ALS"] },
    { nombre: "Dup2", email: "DUP@grupo.cl", empresas_permitidas: ["ALS"] }, // mismo email normalizado
  ];
  const mx = construirMatriz(users, EMP);
  eq(mx.resumen.emails_duplicados, 1, "1 email duplicado detectado");
  eq(mx.resumen.membership_E_conflicto_identidad, 2, "ambas memberships → E");
  eq(mx.resumen.membership_A_exacta, 0, "ninguna A con identidad en conflicto");
  eq(proponiblesParaSeed(mx).length, 0, "nada proponible con email duplicado");
}

console.log(`\nIAM migration matrix tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");
