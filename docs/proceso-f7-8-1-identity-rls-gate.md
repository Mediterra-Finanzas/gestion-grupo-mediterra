# F7.8.1 — Identity / Tenant / RLS Gate (Discovery)

**Fecha:** 2026-08-14 · **Worktree:** `worktree-proc-fase1` · **HEAD:** `89fd765` · **Naturaleza:** discovery-first, sin modificar código/SQL. **Resultado: `IDENTITY-STRUCTURAL-GAP` (cierre §26-B).**

---

## 0. Veredicto

El acceso real de un usuario autenticado al bounded context `proc_*` **no puede resolverse sin un cambio transversal de identidad/tenancy** que hoy está vedado por el contrato (§11: no reemplazar login, no proveedor externo, no identidad paralela). Por tanto **no se materializó nada**. Se documenta la arquitectura CURRENT, la causa raíz con evidencia, los patrones reutilizables y las alternativas para tu decisión.

La afirmación de F7.8 ("proc_* está tras RLS que deniega anon mientras la app usa anon key") queda **verificada técnicamente** (no asumida) — ver §2.

---

## 1. Arquitectura de identidad CURRENT (extraída del código)

| Pregunta | Hallazgo | Evidencia |
|---|---|---|
| ¿Cómo autentica la app? | 100% **client-side**: email + PIN (PBKDF2-HMAC-SHA256 vía Web Crypto). Usuarios y PINs viven en `calendario_data` (filas `main` / `pins`). | `pinHash.js` (pbkdf2); `App.jsx` `dbLoadPins`/`verifyPin`; `api/login.js` = **410 Gone** ("la app autentica 100% client-side") |
| ¿Existe Supabase Auth real? | **No.** Cero `createClient` / `supabase.auth` / `signIn` / `getSession` / `auth.uid` en `src/`. | grep en `src/` → vacío |
| ¿Qué rol llega a Postgres? | **`anon`.** Todo el tráfico DB va por REST con la **anon key como apikey Y como Bearer**. | `procesoDB.js:19-26` `Authorization: Bearer ${SUPA_KEY}` (SUPA_KEY = anon key) |
| ¿Qué JWT / claims? | Solo el JWT embebido en la anon key (`role: anon`, sin `empresa_id`). No hay JWT por usuario. | `procesoDB.js`; ausencia de Auth |
| ¿`auth.uid()`? | `null` siempre (no hay sesión Auth). | — |
| ¿Cómo se determina `empresa_id` para `proc_*`? | **Manual**: campo de texto "Tenant (empresa_id)" en la barra de contexto. App.jsx **no** pasa `empresaId` al módulo. | `ProcShell.jsx:88`; `App.jsx` mount 3691-3695 (sin `empresaId`) |
| ¿Cómo resuelven tenant otras áreas? | No hay tenancy por RLS. `contab_*` usa políticas **permisivas `FOR ALL TO anon USING(true)`** (Fase 0). Finanzas/otros guardan blobs en `calendario_data` sin scoping DB. | `schema_core_contable_fase0.sql:150-180` |
| ¿RLS con `auth.uid`/membership fuera de `proc_*`? | **Ninguna.** | grep `supabase/` (excl. proc_) → solo el comentario "políticas TO authenticated … inertes" |
| ¿Tabla usuario↔empresa (membership)? | **No relacional.** Existe `empresas_permitidas` (array) pero es **JSON app-level en `calendario_data`, client-side**, con claves string de empresa (no UUIDs `proc_*`); no alcanzable por RLS. | `App.jsx:870-878,1087,2081`; `FinanzasModule.jsx:1496-1507` |
| ¿Helper SQL neutral de empresa actual? | `proc_current_empresa()` — lee `request.jwt.claims->>'empresa_id'`, claim **que nunca existe** en esta app. | `schema_proc_v1.sql:29-32` |
| ¿Patrón autenticado ya validado reutilizable? | El "guardia/proxy" (`api/_auth.js` + service_role) fue **construido y REVERTIDO** (lockout de login 2026-06-18; `login.js` retirado 2026-06-30). Su token es HMAC propio `{email,nombre,rol}`, **sin empresa_id ni membership**, y usa service_role (bypassea RLS). No está activo. | `api/_auth.js`; `api/login.js`; memoria `seguridad-guardia-proxy` |

---

## 2. Verificación del hallazgo de F7.8 (§2) — con evidencia, no asumido

