# Cobertura del respaldo · inventario único

Corte 2026-09-10, tercera sesión, después de ejecutar en staging. **RESPALDO COMPLETO = NO-GO.**

Qué falta para declararlo:
- verificación positiva de credencial restaurada (fixture bloqueado por identidad);
- caso desactivado desde lo restaurado;
- login real por la app contra lo restaurado;
- IAM, bóveda `sec_*` y `auth.users` fuera del lote;
- B1–B4 en el runtime remoto.

Estados:
- **CUBIERTO** · probado en staging (restauración aplicada del lote `prueba-mtvqdtg2-c-2026-09-10`).
- **PROBADO LOCAL** · pruebas unitarias, PostgreSQL local desechable o memoria; falta ejercerlo en staging.
- **NO EJERCIDO** · el código existe, pero staging no tiene el caso o falta un insumo.
- **NO CUBIERTO** · falta mecanismo.
- **EXCLUIDO** · por diseño, con alternativa declarada.

---

## 1 · Inventario

| Fuente · campo | Contenido | Para recuperar | Dónde viaja | Estado | Si no viaja: alternativa y cómo se restaura |
|---|---|---|---|---|---|
| `calendario_data` · filas de negocio declaradas (finanzas, osiris, nóminas, rendiciones, maestros, eeff, mayor, …) | datos de módulos | negocio | A · `negocio` con `clase` | CUBIERTO · idénticas al origen | — |
| `calendario_data` · filas no declaradas en la allowlist | sondas y pruebas (29 en staging) | depende | no viajan | **NO CUBIERTO** | falta decidir si detienen el respaldo o levantan alarma; hoy se reportan y no se copian |
| `audit_log`, `backup_*`, `main_pre_restore_*` | bitácora y copias históricas con credenciales | evidencia | A · `negocio` **vacío**, con `retirados` y `clase`, solo como constancia | EXCLUIDO · **no se reponen** (defecto corregido: antes se escribían vacíos) | bitácora: respaldo nativo o PITR (NO VERIFICADO); copias: no se restauran |
| `main` · `estados`, `comentarios`, `tareasConfig`, `supervisores`, `tareasExtra`, `recsDone`, `recsComentarios`, `mes`, `anio` (y `tareasOverrides` si existe) | módulo Tareas | Tareas | A · `negocio.main` | **CUBIERTO** · antes se perdían | — |
| `main` · otra clave no declarada | desconocido | depende | no viaja | PROBADO LOCAL · **detiene el respaldo** | una persona la clasifica en la allowlist |
| `main.usuarios[]` · nombre, email, cargo, rol, modulos, capabilities, empresas_permitidas, esCFO, desactivado, tab_permisos, cadenaAprobacion, rendPorOtros, rendVerTodas, identity_id | identidad y autorización | usuarios, permisos, desactivados | A · `padron` | CUBIERTO · 7/7, autorización idéntica | — |
| `main.usuarios[]` · campo no clasificado | desconocido | depende | no viaja | CUBIERTO · detiene el respaldo | una persona lo clasifica |
| `main.usuarios[]` · dos usuarios con el mismo `nombre`, o dos nombres con la misma huella | ambigüedad: el login busca `pins[nombre + "_h"]` | — | no viaja | PROBADO LOCAL · **detiene el respaldo** sin exponer nombres | una persona corrige el padrón |
| `main.usuarios[].pin` | **PIN en claro** | — | no viaja | EXCLUIDO · prohibido | el usuario recibe un código provisorio ("¿Olvidaste tu PIN?" o "Resetear PIN" del administrador) y crea un PIN nuevo. En staging, 5 de 7 usuarios activos dependen hoy de esto |
| `pins` · `<nombre>_h` · `v, iter, salt, hash` | credencial PBKDF2 | login | B · `credenciales` | CUBIERTO | — |
| `pins` · `<nombre>_h` · `fecha` y `pol` | vencimiento a 60 días y sello de política | login sin cambio forzado | B · `credenciales[].fecha` y `.pol` | **CUBIERTO** · antes se perdían | — |
| `pins` · `<nombre>_h` · otra llave | desconocido | depende | B · `atributosAdicionales` | PROBADO LOCAL | si es un nombre de texto plano prohibido, detiene el respaldo |
| `pins` · `<nombre>_hist` | credenciales anteriores (`v, iter, salt, hash`) | regla de no repetir las 3 últimas | B · `historial` | **CUBIERTO** · antes se perdía | si es ilegible se reporta y no se copia |
| `pins` · `<nombre>_tel` | celular normalizado; segundo factor de recuperación | recuperación de PIN | B · `telefono` (nunca A) | **CUBIERTO** · antes se perdía | — |
| `pins` · `<nombre>_temp` · material | código provisorio hasheado con expiración a 45 min (o texto plano legado) | — | no viaja | EXCLUIDO · transitorio | ver la fila siguiente |
| `pins` · `<nombre>_temp` · **existencia** | mientras exista, App.jsx inhabilita el PIN anterior | que un reseteo no se deshaga al restaurar | B · `reemisiones[{llave_hash}]` | PROBADO LOCAL · **NO EJERCIDO en staging** (no hay códigos provisorios) | la reconstrucción escribe un `_temp` **vencido** (`TEMP_REEMISION`): el PIN anterior sigue inhabilitado y la app pide uno nuevo. **Reemisión:** "¿Olvidaste tu PIN?" (correo y, si hay `_tel`, celular) o "Resetear PIN" del administrador; crear el PIN borra la marca |
| `pins` · `<nombre>` sin sufijo | **PIN en claro legado** | — | no viaja | EXCLUIDO · prohibido | código provisorio |
| `pins` · `<nombre>_*` cuyo nombre no está en el padrón (renombre, baja física) | credencial huérfana | evidencia | B · `huerfanas` (material, sin nombre ni dueño) | PROBADO LOCAL y **en memoria sobre el snapshot real de staging** · staging no tiene huérfanas reales | **nunca se asigna** a otra persona, tampoco a un nombre parecido. Mientras exista, la **recuperación completa no es declarable** (`evaluarRecuperacion`) |
| `pins` · llave no clasificada | desconocido | depende | no viaja | PROBADO LOCAL · **detiene el respaldo** | una persona la clasifica |
| `sec_identidad_alias` · `llave_hash → identity_id` (origen `calendario_data_main`, vigente) | vínculo usuario ↔ identidad | UUID estable | modo bóveda: B · `identity_id`, leído en el **mismo snapshot**. Modo legacy: no existe | CUBIERTO · UUID 2 de 2 | el vínculo credencial ↔ usuario al restaurar es siempre `llave_hash` = sha256 del **nombre exacto**, la llave legada del login; no es identidad canónica |
| `sec_identidad` (50), `sec_credencial` (18), `sec_credencial_evento/historia`, `sec_operacion`, `sec_desafio`, `sec_sesion`, `sec_identidad_auth_vinculo` (3), `sec_resolucion_evidencia`, `sec_tenant_prohibido` | bóveda canónica de identidad | identidad canónica, auditoría | no viaja | **NO CUBIERTO** · dueño: SEC-HF2-A | a confirmar con el dueño: `sec_cuarentena.snap_*` vive en la misma base. No se crea una segunda bóveda |
| `iam_usuario` (11), `iam_usuario_empresa` (6), `iam_rol_capability` (155) | IAM de staging | membresías y capacidades | no viaja | **NO CUBIERTO** · dueño: IAM | a confirmar con el dueño: `sec_backup` vive en la misma base |
| `auth.users` (24) | usuarios de Supabase Auth | sesión dual (`REACT_APP_AUTH_DUAL`) | no viaja | NO CUBIERTO por este lote | respaldo nativo de Supabase (NO VERIFICADO). El login legado no depende de esta tabla |
| Buckets de adjuntos | archivos | documentos | no viajan | NO CUBIERTO · PLATFORM SECURITY | fuera de este paquete |

