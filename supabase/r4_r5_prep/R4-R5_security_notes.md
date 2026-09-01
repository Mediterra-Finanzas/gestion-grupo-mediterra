# R4/R5 — Notas de seguridad, inventario, patches y procedimientos

Carril 4 (Security prep). Todo LOCAL. NADA ejecutado en remoto. Target de ejecución: staging
**nlvfjpwiecgrosjnwwik** (secuencial, Carril 1). Producción **bywovqayuzodbzwsriet** HANDS-OFF.

---

## 1. Inventario exacto (bridge anon)

**62 tablas base `proc_*`** (derivado de los `CREATE TABLE` en `schema_proc_*` + `temporadas_v2`).
H1 (mapa autoritativo staging) midió **61 `pol_<t>_dev_uat {anon}`** → 1 tabla materializada tras el
último run del bridge dinámico (`schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql`, que itera TODAS las
`proc_%`). Candidata al delta: `proc_temporada_reapertura_permiso` (temporadas_v2, la más nueva).
Los scripts R4 usan `DROP IF EXISTS` + conteo dinámico → se autoajustan al número real.

### Las 62 tablas por lote (allowlist R4-A)

| Lote | Origen | N | Tablas |
|---|---|---|---|
| 1 | v1 | 13 | proc_audit_log, proc_empresa_config, proc_catalogo_activacion, proc_temporada, proc_vinculo, proc_planta, proc_predios, proc_calibre, proc_color, proc_recepcion, proc_lote, proc_movimiento, proc_hold |
| 2 | F2 | 14 | proc_ubicaciones, proc_condiciones, proc_lineas_proceso, proc_categorias_calidad, proc_motivos_descarte, proc_motivos_merma, proc_qc_parametro, proc_qc_recepcion, proc_programa_proceso, proc_orden_proceso, proc_orden_insumo, proc_resultado, proc_resultado_descarte, proc_resultado_merma |
| 3 | F3 | 7 | proc_formato, proc_producto_terminado, proc_pallet, proc_pallet_linea, proc_repaletizaje, proc_repaletizaje_origen, proc_repaletizaje_destino |
| 4 | F4 | 3 | proc_despacho, proc_despacho_linea, proc_despacho_doc |
| 5 | F5 | 5 | proc_informe, proc_informe_version, proc_informe_fuente, proc_informe_destinatario, proc_informe_envio |
| 6 | F6 | 5 | proc_tipo_servicio, proc_tarifa, proc_servicio_facturable, proc_base_cobro, proc_base_cobro_linea |
| 7 | v7.1 | 1 | proc_correlativo |
| 8 | v8/v9/v10/reporting/temporadas | 14 | proc_tipo_movimiento (global `_cat`), proc_tipo_envase, proc_envase_movimiento, proc_especie, proc_variedad, proc_cuartel, proc_cliente_productor, proc_cliente_ficha, proc_tipo_documento_contractual, proc_cliente_contrato, proc_reporte_config, proc_reporte_destinatario, proc_reporte_ejecucion, proc_temporada_reapertura_permiso |

Lotes 1-7 = las mismas 48 tablas de H2-A (las que también tenían `_dev_only`). Lote 8 = las 14 que
recibieron `_dev_uat` del bridge dinámico pero NO estaban en el set `_dev_only`.

### Policy estricta que se PRESERVA por tabla
- **60 tenant**: `pol_<t>_empresa` → `USING (empresa_id = proc_current_empresa()) WITH CHECK (…)`.
- **1 global**: `proc_tipo_movimiento` → `pol_proc_tipo_movimiento_cat` → `FOR SELECT TO authenticated USING(true)`
  (catálogo global read-only; `schema_proc_v1.sql:552-553`).
- El preflight R4-A no hardcodea el nombre: exige **≥1 policy que no sea `_dev_uat` ni `_dev_only`** por
  tabla antes de dropear su `_dev_uat` → cubre `_empresa` y `_cat` uniformemente, fail-closed.

### Grants anon vigentes (allowlist R4-B — REVOKE)
Puestos por el bridge (`visual_uat.sql` pasos 1-3) + schema v10 envases + `_dev_only_rls` (v1):
1. **Tablas** `proc_*` (62): `GRANT SELECT, INSERT, UPDATE, DELETE ... TO anon`.
2. **Vistas** `proc_v_*` (~18, H1 dice ~34 security_invoker; el bridge hizo `GRANT SELECT` a las `proc_v_*`).
3. **Funciones** `proc_fn_*` (RPC operacionales): `GRANT EXECUTE ... TO anon`.
4. Envases v10 (`proc_tipo_envase`, `proc_envase_movimiento`): grant anon propio del schema (H2-B2, diferido a R4 — cubierto por el barrido `proc_*`).
5. `proc_whoami()` `GRANT EXECUTE TO anon` → se elimina al DROPear la función (R5-CLEANUP).

