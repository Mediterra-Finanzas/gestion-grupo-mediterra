# Traspaso · respaldo recuperable, planilla y runtime

Corte 2026-09-10. **RESPALDO COMPLETO = NO-GO.** B1–B4 siguen NO OBSERVADOS.
Producción: no se eliminó ni se sobrescribió nada, no se cambiaron permisos ni se desplegó.

## 1 · Por qué hay traspaso

En la conversación anterior, el control automático de permisos empezó a bloquear toda
ejecución de comandos, incluidas lecturas como `git status`. También bloqueó
`preview_list`. El bloqueo responde al contenido de esa conversación, no a un comando
concreto. Lectura y escritura de archivos siguieron funcionando.

- **No** se desactivan controles de permisos de forma global.
- La continuación se hace en una **sesión nueva**, en el modo de permisos por defecto,
  aprobando cada comando con el alcance que se indica abajo.

## 2 · Estado exacto

El estado git no se pudo verificar por el bloqueo. Esta lista sale de las ediciones
hechas; el paso 0 la confirma.

### `.claude/worktrees/wt-respaldo-prod` · rama `respaldo/candidato-produccion` · base `92b30c0` (= origin) · sin commit

| Archivo | Cambio |
|---|---|
| `api/osiris-respaldo-cron.js` | registra commit, rama, entorno y deployment; identidades desde el mismo snapshot; prefijo de lote por `RESPALDO_PREFIJO_LOTE`; cabecera de variables corregida (`SMTP_OSIRIS_*`) |
| `src/data/respaldoDesdeSnapshot.js` | Tareas de `main` en `negocio.main`; clave de `main` no clasificada detiene el respaldo; `resolverDesdeSnapshot` |
| `src/data/respaldoIdentidad.js` | B `credencial-v2`: `fecha`, `pol`, `historial`, `telefono`, `llave_hash`, `complementos`; `_temp` y PIN en claro excluidos con motivo; llave desconocida detiene el respaldo |
| `src/data/reconstruirDesdeLote.js` | **nuevo** · reconstrucción de `main`/`pins`/negocio solo desde el lote |
| `src/data/__tests__/qa-respaldo-cobertura.test.js` | **nuevo** · 16 casos con contrapruebas |
| `src/data/__tests__/qa-respaldo-identidad.test.js` | ajustado a `_tel` e historial |
| `sql/respaldo/invocacion-despliegue.sql` | **nuevo** · **ya aplicado en staging** el 2026-09-10 (columnas del deployment y revocación de EXECUTE a anon/authenticated en dos funciones auxiliares) |
| `sql/respaldo/snapshot-consistente.sql` | **nuevo** · **NO aplicado** |
| `scripts/respaldo/prueba-snapshot-consistencia.mjs` | **nuevo** |
| `scripts/respaldo/restauracion-aplicada.mjs` | **nuevo** |
| `scripts/respaldo/fixture-restauracion.mjs` | **nuevo** |
| `scripts/respaldo/prueba-tramo-completo.mjs` | ya no borra lotes; usa prefijos propios |
| `scripts/respaldo/verificar-runtime-remoto.mjs` | `--sha=` y estado "commit ejecutado" |
| `scripts/osiris/planilla-conciliacion-datos.mjs`, `planilla-conciliacion.py` | obtentor validado por contrato y concepto, obligación de contract fee, movimientos con el obtentor, factura 121 como pendiente documental |
| `docs/osiris-tech/GUIA-PANEL-VERCEL.md`, `MATRIZ-CIERRE-OSIRIS.md` | corregidos |
| `docs/osiris-tech/COBERTURA-RESPALDO.md`, `TRASPASO-RESPALDO-2026-09-10.md` | **nuevos** |

### `.claude/worktrees/wt-runtime-staging` · rama `runtime/staging-respaldo` · base `9657d06` (= origin) · sin commit

| Archivo | Cambio |
|---|---|
| `package.json` | `engines.node = "24.x"` |
| `public/index.html` | `<meta name="commit-sha" content="%REACT_APP_VERCEL_GIT_COMMIT_SHA%">` |
| `src/data/__tests__/qa-runtime-staging.test.js` | 5 guardas nuevas. La de la guía **falla** hasta traer la guía nueva desde la rama de respaldo |

