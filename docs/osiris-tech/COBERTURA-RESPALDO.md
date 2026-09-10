# Cobertura del respaldo · inventario único

Corte 2026-09-10, tercera sesión. **RESPALDO COMPLETO = NO-GO.**

Los PASS anteriores valen solo para lo que probaron:
- snapshot, cifrado A/B, subida y reconstrucción **en memoria** del objeto que existía;
- negocio y autorización del padrón;
- credenciales `_h` sin `fecha` ni `pol`.

**No** prueban la recuperación de Tareas, del historial de PIN, del teléfono, de IAM ni de
la bóveda, ni un login contra datos restaurados.

Estados:
- **CUBIERTO** · probado en staging.
- **PROBADO LOCAL** · pruebas unitarias o PostgreSQL local desechable; falta staging.
- **PREPARADO** · código escrito, sin ejecutar.
- **NO CUBIERTO** · falta mecanismo.
- **EXCLUIDO** · por diseño, con alternativa declarada.

---

## 1 · Inventario

| Fuente · campo | Contenido | Para recuperar | Dónde viaja | Estado | Si no viaja: alternativa y cómo se restaura |
|---|---|---|---|---|---|
| `calendario_data` · filas de negocio declaradas (finanzas, osiris, nóminas, rendiciones, maestros, eeff, mayor, …) | datos de módulos | negocio | A · `negocio` | CUBIERTO | — |
| `calendario_data` · filas no declaradas en la allowlist | desconocido | depende | no viajan; el lote las lista en `bloqueadas` | **NO CUBIERTO** | falta decidir si detienen el respaldo o levantan alarma; hoy se reportan y no se copian |
| `main` · `estados`, `comentarios`, `tareasConfig`, `supervisores`, `tareasExtra`, `recsDone`, `recsComentarios`, `mes`, `anio` (y `tareasOverrides` si existe) | módulo Tareas | Tareas | A · `negocio.main` | **PROBADO LOCAL** · antes se perdían | — |
| `main` · otra clave no declarada | desconocido | depende | no viaja | PROBADO LOCAL · **detiene el respaldo** | una persona la clasifica en la allowlist |
| `main.usuarios[]` · nombre, email, cargo, rol, modulos, capabilities, empresas_permitidas, esCFO, desactivado, tab_permisos, cadenaAprobacion, rendPorOtros, rendVerTodas, identity_id | identidad y autorización | usuarios, permisos, desactivados | A · `padron` | CUBIERTO en memoria | — |
| `main.usuarios[]` · campo no clasificado | desconocido | depende | no viaja | CUBIERTO · detiene el respaldo | una persona lo clasifica |
| `main.usuarios[]` · dos usuarios con el mismo `nombre`, o dos nombres con la misma huella | ambigüedad: el login busca `pins[nombre + "_h"]` | — | no viaja | **PROBADO LOCAL** · **detiene el respaldo** sin exponer nombres | una persona corrige el padrón |
| `main.usuarios[].pin` | **PIN en claro** | — | no viaja | EXCLUIDO · prohibido | el usuario recibe un código provisorio ("¿Olvidaste tu PIN?" o "Resetear PIN" del administrador) y crea un PIN nuevo |
| `pins` · `<nombre>_h` · `v, iter, salt, hash` | credencial PBKDF2 | login | B · `credenciales` | CUBIERTO | — |
| `pins` · `<nombre>_h` · `fecha` | fecha de creación; vence a los 60 días | login sin cambio forzado | B · `credenciales[].fecha` | **PROBADO LOCAL** · antes se perdía | — |
| `pins` · `<nombre>_h` · `pol` | sello de política de 6 dígitos (no secreto) | login sin cambio forzado | B · `credenciales[].pol` | **PROBADO LOCAL** · antes se perdía | — |
| `pins` · `<nombre>_h` · otra llave | desconocido | depende | B · `atributosAdicionales` | PROBADO LOCAL | si es un nombre de texto plano prohibido, detiene el respaldo |
| `pins` · `<nombre>_hist` | JSON con credenciales anteriores (`v, iter, salt, hash`); sin PIN en claro | regla de no repetir las 3 últimas | B · `historial` | **PROBADO LOCAL** · antes se perdía | si es ilegible se reporta y no se copia: la regla vuelve a empezar vacía y el login no cambia |
| `pins` · `<nombre>_tel` | celular normalizado; dato personal y segundo factor de recuperación | recuperación de PIN | B · `telefono` (nunca A) | **PROBADO LOCAL** · antes se perdía | — |
| `pins` · `<nombre>_temp` · material | código provisorio hasheado con expiración a 45 min (o texto plano legado) | — | no viaja | EXCLUIDO · transitorio | ver la fila siguiente |
| `pins` · `<nombre>_temp` · **existencia** | mientras exista, App.jsx inhabilita el PIN anterior | que un reseteo no se deshaga al restaurar | B · `reemisiones[{llave_hash}]` | **PROBADO LOCAL** | la reconstrucción escribe un `_temp` **vencido** (`TEMP_REEMISION`): el PIN anterior sigue inhabilitado y la app muestra "El código provisorio venció. Solicita uno nuevo". **Reemisión:** el usuario usa "¿Olvidaste tu PIN?" (correo y, si tiene `_tel`, celular, que sí viaja) o el administrador usa "Resetear PIN". Ambos escriben un `_temp` nuevo encima; crear el PIN lo borra. Sin la marca, restaurar el `_h` rehabilitaría un PIN inhabilitado por un reseteo (contraprueba en `qa-respaldo-cobertura`) |
| `pins` · `<nombre>` sin sufijo | **PIN en claro legado** | — | no viaja | EXCLUIDO · prohibido | código provisorio |
| `pins` · `<nombre>_*` cuyo nombre no está en el padrón (renombre, baja física) | credencial huérfana | evidencia | B · `huerfanas` (material, sin nombre ni dueño) | **PROBADO LOCAL** · se reporta, no detiene | no se aplica al restaurar: no hay usuario al que asignarla. El usuario renombrado queda sin credencial, igual que hoy en el origen, y entra con código provisorio |
| `pins` · llave no clasificada | desconocido | depende | no viaja | PROBADO LOCAL · **detiene el respaldo** | una persona la clasifica |
| `sec_identidad_alias` · `llave_hash → identity_id` (origen `calendario_data_main`, vigente) | vínculo usuario ↔ identidad | UUID estable | modo bóveda: B · `identity_id` por entrada, leído en el **mismo snapshot**. Modo legacy: no existe | **PROBADO LOCAL** | el vínculo credencial ↔ usuario al restaurar es siempre `llave_hash` = sha256 del **nombre exacto**, la llave legada del login; no es identidad canónica. Sin normalizar: "José" y "Jose" son dos llaves |
| `sec_identidad`, `sec_credencial`, `sec_credencial_evento/historia`, `sec_operacion`, `sec_desafio`, `sec_sesion`, `sec_identidad_auth_vinculo`, `sec_resolucion_evidencia`, `sec_tenant_prohibido` | bóveda canónica de identidad | identidad canónica, auditoría | no viaja | **NO CUBIERTO** · dueño: SEC-HF2-A | a confirmar con el dueño: en staging existen `sec_cuarentena.snap_*` (copias de las tablas `sec_*`), pero viven en la misma base y no protegen contra su pérdida. No se crea una segunda bóveda |
| `iam_usuario` (11), `iam_usuario_empresa` (6), `iam_rol_capability` (155) | IAM de staging | membresías y capacidades | no viaja | **NO CUBIERTO** · dueño: IAM | a confirmar con el dueño: existe `sec_backup` (`iam_snapshot`, `iam_rol_capability_snap`, `manifiesto`, `corrida`, `objeto`), también en la misma base |
| `auth.users` | usuarios de Supabase Auth | sesión dual (`REACT_APP_AUTH_DUAL`) | no viaja | NO CUBIERTO por este lote | respaldo nativo de Supabase (NO VERIFICADO, requiere captura del panel). El login legado no depende de esta tabla |
| `audit_log` | bitácora, cortada a 200 caracteres | evidencia | no viaja | EXCLUIDO · auditoría | respaldo nativo o PITR (NO VERIFICADO); la reconstrucción desde la bitácora FALLÓ |
| `backup_*`, `main_pre_restore_*` | copias históricas con credenciales | — | no viajan | EXCLUIDO | son copias; no se restauran |
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