### Modo de identidad

El origen declara su modo en el snapshot y la configuración lo declara por escrito. Tienen
que coincidir; nada se infiere.

| Snapshot (`modo_identidad`) | `RESPALDO_MODO_IDENTIDAD` | Resultado |
|---|---|---|
| `boveda` con alias | `boveda` (defecto) | respaldo con UUID; un alias faltante deja el lote INCOMPLETO |
| `legacy` (no existe ninguna tabla de bóveda) | `legacy` | respaldo con `identity_id = null` y vínculo por `llave_hash`; ningún UUID inventado |
| `legacy` | `boveda` (defecto) | se detiene: hay que declarar legacy por escrito |
| `boveda` | `legacy` | se detiene: legacy no tapa identidades faltantes |
| `boveda_incompleta` (existe una sola tabla) | cualquiera | se detiene: error de esquema |
| `boveda` sin alias vigentes | `boveda` | se detiene: error de datos |
| sin el campo (SQL anterior) | cualquiera | se detiene: aplicar `sql/respaldo/snapshot-consistente.sql` |

Staging declara `boveda` (probado). Legacy: PROBADO LOCAL en PostgreSQL 17 desechable.
**Producción: nada ejecutado.** Empaquetarla exige la decisión de identidad, además de
`RESPALDO_PERMITIR_PRODUCCION=si` y `RESPALDO_MODO_IDENTIDAD=legacy`.

