/* eslint-disable */
// src/iam/iamMigration.mjs — Tooling READ-ONLY para la IAM MIGRATION MATRIX.
// Toma los usuarios legados (calendario_data id="main".usuarios[], con empresas_permitidas)
// + el catálogo real contab_empresas, y produce una matriz usuario↔empresa candidata,
// clasificada. NO inserta nada. NO hace fuzzy productivo. Sólo el status A (match exacto y
// unívoco) es proponible para seed; B/C/D/E/F se reportan y NO se insertan.
// Puro y testeable (sin red, sin DB). NUNCA maneja PINs/hashes/secretos.

// Normaliza email para comparación/unicidad: lower + trim. Vacío/ausente → null.
export function normEmail(email) {
  const e = (email == null ? "" : String(email)).trim().toLowerCase();
  return e === "" ? null : e;
}
// Normaliza un nombre de empresa legado para matching exacto (case/space-insensitive).
export function normNombre(s) {
  return (s == null ? "" : String(s)).trim().toLowerCase().replace(/\s+/g, " ");
}

// empresas: [{ id, codigo, nombre }] desde contab_empresas (autoritativo).
// Resuelve una etiqueta legada de empresa contra el catálogo. Exacto por codigo, luego por nombre.
// Devuelve { status, matches:[...] }. status: 'A' único, 'D' ambiguo, 'C' no encontrado.
export function resolverEmpresa(labelLegado, empresas) {
  const lab = normNombre(labelLegado);
  if (!lab) return { status: "C", matches: [] };
  const porCodigo = empresas.filter((e) => normNombre(e.codigo) === lab);
  const porNombre = empresas.filter((e) => normNombre(e.nombre) === lab);
  // unir sin duplicar por id
  const map = new Map();
  [...porCodigo, ...porNombre].forEach((e) => map.set(e.id, e));
  const matches = [...map.values()];
  if (matches.length === 1) return { status: "A", matches };
  if (matches.length > 1) return { status: "D", matches };
  return { status: "C", matches };
}

// Construye la matriz completa. users: [{ nombre, email, desactivado?, rol?, empresas_permitidas?[] }].
// Devuelve { usuarios:[...], memberships:[...], resumen:{...} }.
// - detecta emails duplicados (mismo email normalizado en >1 usuario) → los marca conflicto (status E).
// - usuario sin email → flag sinEmail (no bloquea identidad; el seed de iam_usuario puede requerir email
//   según gobernanza; aquí sólo se reporta).
// - por cada empresa_permitida → una fila membership candidata con status A..F.
export function construirMatriz(users = [], empresas = []) {
  const usersArr = Array.isArray(users) ? users : [];
  // conteo de emails normalizados para detectar duplicados
  const emailCount = new Map();
  for (const u of usersArr) {
    const e = normEmail(u && u.email);
    if (e) emailCount.set(e, (emailCount.get(e) || 0) + 1);
  }

  const usuarios = [];
  const memberships = [];

  for (const u of usersArr) {
    const nombre = (u && u.nombre) || "";
    const emailNorm = normEmail(u && u.email);
    const sinEmail = !emailNorm;
    const emailDuplicado = emailNorm ? (emailCount.get(emailNorm) > 1) : false;
    const inactivo = !!(u && u.desactivado);
    const rol = (u && u.rol) || null;
    // UUID propuesto: NO se genera aquí (sería efímero/no idempotente). El seed lo asigna UNA vez
    // en DB con gen_random_uuid() y se persiste; aquí se deja null y se muestra "→ (asignar en seed)".
    const uuidPropuesto = null;

    usuarios.push({ nombre, emailNorm, sinEmail, emailDuplicado, inactivo, rol });

    const permitidas = Array.isArray(u && u.empresas_permitidas) ? u.empresas_permitidas : [];
    if (permitidas.length === 0) {
      memberships.push({ usuario: nombre, emailNorm, empresaLegada: null,
        empresaCore: null, empresaUuid: null, status: "F", action: "REPORTAR (acceso legado vacío)" });
      continue;
    }
    for (const label of permitidas) {
      const r = resolverEmpresa(label, empresas);
      let status = r.status;
      // El conflicto de identidad (email duplicado) degrada cualquier membership del usuario a E:
      // no se puede seed con identidad ambigua.
      if (emailDuplicado) status = "E";
      const m0 = r.matches[0] || null;
      memberships.push({
        usuario: nombre, emailNorm, empresaLegada: label,
        empresaCore: m0 ? m0.nombre : null, empresaCodigo: m0 ? m0.codigo : null,
        empresaUuid: (status === "A" && m0) ? m0.id : null,
        status,
        action: status === "A" ? "PROPONER SEED (A)" : `REPORTAR (${status})`,
      });
    }
  }

  const cont = (arr, k, v) => arr.filter((x) => x[k] === v).length;
  const resumen = {
    usuarios_descubiertos: usuarios.length,
    usuarios_sin_email: usuarios.filter((u) => u.sinEmail).length,
    emails_duplicados: [...emailCount.values()].filter((n) => n > 1).length,
    usuarios_inactivos: usuarios.filter((u) => u.inactivo).length,
    memberships_descubiertas: memberships.length,
    membership_A_exacta: cont(memberships, "status", "A"),
    membership_B_probable: cont(memberships, "status", "B"),
    membership_C_no_encontrada: cont(memberships, "status", "C"),
    membership_D_ambigua: cont(memberships, "status", "D"),
    membership_E_conflicto_identidad: cont(memberships, "status", "E"),
    membership_F_legado_vacio: cont(memberships, "status", "F"),
  };
  return { usuarios, memberships, resumen };
}

// Sólo las membership status 'A' son proponibles para seed (nunca B/C/D/E/F).
export function proponiblesParaSeed(matriz) {
  return (matriz.memberships || []).filter((m) => m.status === "A");
}