**Producción.** Con esto, un lote de producción ya no sale INCOMPLETO por diseño, pero
**nada se ejecutó allí**: ni el SQL ni el handler. Empaquetar para producción sigue exigiendo
la decisión de identidad con su dueño, además de `RESPALDO_PERMITIR_PRODUCCION=si` y
`RESPALDO_MODO_IDENTIDAD=legacy`.

## 2 · Snapshot del runtime real

- **RPC exacta:** `POST /rest/v1/rpc/respaldo_snapshot`. En la versión preparada
  (`sql/respaldo/snapshot-consistente.sql`), una función plpgsql **STABLE** devuelve las filas
  de `calendario_data` (incluidas `main` y `pins`), su conteo, `modo_identidad` y las
  identidades de la bóveda si existe. Una función STABLE ejecuta todas sus consultas, también
  las de EXECUTE, con la instantánea de la sentencia que la invoca.
- **Portable.** La versión anterior era `language sql` y nombraba `sec_identidad_alias`: en un
  origen sin bóveda no se podía crear. Ahora la bóveda se consulta con SQL dinámico solo si
  existe.
- **El handler no hace otra lectura de datos.** Las identidades ya no vienen de
  `respaldo_identidades`, que es otra transacción.
- **Probado en PostgreSQL 17 local desechable** (`scripts/respaldo/prueba-snapshot-portable-local.mjs`,
  2026-09-10): 21 PASS.
  - sin bóveda se crea y declara `legacy`; la forma anterior no se puede crear (contraprueba);
  - bóveda a medias, sin alias y con alias; solo cuentan alias vigentes, de
    `calendario_data_main` y de identidades activas;
  - `anon` y `authenticated` denegados por privilegio efectivo y por llamada real;
    `service_role` permitido; STABLE, SECURITY DEFINER, `search_path` fijo, una sola versión;
  - decisión del handler sobre las salidas reales;
  - consistencia: un escritor cambia dos filas y un alias en una transacción; 200 snapshots,
    0 inconsistentes. Contraprueba con lecturas separadas: 37 de 200 a caballo.