## 2 · Snapshot del runtime real

- **RPC:** `POST /rest/v1/rpc/respaldo_snapshot`. Función plpgsql **STABLE**: filas de
  `calendario_data`, conteo, `modo_identidad` e identidades en la misma instantánea.
- **Aplicada en staging el 2026-09-10** con `scripts/respaldo/aplicar-snapshot-consistente.mjs`:
  - preflight: ref en el DSN y la URL, huella estructural, DSN y API ven el mismo lote;
  - captura previa para recuperar: `sql/respaldo/previo/respaldo_snapshot-staging-20260910T160207.sql`;
  - revisión del SQL: sin DROP, DELETE, INSERT, UPDATE ni ALTER; un GRANT a `service_role`;
  - resultado: mismo dueño y misma ACL `{postgres, service_role}`; 43 filas antes y después.
- **Privilegios con llamadas reales:** clave publicable 401, token autenticado sintético 403,
  clave de servicio 200.
- **Consistencia en staging** (`prueba-snapshot-consistencia.mjs`): 40 snapshots con 0
  inconsistencias; contraprueba con lecturas separadas, 12 de 40. En PostgreSQL 17 local, con
  alias concurrente: 200 con 0 inconsistencias; contraprueba 37 de 200.

## 3 · Restauración aplicada y verificación de credencial

`scripts/respaldo/restauracion-aplicada.mjs` sobre `prueba-mtvqdtg2-c-2026-09-10`, esquema
`restauracion_prueba_mtvqdtg2_c_2026_09_10` (sin USAGE de API; la API responde 406):

| Punto | Resultado |
|---|---|
| Recursos de negocio idénticos | PASS · 3 de 3 |
| `main` (Tareas y padrón) idéntico salvo el PIN en claro | PASS |
| Usuarios, correos, desactivados, autorización | PASS · 7/7; 0 desactivados en origen |
| Dueño único por credencial, modo, UUID, `ctId` | PASS · UUID 2 de 2, `ctId` 5/5 |
| `_h` con fecha y pol, `_hist`, `_tel` | PASS |
| Huérfanas no aplicadas; marcas de reemisión | PASS · 0 y 0 en origen |
| Credenciales revertidas al cerrar | PASS |
| Verificación positiva de credencial | **BLOQUEADA** · sin fixture |
| Rama de acceso por usuario activo | PASS · 5 consecuencias declaradas: PIN en claro → sin credencial |
| Login real por la app | **NO EJERCIDO** |
| **Recuperación completa** | **NO DECLARABLE** |

**Primer intento, `prueba-mtvq2x92-c-2026-09-10`: FALLÓ.** 11 recursos de auditoría y copias
se reponían vacíos. Corregido; su esquema `restauracion_*` se conserva como evidencia.

**Verificación de credencial, no login.** `src/data/verificacionCredencialLegacy.js` replica
la decisión de acceso de App.jsx sobre `main` y `pins` releídos del destino.
`qa-respaldo-login-legacy` falla si App.jsx cambia alguna de las 13 reglas copiadas.

**Fixture.** El usuario sintético existente no sirve: no está en el padrón, no tiene `_h` ni
alias y no hay PIN custodiado. Crear uno exige que el dueño de identidad lo enrole con su
función canónica; hasta entonces la verificación positiva y el caso desactivado quedan
bloqueados.

## 4 · Lotes de staging y su cobertura

Inventario de solo lectura (`scripts/respaldo/inventario-lotes.mjs`). Ninguno se borró.

| Lote | Estado | Versión A / B | Cobertura |
|---|---|---|---|
| `auto-2026-09-09` | READY | identidad-v1 / credencial-v1 | **limitada:** sin Tareas; `_h` sin `fecha`/`pol`; sin `_hist`/`_tel`; sin modo ni huérfanas ni reemisiones. El restaurador nuevo lo rechaza |
| `auto-2026-09-10` | READY | identidad-v1 / credencial-v1 | igual al anterior |
| `prueba-mtvq2x92-c-2026-09-10` y `-s-` | READY | identidad-v1 / credencial-v3 | completa salvo `clase` por recurso: reconstruible con la allowlist vigente. Su restauración falló por el defecto de las cáscaras, ya corregido |
| `prueba-mtvqdtg2-c-2026-09-10` y `-s-` | READY | identidad-v1 / credencial-v3 | completa, con `clase` por recurso. `-c-` restaurado con PASS |

Los lotes `-s-` salen de la prueba de dos corridas simultáneas: una sola creación.