La advertencia era correcta en general: usar la anon key en frontend no implica operar como `anon` **si** existe sesión Auth (que añade un JWT de usuario y Postgres pasa a `authenticated`). Se verificó punto por punto:

- **A. ¿Existe sesión Supabase Auth?** No — cero uso de `@supabase/supabase-js`/`.auth` en `src/`.
- **B. ¿Existe JWT de usuario?** No — el `Authorization: Bearer` es literalmente la **anon key**, no un token de usuario (`procesoDB.js:22`).
- **C. ¿Qué `role` recibe Postgres?** `anon` (el rol embebido en la anon key).
- **D. ¿`auth.uid()`?** `null`.
- **E. ¿Mecanismo de empresa?** Texto manual en la UI (`ProcShell.jsx:88`), sin verificación.
- **F. ¿Por qué `proc_*` no se lee?** Porque `proc_*` es el **único** contexto con RLS estricta: `REVOKE ALL ON … FROM anon` + política `empresa_id=proc_current_empresa()` + `GRANT … authenticated` (`schema_proc_v6_f6.sql:276-278`). La app entra como `anon` (sin grant, sin claim) → **permission denied**. No es que "authenticated no pueda"; es que **la app nunca es authenticated**.

**Conclusión:** la afirmación de F7.8 se sostiene. `proc_*` fue diseñado para un mundo autenticado + claim `empresa_id` que **esta app no tiene**.

---

## 3. Auditoría RPC / RLS / read-models CURRENT (§9, §10)

- **RPC:** **0 funciones `proc_*` son `SECURITY DEFINER`** — todas `INVOKER`, por lo que aplican la RLS del caller (no hay bypass, no hay escalación). `search_path` no es vector porque no hay DEFINER. `EXECUTE` a public es inocuo: el acceso a tablas dentro corre como el caller (anon → denegado).
- **RLS:** `proc_*` = `ENABLE`+`FORCE ROW LEVEL SECURITY`, política por `empresa_id=proc_current_empresa()`, `REVOKE anon`, `GRANT authenticated`. Estricta y correcta **para un caller autenticado**. Postura fuerte; el problema no es la RLS sino la ausencia de identidad.
- **Read-models:** 25 vistas `proc_v_*` con `security_invoker=on` → heredan la RLS de las tablas base (verificado en F7.8: 25/25 deniegan anon). No hay bypass por vistas.

**No se debe "arreglar" el acceso debilitando ninguna de estas piezas** sin decisión explícita (§8, §10).

---

## 4. Test estructural (§4) — ¿la solución sirve para todas las empresas sin hardcodear?

El contrato deseado (`auth.uid() + membership → empresa_id → RLS`, multiempresa §6, sin confiar en `empresa_id` del cliente §7) es **genérico y correcto** para Service/Foods/Frisku/Osiris/futuras. **Pero exige dos piezas que hoy no existen y que son transversales a todo Mediterra One:**

1. **Un canal autenticado que llegue a Postgres** (sesión Supabase Auth con JWT de usuario, o un proxy que inyecte identidad por-usuario). Hoy: no existe; la app es `anon`.
2. **Una membership usuario↔empresa alcanzable por la DB** (tabla relacional o claim). Hoy: solo existe `empresas_permitidas` como JSON client-side con claves string, no ligable a `proc_*.empresa_id` desde RLS.

Materializar esto **cambia el modelo de identidad de toda la app** (no solo Service) y choca con §11 (no reemplazar login, no proveedor, no identidad paralela). → **`IDENTITY-STRUCTURAL-GAP`.**

---

## 5. Alternativas (para tu decisión — no materializadas)

### Opción A — Igualar el patrón CURRENT del resto de la app (contab_* Fase 0)
Añadir a `proc_*` políticas permisivas `FOR ALL TO anon USING(true)` (+ scoping por `empresa_id` desde la UI). 
- **Habilita Visual UAT hoy**, sin cambio de identidad, consistente con cómo ya opera `contab_*`/toda la app.
- **NO** impone aislamiento de tenant en la DB: un `anon` podría enviar cualquier `empresa_id` (§7 no se cumple). Baja `proc_*` al nivel de seguridad Fase 0 del resto de la app.
- Reversible. **Contradice §8** (no debilitar RLS para que funcione la UI) → **requiere tu autorización explícita** porque cambia la postura de seguridad de `proc_*` (hoy más fuerte que el resto).