- **Staging:** privilegios medidos el 2026-09-10 sobre la versión anterior (`anon` no,
  `authenticated` no, `service_role` sí). **El SQL nuevo NO está aplicado.** Falta
  `prueba-snapshot-consistencia.mjs` contra staging y la llamada con token autenticado.

## 3 · Restauración aplicada y verificación de credencial

- La reconstrucción usa solo el lote (`src/data/reconstruirDesdeLote.js`): vincula
  credencial y usuario por `llave_hash`, sin la bóveda original, en los dos modos.
- El script `scripts/respaldo/restauracion-aplicada.mjs` escribe en `restauracion_<lote>`,
  un esquema sin permisos de API. Relee lo escrito y verifica:
  - recursos y Tareas;
  - usuarios y desactivados;
  - autorización;
  - modo de identidad y UUID (comparados con la bóveda solo si existe);
  - `_h`, `_hist` y `_tel`; huérfanas no aplicadas; marcas de reemisión vencidas;
  - relaciones `ctId`.
- **Verificación de credencial, no login.** `src/data/verificacionCredencialLegacy.js` replica
  en Node la decisión de acceso de App.jsx y se aplica a `main` y `pins` releídos del destino.
  `qa-respaldo-login-legacy` falla si App.jsx cambia alguna de las 13 reglas copiadas. La
  réplica cubre la ruta sin guardia, que es la vigente (`REACT_APP_USE_GUARD` apagado).
- **Login real por la app contra lo restaurado: NO EJERCIDO.** La app lee `main` y `pins` del
  origen (`SUPA_URL`). El script lo informa en una línea propia y nunca lo cuenta como PASS.
- **Verificación positiva.** `scripts/respaldo/fixture-restauracion.mjs` revisa primero si
  sirve el usuario sintético existente. Si no sirve, el fixture adicional autorizado se enrola
  con el dueño de identidad. Luego el script lo agrega al padrón y a `pins` sin PIN en claro,
  con el PIN custodiado en el archivo local excluido de git. `--desactivar` permite probar el
  caso de un desactivado.
- B pasa a `credencial-v3`. Un lote anterior no trae marcas de reemisión ni huérfanas: el
  script lo rechaza y hay que generar uno nuevo.
- **Estado: PROBADO LOCAL la lógica; restauración aplicada NO EJECUTADA en staging.**
