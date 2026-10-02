# Retirar el permiso DELETE de la llave pública en `calendario_data`

> **Estado: PROPUESTA, no aplicada.** Requiere autorización explícita del CFO.
> SQL: `supabase/propuesta_quitar_delete_anon.sql`.
> Prueba local: `scripts/seguridad/prueba-quitar-delete-anon.mjs` (17/17 OK con datos de prueba).

## Lo primero que hay que saber

**[Seguro]** Retirar DELETE **no** cierra la escritura abierta. La llave pública (`anon`) seguirá pudiendo:

- **sobrescribir** cualquier fila con contenido vacío o falso (UPDATE o upsert), lo que es igual de destructivo;
- **leer** todo, salvo `backup*` y `main_pre_restore*`.

La solución de fondo sigue pendiente (ver "Pendientes operativos" en `CLAUDE.md`): que la base exija un usuario autenticado y permisos por usuario.

Esta medida cierra la vía de destrucción **más barata**: hoy **un solo** request con la llave pública borra todas las filas salvo los respaldos (`DELETE …/calendario_data?id=neq.x`). Está comprobado en local con las políticas de producción. Y no tiene costo para la app, que nunca borra filas.

## Estado actual verificado en producción (solo lectura, 2026-10-01/02)

- **RLS activo.** La auditoría de junio (`supabase/AUDITORIA_SEGURIDAD_2026-06.md`) dice "desactivado": está desactualizada en este punto.
- **Políticas:**

| Política | Comando | Roles | Condición |
|---|---|---|---|
| `cd_anon_auth_delete` | DELETE | authenticated, anon | id no empieza con `backup` ni `main_pre_restore` |
| `cd_anon_auth_insert` | INSERT | authenticated, anon | ídem |
| `cd_anon_auth_select` | SELECT | authenticated, anon | ídem |
| `cd_anon_auth_update` | UPDATE | authenticated, anon | ídem |
| `cd_service_all` | ALL | service_role | sin restricción |

## El cambio

En una sola transacción que **se aborta sola** si el estado no es el verificado:

1. `drop policy cd_anon_auth_delete`: sin una política que lo permita, RLS deniega el borrado.
2. `revoke delete, truncate … from anon, authenticated`: segunda barrera por si RLS se desactiva algún día, como encontró la auditoría de junio. TRUNCATE no pasa por RLS, por eso también se retira.
3. Comprobación interna antes del `commit`. Si `anon` o `authenticated` siguen pudiendo borrar (por ejemplo, heredado de otro rol o de `PUBLIC`), o si perdieron SELECT, INSERT o UPDATE, se aborta.

## Antes de aplicarlo: qué más podría seguir habilitando el borrado

La PARTE 0 del archivo son consultas de **solo lectura**. Hay que guardar sus resultados antes de aplicar.

| Consulta | Qué descarta |
|---|---|
| 0.1 Políticas completas | Otra política de borrado. Además, es la foto exacta para revertir |
| 0.2 Permisos de tabla por rol | DELETE o TRUNCATE concedidos a otro rol o a `PUBLIC` |
| 0.3 Pertenencia de `anon` y `authenticated` a otros roles, `bypassrls` | Permisos heredados |
| 0.4 Vistas sobre `calendario_data` | Una vista actualizable que permita borrar a través de ella |
| 0.5 Funciones que `anon` puede ejecutar y que mencionan la tabla | Una función que borre en nombre de `anon`. Es solo una **lista de candidatas**: cada una se revisa leyendo su código (0.6). No se usa como confirmación |

## Impacto

**[Seguro, revisado en el código del repositorio]**

| Uso | ¿Afectado? |
|---|---|
| Guardados de la app (PATCH condicionado, upsert de nóminas, creación de filas) | No. Probado en local |
| Lecturas y "💾 Respaldo" (descarga) | No (es SELECT) |
| "📤 Restaurar" | No: es upsert (INSERT/UPDATE), no borra |
| Respaldo automático diario y su retención | Suspendidos desde el hotfix A (2026-09-03, `BACKUP_AUTOMATICO_SUSPENDIDO = true`). La retención borraba filas `backup_*`, que `anon` ya no podía tocar por la política actual. Un generador futuro del lado del servidor usaría la llave de servicio, que no cambia |
| Llave de servicio (servidor, funciones, panel de Supabase) | No: `cd_service_all` se mantiene |
| `scripts/test-frisku-concurrencia-staging.mjs` (borra una fila de prueba) | Solo corre contra staging; no se ve afectado mientras staging no reciba el cambio |
| Otros `DELETE` del código (contabilidad, ANF, Storage) | Son otras tablas o archivos: no cambian |

## Verificación después de aplicar

1. **PARTE 2 del archivo** (solo lectura):
   - `anon_delete`, `auth_delete`, `anon_truncate` y `auth_truncate` deben dar `false`;
   - `anon_select`, `anon_insert` y `anon_update` deben dar `true`;
   - deben quedar 4 políticas.
2. **Uso normal de la app:** editar una nómina, guardar el flujo, registrar algo en Créditos. Todo debe guardar igual que antes.
3. **Opcional, prueba directa sin riesgo:** un DELETE con la llave pública sobre un id que **no existe** (`id=eq.__prueba_inexistente__`) debe responder **401 "permission denied"**. Al no existir la fila, aunque el cambio no hubiera quedado bien, no se borraría nada.

## Reversión

PARTE 3 del archivo: `grant delete, truncate …` y `create policy cd_anon_auth_delete …` con la misma condición. Se compara antes con lo guardado en 0.1 y 0.2; si `anon` no tenía TRUNCATE, se quita del grant.

Probada en local: la política vuelve idéntica (mismo comando, roles y condición) y la llave pública vuelve a poder borrar.

## Prueba local

`POSTGREST_BIN=/ruta/postgrest node scripts/seguridad/prueba-quitar-delete-anon.mjs`

Usa Postgres 16 y PostgREST 12 locales, con los roles y permisos por defecto de Supabase y las 5 políticas tal como se leyeron en producción. Ejecuta las partes 0, 1, 2 y 3 **del archivo tal cual**.

- **Antes:** un DELETE masivo con `anon` borra todo salvo los respaldos.
- **PARTE 1 con una política distinta a la verificada:** se aborta y no deja nada a medias.
- **Después de aplicar:**
  - el DELETE con `anon` falla con "permission denied", tanto el individual como el masivo;
  - PATCH condicionado, upsert, creación de filas y SELECT siguen funcionando;
  - la llave de servicio sí puede borrar.
- **Reversión:** restaura el estado anterior.