### Opción B — Tenancy real (el contrato deseado)
Introducir identidad autenticada (Supabase Auth, o reactivar el guardia/proxy con JWT por-usuario) + membership alcanzable por la DB (derivada de `empresas_permitidas`) + conservar la RLS estricta de `proc_*`.
- Cumple §5–§8 y §12–§13.
- **Transversal**: cambia el login/identidad de todo Mediterra One; el guardia/proxy ya se revirtió una vez por lockout. Fuera del alcance permitido en §11.

### Opción C — Guardia/proxy con validación `empresa_id` (la "Fase Seguridad" ya documentada)
Reactivar `api/_auth.js` + ruta proxy con service_role, extendiendo el token de sesión con las empresas autorizadas y validando `empresa_id` server-side antes de tocar `proc_*` (y, eventualmente, `contab_*`).
- Es el camino "futuro" que el propio core documenta.
- Transversal y previamente revertido; requiere un plan de rollout con salvaguarda anti-lockout.

**Recomendación:** para **solo** desbloquear la revisión visual sin abrir el debate estructural, la Opción A es la mínima y reversible, pero es una **decisión de postura de seguridad tuya** (no la tomo por defecto). El contrato correcto de largo plazo es B/C, que es trabajo transversal de identidad y debe planificarse aparte.

---

## 6. Matriz U0–U4 / Bypass tests (§12, §13)
**No ejecutados**: presuponen identidad autenticada + membership, que no existen. Ejecutarlos hoy solo confirmaría lo ya sabido (todo es `anon`; `proc_*` deniega a `anon`; `contab_*` permite a `anon` sin distinción de empresa). La matriz se ejecutará cuando exista el canal autenticado (Opción B/C).

## 7. Regresión / build / bounded context
- **Sin cambios de código/SQL** → no hay regresión que correr por F7.8.1. La última cadena v1→v7.7 + 13 suites + RLS 25/25 + 0 deps `exp_*`/`frisku_*` quedó VALIDATED en F7.8 (`89fd765`).
- **Bounded context intacto**: este discovery no introduce ninguna dependencia; Frisku/`frisku_*`/`friskuBI`/Foods/`exp_*`/Osiris/`main` no se tocaron.

## 8. Estado de Visual UAT
**Sigue BLOCKED.** No hay forma de que la app (como `anon`) lea `proc_*` sin una de las decisiones anteriores. La app **no** queda "READY FOR VISUAL UAT" en este HEAD. No corresponde pedir login todavía: aunque ingreses el PIN, `proc_*` seguiría denegando (la sesión no es authenticated y no hay claim `empresa_id`).

---

## 9. Cierre discovery (§26)
**Caso B — `IDENTITY-STRUCTURAL-GAP`.** El CFO aceptó el diagnóstico y autorizó un puente DEV/UAT aislado (F7.8.1-D) SIN degradar producción ni resolver la identidad transversal. Ver §10.

---

## 10. DEV/UAT Visual Access Bridge (F7.8.1-D)

### 10.1 Por qué existe
Desbloquear **solo** la revisión visual local de Allegria Service, dado que la app opera como `anon` y `proc_*` (con RLS estricta) le deniega acceso. NO resuelve el gap estructural (§4); es un puente de testing local, reversible y explícito.

### 10.2 Riesgos y entorno permitido
- **Explícitamente inseguro para producción.** Abre `anon` a `proc_*` mediante políticas permisivas + grants.
- **Solo entorno LOCAL AISLADO** (PostgreSQL efímero en Docker). **PROHIBIDO** aplicarlo sobre la base productiva o incluirlo en cualquier deploy. La producción nunca se tocó durante esta subfase (ver §10.8).
- El artefacto está marcado `DEV / LOCAL UAT ONLY — NEVER APPLY TO PRODUCTION` en su cabecera.