**NUNCA se revoca** (guard duro en R4-B): `anon USAGE ON SCHEMA public`, ni ningún grant sobre
`calendario_data`/`iam_*`/`contab_*` u otro objeto no-`proc_*`. La app LEGADA Mediterra usa la anon key
contra `calendario_data`; tocar eso reintroduce el lockout histórico.

---

## 2. Scripts entregados (orden de ejecución remota, Carril 1)

| # | Archivo | Qué hace | Reversible |
|---|---|---|---|
| 1 | `R4-A_drop_dev_uat.sql` | 8 lotes, drop de las ~61 `pol_<t>_dev_uat`, preflight ≥1-estricta + POST 0-restantes | `R4-A_rollback.sql` |
| 2 | `R4-B_revoke_anon.sql` | REVOKE anon sobre `proc_*`/`proc_v_*`/`proc_fn_*`, guard no-proc + no-regresión authenticated/calendario_data | bloque ROLLBACK inline |
| 3 | `R5-MIN_identity_lookup_rpc.sql` | RPC server-only `proc_fn_identity_lookup(email)` (minimiza service_role→calendario_data) + cambio acompañante en `api/proc-token.js` | `DROP FUNCTION` inline |
| 4 | `R5-CLEANUP_drop_whoami.sql` | DROP de `proc_whoami()` (capability de certificación) | re-desplegar `proc_whoami_cert.sql` |

`R4-A` y `R4-B` son **inseparables** para el cierre: A quita la policy anon, B quita el grant. Estado
intermedio (solo A) es seguro para authenticated pero deja anon con grant sin policy (RLS filtra) — no
dejar staging ahí.

Ensayo local: `r4_rehearsal_setup.sql` + `r4_rehearsal_harness.sh` (base scratch `r4_reh` en Docker
`proc_uat`). **Resultado: 18/18 PASS** (ver §5).

---

## 3. Patch del `detail` DEBUG (quitar antes de prod)

El detalle técnico de la excepción se filtra al cliente y se pinta en pantalla. Dos mitades:

### 3a. Servidor — `api/proc-token.js:125-126`
```js
// ANTES (L125-126):
// DEBUG STAGING (quitar antes de Producción — registrado en zero-loss): detalle no sensible para el gate.
return res.status(500).json({ error: "error_interno", detail: String((e && e.message) || e).slice(0, 300) });

// DESPUÉS:
return res.status(500).json({ error: "error_interno" });
```
El log server-side (`console.error("[proc-token] error_interno:", …)` en L124) SE CONSERVA — la traza
queda en Vercel Runtime Logs, no en la respuesta HTTP.

### 3b. Cliente — `src/proceso/core/procAuth.js:69-70`
```js
// ANTES (L69-70):
// Surface el detalle técnico (DEBUG STAGING) en el mensaje → visible en la pantalla de error.
const msg = j.detail ? `${j.error || "error"} — ${j.detail}` : (j.error || `proc-token HTTP ${r.status}`);

// DESPUÉS (ya no depende de j.detail):
const msg = j.error || `proc-token HTTP ${r.status}`;
```

Ambos cambios son de app (frontend/api), fuera del alcance SQL de este carril → se dejan como patch
documentado, NO aplicado. Aplicar junto con el resto del hardening pre-prod.

Nota: `supabase/functions/osiris-auth/index.ts` también usa `detail`, pero con **mensajes estáticos**
(no eco de la excepción) → no filtra internals, no requiere cambio.

---

## 4. Rotación del PIN (procedimiento — hubo un PIN expuesto en DOM)

Contexto: los PIN viven en la fila `pins` de `calendario_data` (no en `main`), como hash PBKDF2
(`{nombre}_h`). Un PIN quedó visible en el DOM en algún momento → debe rotarse. Procedimiento sin
exponer valores en chat/logs (regla "no exponer tokens/secretos"):

1. **Identificar** los `_h` a rotar en la fila `pins` (por `nombre`). No leer/pegar el valor plano.
2. **Generar** el nuevo PIN en el flujo normal de la app (panel de reseteo de PIN de `App.jsx`), que
   recalcula el hash PBKDF2 y reescribe `pins[{nombre}_h]`. NUNCA escribir el hash a mano.
3. **Invalidación de sesiones**: como el login PROC (Option C) mintea sesión Supabase Auth via
   `admin.mintSession`, rotar el PIN NO invalida tokens ya emitidos (viven ≤ su `exp`, memoria por tab).
   Si el PIN se considera comprometido, además:
   - Forzar expiración: los tokens Option C son de vida corta (margen 15s en `getProcToken`); esperar el
     `exp` o pedir al usuario cerrar la pestaña (el token vive solo en memoria de esa tab).
   - Opcional duro: rotar credenciales del usuario en Supabase Auth (Dashboard) si se sospecha robo del
     access_token, no solo del PIN.
4. **Throttle**: `proc_auth_throttle` limita fuerza bruta por identidad/IP con claves HMAC opacas — ya
   mitiga reintentos con el PIN viejo mientras se rota.
5. **Verificar** post-rotación: un login con el PIN nuevo emite sesión; con el viejo → 401 `credenciales`.