### `.claude/worktrees/wt-fee-fuente-unica` · rama local `osiris/fee-entrada-fuente-unica` · base `732abf5` · no se empuja

| Archivo | Cambio |
|---|---|
| `scripts/osiris/preservacion-fee-tres-pasadas.mjs` | **nuevo** · ejecutado: PASS en staging y producción |
| `docs/osiris-tech/IMPACTO-FEE-ENTRADA-FUENTE-UNICA.md` | tres pasadas, 245.700 reclasificado, factura 121 como pendiente documental |

`wt-osiris-ux-app` sin cambios.

### Fuera del repositorio

- Scratchpad de la sesión anterior:
  `C:\Users\angel\AppData\Local\Temp\claude\C--Users-angel-Documents-Proyectos-gestion-grupo-mediterra\a7dd1e35-02c6-41bc-b9ee-0b112bf89fe7\scratchpad`
  - `pgclient\node_modules\pg`, cliente PostgreSQL que usan todos los scripts vía `SP`;
  - `OsirisModule-main.jsx`;
  - `pagos-obtentor.json`;
  - `preservacion-tres-pasadas.txt`.

  Si la carpeta ya no existe: `npm install pg` en una carpeta nueva y
  `git show origin/main:src/OsirisModule.jsx > <SP>/OsirisModule-main.jsx`.
- Planilla vigente: `conciliacion-osiris/Osiris-conciliacion-23-contratos-2026-09-10.xlsx`,
  local, excluida de git, **sin regenerar**.
- Credenciales: solo en `.env.osiris-staging.local` y `.env.osiris-prod-readonly.local`,
  que están excluidos de git. No se imprimen.

## 3 · Secuencia para la sesión nueva

Cada paso indica qué toca. Un paso que falla detiene los siguientes.

**0 · Confirmar el estado (solo lectura).** En cada worktree, `git status --porcelain` y
`git rev-parse --short HEAD`. Deben calzar con la sección 2. Si hay diferencias, se
informan antes de seguir.

**1 · Preview (solo lectura; no se detiene ningún proceso).**
1. `preview_list` para ver el `serverId` y el nombre de la configuración.
2. Según `.claude/launch.json`:
   - `mediterra-dev` = `npm start` en la raíz (rama `deploy-allpa`, monta `App.jsx`);
   - `ux-osiris-staging` = harness de `wt-respaldo-prod`, que no monta App;
   - `runtime-build-staging` = servidor estático de un build.
3. `read_network_requests` con el patrón `supabase.co`: host de destino y, si hay, métodos
   `POST`/`PATCH` sobre `calendario_data`.
4. Se informa el destino real. No se usa el Preview para pruebas mutantes hasta confirmar
   aislamiento, y no se cierran procesos ajenos.

**2 · Pruebas unitarias (locales, sin red).** En `wt-respaldo-prod`, con
`scripts/gen-jest-config.js` como en las sesiones anteriores: `qa-respaldo-identidad`,
`qa-respaldo-cobertura`, `qa-restore-lote`, `qa-hotfix-generador`, `qa-shp-backup`. Se
corrige hasta que pasen y se commitea en `respaldo/candidato-produccion`.

**3 · Snapshot consistente (escritura de DDL solo en staging).**
1. Aplicar `sql/respaldo/snapshot-consistente.sql` con `OSIRIS_STAGING_DATABASE_URL`,
   verificando antes que el DSN no sea el productivo.
2. `node scripts/respaldo/prueba-snapshot-consistencia.mjs`. Escribe solo en las filas de
   prueba `respaldo_prueba_consistencia_a/_b`. Debe dar PASS, no "NO CONCLUYENTE".

**4 · Fixture (lectura; escritura solo si hace falta y está coordinada).**
1. `node scripts/respaldo/fixture-restauracion.mjs` informa si sirve el sintético existente.
2. Si no sirve: el dueño de identidad (carril SEC-HF2-A) enrola la identidad del fixture
   con su función canónica.
