/* eslint-disable */
// api/datos/[fila].js — Datos de la app a través del SERVIDOR (rama seguridad-main-pins)
// ------------------------------------------------------------------------------
// Exige cookie de sesión "completa" (una "cambio_pin" → 403). El padrón se relee
// en cada petición; ADMIN = fila activa en seg_administradores.
//   GET   /api/datos/roster   → 200 {usuarios:[roster sin credenciales]}
//   GET   /api/datos/usuarios → 200 {usuarios, version}
//   PUT   /api/datos/usuarios {valor:[...], version} → solo ADMIN; sin campos de
//         credenciales; OCC por updated_at → 200 {version} | 409 {version}
//   GET   /api/datos/main     → 200 {valor, version} (sin pinsPersonalizados ni usuarios)
//   PATCH /api/datos/main     {patch, version} → claves de configuración solo con
//         ADMIN o permiso tareas/config = "editar"; el servidor escribe el espejo
//         main.usuarios desde la fila `usuarios` (trigger guard_main_no_user_shrink);
//         OCC → 200 {version} | 409 {version}

const A = require("../_auth");
const R = require("../_reglasLogin");
const S = require("../_segServidor");

const RUTAS = { "roster:GET": 1, "usuarios:GET": 1, "usuarios:PUT": 1, "main:GET": 1, "main:PATCH": 1 };

async function putUsuarios(res, s, b) {
  if (!(await S.esAdmin(s.usuario.email))) return S.json(res, 403, { error: "sin_permiso" });
  const err = R.validarUsuariosEntrantes(b.valor);
  if (err) return S.json(res, 400, { error: err });
  const f = await S.leerFila("usuarios");
  const version = typeof b.version === "string" && b.version ? b.version : null;
  if ((f.version || null) !== version) return S.json(res, 409, { error: "conflicto", version: f.version });
  const valor = R.fusionarUsuarios(Array.isArray(f.valor) ? f.valor : [], b.valor);
  const w = await S.escribirFila("usuarios", valor, version, f.eraTexto);
  if (!w.ok) { const g = await S.leerFila("usuarios"); return S.json(res, 409, { error: "conflicto", version: g.version }); }
  return S.json(res, 200, { ok: true, version: w.version });
}

async function patchMain(res, s, b) {
  const f = await S.leerFila("main");
  if (!f.existe) return S.json(res, 409, { error: "conflicto", version: null });
  if (typeof b.version !== "string" || b.version !== f.version) return S.json(res, 409, { error: "conflicto", version: f.version });
  const puedeConfig = R.puedeEditarConfig(s.usuario, await S.esAdmin(s.usuario.email));
  const r = R.aplicarPatchMain(f.valor, b.patch, { puedeConfig });
  if (!r.ok) return S.json(res, r.status, { error: r.error });
  const valor = { ...r.valor };
  delete valor.pinsPersonalizados;
  valor.usuarios = R.espejoUsuarios(s.usuarios, f.valor && f.valor.usuarios);
  const w = await S.escribirFila("main", valor, f.version, f.eraTexto);
  if (!w.ok) { const g = await S.leerFila("main"); return S.json(res, 409, { error: "conflicto", version: g.version }); }
  return S.json(res, 200, { ok: true, version: w.version });
}

module.exports = async function handler(req, res) {
  const fila = req.query && req.query.fila;
  if (!RUTAS[`${fila}:${req.method}`]) {
    if (["roster", "usuarios", "main"].includes(fila)) return S.json(res, 405, { error: "metodo" });
    return S.json(res, 404, { error: "fila_desconocida" });
  }
  if (A.faltanSecretos()) return S.json(res, 503, { error: "no_configurado" });
  let b = {};
  if (req.method !== "GET") {
    if (!S.esJSON(req)) return S.json(res, 415, { error: "content_type" });
    b = S.cuerpo(req);
    if (!b) return S.json(res, 400, { error: "body_invalido" });
  }
  try {
    const s = await S.resolverSesion(req);
    if (!s.ok) return S.json(res, s.status, { error: s.error });
    if (fila === "roster" || (fila === "usuarios" && req.method === "GET")) {
      const out = { usuarios: s.usuarios.map(R.filtrarRoster) };
      if (fila === "usuarios") out.version = s.versionUsuarios;
      return S.json(res, 200, out);
    }
    if (fila === "usuarios") return await putUsuarios(res, s, b);
    if (req.method === "GET") {
      const f = await S.leerFila("main");
      return S.json(res, 200, { valor: R.mainParaCliente(f.valor), version: f.version });
    }
    return await patchMain(res, s, b);
  } catch (e) {
    console.error("datos " + fila + ": error interno");
    return S.json(res, 503, { error: "no_disponible" });
  }
};