Guía de ejecución para Angelo (dónde/cómo): App Mediterra → panel de administración de PINs → seleccionar
el trabajador afectado → "Resetear PIN" → ingresar el nuevo PIN en el propio dispositivo del trabajador
(no dictarlo por chat). Confirmar que la fila `pins` se actualizó (auto-save) y probar un login.

---

## 5. Rehearsal local — evidencia (18/18 PASS)

Docker `proc_uat`, base única `r4_reh` (creada y DROPeada por el harness). Mock 1:1 del estado PRE-R4:
3 tablas `proc_*` (2 tenant `_empresa` + 1 global `_cat`) con `_dev_uat {anon}` + grants anon +
`calendario_data` con grant anon (app legada). Resolver `proc_current_empresa()` v2 copiado fiel.

```
[1] PRE-R4 (bridge activo):  anon lee/escribe proc_lote ✓, authenticated ALS=2 ✓, x-tenant=0 ✓,
                             calendario_data anon ✓, catálogo global anon ✓         (6/6)
[2] APLICAR R4:              R4-REH OK: 0 _dev_uat, 0 grants anon proc_*,
                             calendario_data anon intacto                            (mecanismo 1:1)
[3] POST-R4:                 anon SELECT/INSERT/catálogo → DENY ✓✓✓,
                             authenticated ALS=2 ✓, insert propio ✓, x-tenant read=0 ✓,
                             x-tenant write DENY ✓, sin-membership=0 ✓, catálogo authenticated ✓,
                             calendario_data anon intacto ✓                          (10/10)
[4] ROLLBACK:                re-crea _dev_uat + re-grant anon → anon vuelve a ALLOW  (2/2)
[5] Teardown:                DROP DATABASE r4_reh
RESULT: PASS=18 FAIL=0
```

Prueba clave: **tras R4, anon = DENY (permission denied) y authenticated con membership = ALLOW con
tenant enforcement intacto; `calendario_data` (app legada) NO se toca; rollback restaura**. El guard
no-proc y los POST-checks fail-closed se ejercitan 1:1 con los scripts R4-A/R4-B.

---

## 6. Qué requiere ejecución remota (Carril 1, secuencial)

1. `R4-A_drop_dev_uat.sql` → staging (8 lotes; se puede detener entre lotes).
2. `R4-B_revoke_anon.sql` → staging (inmediatamente después de A).
3. Certificación R5 (`R5_certification_plan.md`, 16 celdas) → staging, con login Option C real.
4. `R5-MIN_identity_lookup_rpc.sql` → staging, + merge del cambio en `api/proc-token.js`.
5. `R5-CLEANUP_drop_whoami.sql` → staging.
6. Patches §3 (detail-DEBUG) merge a la app antes de cualquier promoción a prod.
7. Rotación de PIN (§4) — acción de Angelo en la app.

Ninguno de estos toca producción `bywovqayuzodbzwsriet`.

---

## 7. Blockers / decisiones CFO

- **B1 (precondición viva)**: R4 exige que la app corra 100% authenticated (`REACT_APP_PROC_AUTH=true`
  + token Option C) ANTES del REVOKE. Si algún flujo PROC todavía cae a la anon key (fallback en
  `procAuthGuardToken` con flag OFF), R4-B lo mata. **Verificar que el flag está ON en staging y que no
  queda ningún path anon en `src/proceso/**` antes de correr R4-B.**
- **B2 (app legada vs anon)**: confirmado que la anon key SOLO se usa fuera de `proc_*` (calendario_data,
  etc.). R4-B es object-scoped y no la toca. Decisión: mantener anon para la app legada (no se cierra en
  R4); su hardening es un gate aparte.
- **D1 (delta 61 vs 62)**: aceptar el conteo dinámico (no hardcodear 61). Confirmar en staging cuál tabla
  no tiene `_dev_uat` (esperado: `proc_temporada_reapertura_permiso`).
- **D2 (minimización)**: aprobar `proc_fn_identity_lookup` + el cambio en `api/proc-token.js`. Alternativa
  mayor (mover PBKDF2 al motor) queda fuera de alcance; se acota el SELECT, no la verificación.

---

## 8. SAFE TO EXECUTE R4 — Veredicto

**YES, condicionado a:**
1. Confirmar B1: flag `REACT_APP_PROC_AUTH=true` activo en staging + 0 paths anon residuales en
   `src/proceso/**` (login Option C probado — ya certificado según memoria IAM staging).
2. Ejecutar en orden A → B, verificando el NOTICE fail-closed de cada lote (abortar si algún lote no
   reporta "0 restantes" / "estrictas intactas").
3. Tener `R4-A_rollback.sql` + el ROLLBACK de R4-B a mano.
4. Correr la certificación R5 (16 celdas) inmediatamente después; si R5-06/07/12 caen → rollback.

El mecanismo está probado 1:1 en local (18/18). No hay cambio destructivo de datos (solo policies +
grants). Producción intacta.