3. Recién después, `--crear`. Agrega el usuario a `main` y `_h` a `pins` en sentencias
   aditivas y custodia el PIN sin imprimirlo.

**5 · Lote con la cobertura nueva (escritura en staging: lote de prueba y objetos en el
bucket privado).** `node scripts/respaldo/prueba-tramo-completo.mjs`. No borra nada e
imprime el `lote_id`.

**6 · Restauración aplicada (escritura en staging: esquema `restauracion_<lote>`; las
credenciales se revierten).** `node scripts/respaldo/restauracion-aplicada.mjs <lote_id>`.

**7 · Desactivados.** `fixture-restauracion.mjs --desactivar`, un lote nuevo (paso 5) y
restauración de ese lote (paso 6).

**8 · Planilla (producción solo GET; escribe el xlsx local).**
1. `git show origin/main:src/OsirisModule.jsx > <SP>/OsirisModule-main.jsx`.
2. `node scripts/osiris/planilla-conciliacion-datos.mjs`, que debe imprimir cuadres en 0.
3. `python scripts/osiris/planilla-conciliacion.py conciliacion-osiris/Osiris-conciliacion-23-contratos-<fecha>.xlsx`.

**9 · Runtime (local, luego push de ramas de staging autorizadas).**
1. En `wt-runtime-staging`: `git merge --no-ff respaldo/candidato-produccion`.
2. Correr `qa-runtime-staging`.
3. Build con Node 24: `CI=true REACT_APP_UX_SOLO=1 npm run build`. Escribe solo `build/`.
4. Confirmar que el `index.html` construido conserva la meta `commit-sha`.
5. Si todo pasa: commit, y `git push origin respaldo/candidato-produccion` y
   `git push origin runtime/staging-respaldo`. Nunca `main`, nunca force.
6. El SHA probado es `git rev-parse origin/runtime/staging-respaldo`. Se entrega junto con
   la guía.

## 4 · Coordinación y decisiones abiertas

1. **Dueño de identidad y de IAM.**
   - Cómo se respaldan fuera de la base `sec_*`, `iam_*` y `auth.users`. Hoy existen
     `sec_backup` y `sec_cuarentena`, pero viven en la misma base.
   - El enrolamiento del fixture.
   - No se crea un segundo modelo de identidad.
2. **Filas de `calendario_data` no declaradas** en la allowlist: detener el respaldo o
   alarmar. Hoy se reportan en `bloqueadas` y no se copian.
3. **Producción:** no tiene bóveda. Empaquetar el respaldo para producción exige antes una
   decisión de identidad.
4. **Factura 121 de IQ:** detalle de contratos y conceptos, y la diferencia de USD 100.
   Son pendientes documentales; no se asume que cubra contract fees.
5. **B1–B4:** pendientes hasta observarlos en remoto.

## 5 · Tercera sesión (2026-09-10) · correcciones antes del SQL

La ejecución de comandos volvió a funcionar con aprobación normal. Nada se ejecutó en
staging ni en producción.

**Paso 0 · PASS.** Los cuatro worktrees calzan con la sección 2: HEAD `92b30c0`, `9657d06`,
`732abf5` y `8341bb8`, iguales a origin, con los mismos archivos modificados y nuevos.

**Paso 1 · sin dato.** `preview_list` está vacío en esta sesión. El servidor de la otra
conversación no es accesible desde aquí; no se midió su destino ni se levantó uno propio.

**Paso 2 · correcciones con pruebas** (local, sin red).

