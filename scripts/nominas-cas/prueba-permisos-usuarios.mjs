/* Prueba LOCAL de supabase/consulta_permisos_tablas_usuarios.sql — datos de prueba.
   Crea las 6 tablas con una fila "secreta", ejecuta cada bloque U1–U5 y comprueba
   que corren, que no cambian datos y que no muestran el contenido.
     POSTGREST_BIN=/ruta/postgrest node scripts/nominas-cas/prueba-permisos-usuarios.mjs */
import fs from 'fs';
import path from 'path';
import { levantarBaseLocal, RAIZ } from './pglocal.mjs';

let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const db = await levantarBaseLocal({ pgPort: 54336, pgrstPort: 3917 });
const tablas = ['osi_auth_rate_limit', 'osi_user_empresa', 'rbac_roles', 'rbac_usuarios_roles', 'user_osiris_accounts'];   // usuarios_empresa NO se crea: debe salir existe = f
for (const t of tablas) db.psql(`create table public.${t} (id int primary key, correo text, hash_pin text); insert into public.${t} values (1, 'secreto@prueba.cl', 'HASH-SECRETO');`);
db.psql(`alter table public.rbac_roles enable row level security; create policy p_leer on public.rbac_roles for select to anon using (true);
  grant select on public.rbac_roles to anon; grant all on public.user_osiris_accounts to anon, authenticated;
  create function public.zz_tiene_rol(u int) returns boolean language sql security definer as $f$ select exists(select 1 from public.rbac_usuarios_roles where id = u) $f$;`);
const huella = () => db.psql(`select md5(string_agg(t::text, '|')) from (select * from public.rbac_roles union all select * from public.user_osiris_accounts) t`);
const antes = huella();
const sql = fs.readFileSync(path.join(RAIZ, 'supabase/consulta_permisos_tablas_usuarios.sql'), 'utf8');
const bloques = sql.split(/\n(?=-- U\d\.)/).slice(1);
check('0. El archivo tiene 5 bloques U1–U5', bloques.length === 5);
const salidas = bloques.map((b) => db.psqlTexto(b));
salidas.forEach((s, i) => check(`U${i + 1}. corre sin error`, s.ok, s.ok ? '' : s.salida.slice(0, 200)));
const todo = salidas.map((s) => s.salida).join('\n');
check('U1. informa la tabla inexistente (usuarios_empresa → existe f) y RLS de rbac_roles activo', /usuarios_empresa\|f\|/.test(salidas[0].salida) && /rbac_roles\|t\|t\|f\|/.test(salidas[0].salida));
check('U2. muestra que anon puede leer rbac_roles y vaciar user_osiris_accounts', /rbac_roles\|anon\|t\|/.test(salidas[1].salida) && /user_osiris_accounts\|anon\|t\|t\|t\|t\|t/.test(salidas[1].salida));
check('U3. lista la política de rbac_roles', /rbac_roles\|p_leer\|/.test(salidas[2].salida));
check('U4. lista columnas (correo, hash_pin) sin valores', /correo/.test(salidas[3].salida) && /hash_pin/.test(salidas[3].salida));
check('U5. detecta la función SECURITY DEFINER que usa rbac_usuarios_roles', /zz_tiene_rol\|[^\n]*\|t\|/.test(salidas[4].salida));
check('Ningún bloque muestra contenido (correo ni hash de prueba)', !/secreto@prueba|HASH-SECRETO/.test(todo));
check('No cambia datos', huella() === antes);
db.cerrar();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nConsulta de permisos de tablas de usuarios: todos los casos OK');
process.exit(fallos ? 1 : 0);
