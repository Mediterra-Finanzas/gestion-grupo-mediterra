// Tests del adapter GoTrue admin: findUserByEmail fail-closed + paginación + ensureUser.
// node api/_supaAdmin.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { makeAdmin } = require("./_supaAdmin.js");

let P = 0, F = 0;
const ck = (l, ok, d) => { if (ok) { P++; console.log("PASS", l); } else { F++; console.log("FAIL", l, d !== undefined ? JSON.stringify(d) : ""); } };
async function throws(fn, re) { try { await fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } }

// Fake GoTrue: GET /admin/users?page&per_page pagina `users` (cap simula tope real de per_page).
// POST /admin/users crea. listFails simula error de API.
function makeFetch(users, { cap = 1000, listFails = false } = {}) {
  const created = [];
  const f = async (url, opts = {}) => {
    if (/\/auth\/v1\/admin\/users/.test(url) && opts.method === "POST") {
      const body = JSON.parse(opts.body); const nu = { id: "new-" + body.email, email: body.email };
      created.push(nu); return { ok: true, json: async () => nu };
    }
    if (/\/auth\/v1\/admin\/users/.test(url)) {
      if (listFails) return { ok: false, status: 500, json: async () => ({}) };
      const m = /[?&]page=(\d+)&per_page=(\d+)/.exec(url);
      const page = m ? +m[1] : 1, per = m ? +m[2] : 50, eff = Math.min(per, cap);
      const start = (page - 1) * eff;
      return { ok: true, json: async () => ({ users: users.slice(start, start + eff) }) };
    }
    throw new Error("unexpected url " + url);
  };
  f._created = created;
  return f;
}
const adm = (users, opts) => makeAdmin({ url: "http://x", service: "s", anon: "a", fetchImpl: makeFetch(users, opts) });

const OSIRIS = { id: "207b6125", email: "a3-otro-tenant@osiris-sintetico.invalid" };
const ANGELO = { id: "9c1111", email: "ahuerta@grupomediterra.cl" };
const BOB = { id: "bob1", email: "bob@grupomediterra.cl" };

// 1) Osiris primero, Angelo segundo → devuelve Angelo (NO arr[0])
ck("01 arr[0]=Osiris, exacto=Angelo → Angelo",
  (await adm([OSIRIS, ANGELO]).findUserByEmail("ahuerta@grupomediterra.cl"))?.id === "9c1111");
// 2) solo Osiris → null (no cross-user)
ck("02 solo Osiris → null",
  (await adm([OSIRIS]).findUserByEmail("ahuerta@grupomediterra.cl")) === null);
// 3) Angelo único → Angelo
ck("03 Angelo único → Angelo",
  (await adm([ANGELO]).findUserByEmail("ahuerta@grupomediterra.cl"))?.id === "9c1111");
// 4) duplicate exact email → FAIL CLOSED
ck("04 email exacto duplicado → throws ambiguous",
  await throws(() => adm([ANGELO, { id: "dup", email: "ahuerta@grupomediterra.cl" }]).findUserByEmail("ahuerta@grupomediterra.cl"), /ambiguous_email/));
// 5) case/whitespace normalizado
ck("05 case+espacios normalizados → Angelo",
  (await adm([ANGELO]).findUserByEmail("  AHuerta@GrupoMediterra.CL  "))?.id === "9c1111");
// 6) respuesta vacía → null
ck("06 lista vacía → null",
  (await adm([]).findUserByEmail("ahuerta@grupomediterra.cl")) === null);
// 7) paginación: Angelo en página 2 (cap 2 por página) → encontrado
ck("07 paginación (Angelo pág 2) → Angelo",
  (await adm([OSIRIS, BOB, { id: "x3", email: "x3@x.cl" }, ANGELO], { cap: 2 }).findUserByEmail("ahuerta@grupomediterra.cl"))?.id === "9c1111");
// 8) error de API → FAIL CLOSED
ck("08 API list error → throws",
  await throws(() => adm([ANGELO], { listFails: true }).findUserByEmail("ahuerta@grupomediterra.cl"), /admin\/users 500/));
// 9) jamás cross-user: pido Angelo, solo Bob → null
ck("09 pido Angelo, solo Bob → null (no cross-user)",
  (await adm([BOB]).findUserByEmail("ahuerta@grupomediterra.cl")) === null);
// 10) ensureUser: existe exacto (aunque Osiris esté primero) → NO crea
{ const f = makeFetch([OSIRIS, ANGELO]); const a = makeAdmin({ url: "http://x", service: "s", anon: "a", fetchImpl: f });
  const u = await a.ensureUser("ahuerta@grupomediterra.cl");
  ck("10 ensureUser existente → devuelve Angelo, no crea", u?.id === "9c1111" && f._created.length === 0, { id: u?.id, created: f._created.length }); }
// 11) ensureUser: ausente → crea
{ const f = makeFetch([OSIRIS]); const a = makeAdmin({ url: "http://x", service: "s", anon: "a", fetchImpl: f });
  const u = await a.ensureUser("nuevo@grupomediterra.cl");
  ck("11 ensureUser ausente → crea 1", f._created.length === 1 && u?.email === "nuevo@grupomediterra.cl", { created: f._created.length }); }
// 12) ensureUser: email ambiguo → propaga FAIL CLOSED (no crea)
{ const f = makeFetch([ANGELO, { id: "dup", email: "ahuerta@grupomediterra.cl" }]); const a = makeAdmin({ url: "http://x", service: "s", anon: "a", fetchImpl: f });
  ck("12 ensureUser ambiguo → throws, no crea",
    (await throws(() => a.ensureUser("ahuerta@grupomediterra.cl"), /ambiguous_email/)) && f._created.length === 0); }

console.log(`\nSUPAADMIN RESULT: PASS=${P} FAIL=${F}`);
if (F > 0) process.exit(1);