| Defecto | Corrección | Prueba |
|---|---|---|
| Compatibilidad legacy: en producción todo lote salía INCOMPLETO y el SQL no se podía crear | `respaldo_snapshot()` pasa a plpgsql STABLE portable y declara `modo_identidad` (`boveda`, `legacy`, `boveda_incompleta`). El handler exige que `RESPALDO_MODO_IDENTIDAD` (defecto `boveda`) coincida. Legacy: `identity_id = null`, vínculo por `llave_hash`, ningún UUID inventado. Bóveda a medias, bóveda sin alias o snapshot sin modo son errores, nunca legacy. En modo bóveda, un alias faltante sigue dejando el lote INCOMPLETO | `qa-respaldo-cobertura`; `prueba-snapshot-portable-local.mjs` en PostgreSQL 17 desechable: 21 PASS, contraprueba 37 de 200 |
| Enlace de credenciales: `resolverContra` quitaba acentos y usaba el correo | Nombre exacto, sin normalizar ni correo. Nombres repetidos o con la misma huella detienen el respaldo. Llave sin usuario en el padrón = huérfana: su material viaja en `B.huerfanas`, no se asigna y se reporta. Una huella con dos UUID no se resuelve | casos José/Jose, NFC/NFD, colisión, repetidos y renombre |
| `restauracion-aplicada.mjs` llamaba login a una verificación de credencial y consultaba `sec_identidad_alias` sin verificar que existiera | Réplica extraída a `src/data/verificacionCredencialLegacy.js` (`ALCANCE = "verificacion_de_credencial"`). El script la rotula así e informa aparte "login real · NO EJERCIDO", que nunca cuenta como PASS. Bóveda, IAM y Auth se consultan solo si existen | `qa-respaldo-login-legacy`: 13 reglas de App.jsx vigiladas y todas las ramas de decisión |
| Reemisión del código provisorio sin resolver | B lleva la marca `reemisiones`. La reconstrucción escribe un `_temp` vencido (`TEMP_REEMISION`) que mantiene inhabilitado el PIN anterior y obliga a reemitir | origen, restaurado, reemitido y PIN nuevo; contraprueba: sin la marca, el PIN inhabilitado vuelve a entrar |

Resultado: 6 suites y 145 pruebas PASS (antes, 5 suites y 101 pruebas). `node --check` OK en
el handler y en los scripts de respaldo. B pasa a `credencial-v3`: `restauracion-aplicada.mjs`
rechaza un lote anterior y hay que generar uno nuevo en el paso 5.

**Commit local sin push** en `respaldo/candidato-produccion`: el código, las pruebas, el SQL y la
documentación del respaldo. **Quedan sin commit, a propósito**, los archivos del paso 8, que no
se ejecutó: `scripts/osiris/planilla-conciliacion-datos.mjs`, `scripts/osiris/planilla-conciliacion.py`
y `docs/osiris-tech/MATRIZ-CIERRE-OSIRIS.md`.

**Siguiente: paso 3.** `sql/respaldo/snapshot-consistente.sql` sigue **NO aplicado** en staging.
Aplicarlo es escritura de DDL en staging y espera la autorización del CFO.

## 6 · Tercera sesión, continuación · ejecución en staging

Autorizado por el CFO: solo gestion-mediterra-staging (`nlvfjpwiecgrosjnwwik`). Producción
solo se leyó por GET para la planilla. Fee Entrada sigue detenida para producción.

| Paso | Resultado |
|---|---|
| 3 · destino | ref en el usuario del DSN y en la URL; bóveda y tablas del respaldo presentes; DSN y API ven el mismo último lote |
| 3 · captura previa | `sql/respaldo/previo/respaldo_snapshot-staging-20260910T160207.sql`: definición anterior (`language sql`, sin identidades), dueño `postgres`, ACL `{postgres, service_role}`, lista para recuperar |
| 3.1 · aplicación | `aplicar-snapshot-consistente.mjs --aplicar` PASS: el SQL no tiene DROP, DELETE, INSERT, UPDATE ni ALTER; mismo dueño y misma ACL; `calendario_data` 43 filas antes y después; clave publicable 401; servicio 200, modo `boveda`, 7 identidades |
| 3.2 · consistencia | `prueba-snapshot-consistencia.mjs` PASS: token autenticado 403; 40 snapshots con 0 inconsistencias; contraprueba 12 de 40. Las filas `respaldo_prueba_consistencia_a/_b` no existían; se crearon y se conservan |
| 4 · fixture | el sintético existente **NO SIRVE**: no está en el padrón, no tiene `_h` ni alias y no hay PIN custodiado. **BLOQUEADO**: enrolarlo exige al dueño de identidad. No se creó ni duplicó ningún usuario |
| 5 · lote | `prueba-mtvq2x92-c-2026-09-10` READY_VERIFICADO |
| 6 · restauración | sobre ese lote **FALLÓ** en 11 recursos: `audit_log` y `backup_*` viajan vacíos y se reponían vacíos, lo que en un destino real borraría la bitácora y las copias. Corregido en `36e6259`. Lote nuevo `prueba-mtvqdtg2-c-2026-09-10`: **PASS**, 0 fallas. Se conservan los dos esquemas `restauracion_*` |
| huérfanas | staging no tiene huérfanas reales. En memoria sobre el snapshot real: 2 inyectadas, preservadas, no asignadas (tampoco a la variante en mayúsculas de un usuario real); recuperación completa no declarable (`prueba-huerfana-snapshot.mjs`, regla en `c84f149`) |
| 7 · desactivados | NO EJERCIDO: staging no tiene desactivados y el caso depende del fixture |
| 8 · planilla | `conciliacion-osiris/Osiris-conciliacion-23-contratos-2026-09-10-r2.xlsx`; la anterior se conserva. Cuadres en 0; cifras iguales a la matriz |