### 10.3 Artefactos (committeados)
- `supabase/schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql` — bridge: por cada tabla `proc_*` una política **permisiva `TO anon`** (NO toca la política estricta productiva) + `GRANT` DML a anon; `GRANT SELECT` a anon sobre las 25 vistas `proc_v_*`; `GRANT EXECUTE` a anon sobre las 54 funciones `proc_fn_*`. Incluye bloque **ROLLBACK**.
- `supabase/seed_proc_DEV_UAT.sql` — dataset DEV representativo (datos ficticios; NO "maestros reales"). Empresa DEV fija `5aa10886-2a76-4a9e-9bc3-303fb776cd49` **solo en este seed** (§5); no está hardcodeada en schema/dominio/React/RPC.
- Repoint por env (fallback = prod exacto; prod build idéntico si la env no está): `src/friskuHelpers.js`, `src/App.jsx` (`REACT_APP_SUPA_URL/KEY`), `src/proceso/ui/AllegriaServiceModule.jsx` (`REACT_APP_PROC_DEV_EMPRESA`).

### 10.4 Artefactos NO committeados
- `.env.development.local` (gitignored): apunta la app al stack local + JWT anon local + tenant DEV + `PORT=3020`.
- Proxy local (scratchpad): reescribe `/rest/v1/*` → PostgREST y agrega CORS. Node puro, sin secretos.

### 10.5 Grants otorgados (acotados, no `GRANT ALL` ciego)
`SELECT,INSERT,UPDATE,DELETE` en las 49 tablas `proc_*`; `SELECT` en las 25 vistas; `EXECUTE` en las 54 funciones `proc_fn_*`; `SELECT,INSERT,UPDATE,DELETE` en `calendario_data` (login/boot). Es lo necesario para ejecutar la UAT completa (F7.1–F7.7) — CRUD REST + RPC + read-models.

### 10.6 Cómo ACTIVAR (local, resumen)
1. Postgres 16 efímero (Docker) DB `proc`; crear roles `anon`/`authenticated` + stub `contab_empresas`/`contab_auxiliares`.
2. Aplicar cadena `schema_proc_v1..v7_7` → `schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql` → `seed_proc_DEV_UAT.sql`. Crear `calendario_data` + `GRANT ... TO anon`.
3. PostgREST (`postgrest/postgrest:v12.2.3`) contra ese Postgres: `PGRST_DB_ANON_ROLE=anon`, `PGRST_JWT_SECRET=<secret local>`. Generar un JWT `{role:anon}` firmado con ese secret = la "anon key" DEV.
4. Proxy node en `:3010` que reescribe `/rest/v1/*` → PostgREST y añade CORS (Allow-Headers incl. `cache-control,pragma`; Max-Age 0).
5. `.env.development.local` con `REACT_APP_SUPA_URL=http://localhost:3010`, `REACT_APP_SUPA_KEY=<JWT anon>`, `REACT_APP_PROC_DEV_EMPRESA=5aa10886…`, `PORT=3020`.
6. `npm start` → app en `http://localhost:3020` apuntando al stack aislado.

### 10.7 Cómo DESACTIVAR (reversible)
Borrar `.env.development.local`; detener CRA/proxy/PostgREST/Postgres (contenedores efímeros — `docker rm -f`). El código con env-fallback vuelve solo a producción (env ausente). Sobre una base persistente, correr el bloque **ROLLBACK** del bridge (elimina políticas `*_DEV_UAT` + revoca anon) → queda idéntica al schema productivo.

### 10.8 Prueba de que producción sigue deny-by-default (§18)
Control inverso ejecutado en contenedor limpio con **solo** la cadena productiva (sin DEV_ONLY, sin bridge): `anon` **denegado en 25/25 vistas** `proc_v_*`, y **0 políticas `*_DEV_UAT`** presentes. El bridge no contamina el contrato productivo; la base productiva remota nunca se conectó en esta subfase.

### 10.9 Estado de Visual UAT
`DEV/UAT BRIDGE = VALIDATED` · `PRODUCTION RLS = INTACT` · `LOCAL APP = RUNNING (localhost:3020)` · `UAT DATA = READY` (Recepciones 3, Lotes 3, Órdenes 2, Bodega 3, Despachos 1, Informes 1, Tarifario 2, Servicios 2 —1 pendiente de tarifa—, Bases 1). **Login pendiente del CFO** (WORKERS_BASE provee el usuario admin; no se sembró credencial). `VISUAL QA CERTIFIED` sigue **NO** hasta la revisión del CFO.

### 10.10 Deuda TARGET (no se resuelve acá)
`CORE-IDENTITY-TENANCY-001` — antes del GO-LIVE productivo de `proc_*`: usuario autenticado → identidad verificable → membership usuario↔empresa → tenant enforcement en DB → RLS real. Proyecto transversal a Mediterra One, fuera de Service.