Veredicto de la restauración: RESTAURACIÓN APLICADA PASS · VERIFICACIÓN DE CREDENCIAL
positiva BLOQUEADA · LOGIN REAL NO EJERCIDO · RECUPERACIÓN COMPLETA NO DECLARABLE.
**RESPALDO COMPLETO = NO-GO.**

Dato de staging confirmado: 5 de 7 usuarios activos entran hoy con PIN en claro (sin `_h`).
Tras restaurar quedan sin credencial y necesitan código provisorio. Es consecuencia declarada.

Lotes anteriores y versiones: `COBERTURA-RESPALDO.md` §4. Ninguno se borró.

**Pendientes con insumo humano:**
1. Dueño de identidad (SEC-HF2-A): enrolar la identidad del fixture (`llave_hash` = sha256 del
   nombre) para la verificación positiva y el caso desactivado. Después:
   `fixture-restauracion.mjs --crear`, lote nuevo y restauración; luego `--desactivar`.
2. Decisión de arquitectura: un runtime cuyo origen sea lo restaurado, para ejercer el login real.
3. Decisiones de la sección 4: IAM, `sec_*` y `auth.users` fuera de la base; filas fuera de la
   allowlist; producción.

Paso 9 (runtime): §7.

## 7 · Paso 9 · runtime integrado y publicado

| Punto | Resultado |
|---|---|
| Cambios pendientes del runtime (Node 24, meta `commit-sha`, guardas) | commit `286fb3f` |
| Merge `--no-ff` de `respaldo/candidato-produccion` (`df0af31`) | `7dd2378`, sin conflictos |
| Pruebas en el runtime | 7 suites y 168 casos PASS, incluida `qa-runtime-staging` |
| Build con Node 24.15 (`CI=true REACT_APP_UX_SOLO=1`) | compila; `build/` está excluido de git |
| Meta `commit-sha` en `build/index.html` | igual al SHA del commit construido |
| Ref productiva en el JS construido | 1 ocurrencia: la guardia del harness que rechaza apuntar a producción |
| ¿`src/index.js` monta `App`? | no, en las dos ramas |
| Publicación | fast-forward, sin force: `respaldo/candidato-produccion` `92b30c0`→`df0af31`; `runtime/staging-respaldo` `9657d06`→`7dd2378` |

**SHA probado: `7dd2378e043535c09366e7f09b458f935a7d6c0c`** (`origin/runtime/staging-respaldo`).
Esta sección se agrega después, en un commit que solo toca documentación en
`respaldo/candidato-produccion`; no cambia el SHA probado del runtime.

**Siguiente, fuera de esta sesión:**
1. Proyecto de Vercel del runtime, según `GUIA-PANEL-VERCEL.md` (acción en el panel): crear el
   deployment desde `7dd2378…`, confirmar el SHA en Source y en la meta antes de Run, con el cron
   desactivado hasta entonces. Después, observar B1–B4.
2. Fixture con el dueño de identidad (§6, pendiente 1).
3. Decisiones de la sección 4.
