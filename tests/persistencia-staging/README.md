# Certificación en STAGING — contrato de persistencia (P0-1 · F0-C)

Scripts para que **el operador** ejerza la capability real
(`src/persistencia/persistContract.js`) contra el backend de **staging**, con
`fetch` real y las credenciales inyectadas por variables de entorno. Prueban el
ciclo optimista real y la **preservación de la codificación física** (F0-C) que hace
seguro el rollback del frontend y la convivencia con pestañas del bundle viejo.

> Estos scripts **no** se corren en la sesión del agente (sin red, sin llaves). El
> agente solo los autoría y verifica su sintaxis con `node --check`.

## Garantías de seguridad (embebidas en cada script)

1. **Tripwire de entorno.** Cada script aborta con **HARD STOP** y `exit ≠ 0` **antes
   de emitir cualquier request** si `SUPA_URL` no contiene el ref de staging
   `nlvfjpwiecgrosjnwwik`. Imposible pegarle a producción por error.
2. **Llaves solo por ENV.** `SUPA_URL` / `SUPA_KEY` se leen de `process.env`. **Nunca**
   se escriben en el repo, ni en el chat, ni se hardcodean.
3. **Solo filas fixture.** Se crean/leen/borran únicamente filas con id
   `_f0_rt_probe_*`. **Jamás** se toca una fila real ni financiera.
4. **Limpieza garantizada.** Al terminar (aunque un caso falle o lance) cada script
   borra sus fixtures: por id exacto de lo creado **y** un barrido
   `id=like._f0_rt_probe_*` como cinturón.

## Requisitos

- Node ≥ 18 (usa `fetch` global).
- Credenciales de **staging** (URL + una anon/service key con permiso de escritura en
  `calendario_data`). El operador las tiene; **no** las pidas por chat ni las pegues acá.

## Cómo correr

Exporta las variables en TU shell (no en el repo) y ejecuta los tres scripts. La URL
debe ser la de staging (contiene `nlvfjpwiecgrosjnwwik`), o el tripwire aborta.

### PowerShell (Windows)

```powershell
$env:SUPA_URL = "https://nlvfjpwiecgrosjnwwik.supabase.co"
$env:SUPA_KEY = "<PEGA_AQUÍ_LA_KEY_DE_STAGING_EN_TU_SHELL>"

node tests/persistencia-staging/rt.mjs
node tests/persistencia-staging/persist-real.mjs
node tests/persistencia-staging/stale-compat.mjs

# Al terminar, limpia las variables de la sesión:
Remove-Item Env:SUPA_URL, Env:SUPA_KEY
```

### bash / zsh (macOS/Linux)

```bash
export SUPA_URL="https://nlvfjpwiecgrosjnwwik.supabase.co"
export SUPA_KEY="<PEGA_AQUÍ_LA_KEY_DE_STAGING_EN_TU_SHELL>"

node tests/persistencia-staging/rt.mjs
node tests/persistencia-staging/persist-real.mjs
node tests/persistencia-staging/stale-compat.mjs

unset SUPA_URL SUPA_KEY
```

> Para pasar la key por una sola invocación sin exportarla a toda la sesión:
> `SUPA_URL=... SUPA_KEY=... node tests/persistencia-staging/rt.mjs` (bash), o en
> PowerShell asignar `$env:` y luego `Remove-Item Env:` como arriba.

## Qué prueba cada script

### `rt.mjs` — Round-Trip (RT-01..08)
Sobre una fila fixture string-encoded:
- **RT-01** read + `updated_at` V1.
- **RT-02** PATCH condicional `updated_at=eq.V1` + `return=representation` → exactamente 1 fila.
- **RT-03** la respuesta trae versión nueva V2 (≠ V1).
- **RT-04** reusar V1 (escritor viejo) → 0 filas → la capability devuelve **CONFLICT**; V2 intacto.
- **RT-05** usar V2 → escritura **PASS**.
- **RT-06** codificación idéntica al original tras los saves (sigue string-encoded).
- **RT-07** 401/403 real (key inválida deliberada) → **nunca** guardado; fila intacta.
- **RT-08** 2xx sin representación válida → **SIN_CONFIRMACION** (respuesta PATCH recortada sobre transporte real).

### `persist-real.mjs` — subset real de PERSIST-01..15
Dos "pestañas" = dos instancias de la capability sobre la misma fila fixture:
- **PR-A** dos escritores/celdas distintas → ambas sobreviven (recompute).
- **PR-B** conflicto no fusionable (valor, versión vieja) → CONFLICT sin clobber.
- **PR-C** save lento + 2ª edición → coalescencia sin pérdida.
- **PR-D** 401 real → no guardado.
- **PR-E** caída de red (fetch que lanza) → RED + dirty, fila intacta.
- **PR-F** ventana post-carga: sin falso-éxito inmediato tras `load`.
- **PR-G** codificación preservada tras varios saves.
- **PR-H** reload tras ACK → una instancia nueva ve el dato confirmado.

Se mockea **solo** lo que no puede tocar un backend real: la caída de red (fetch que
lanza). El 401 es real (key inválida).

### `stale-compat.mjs` — compatibilidad NEW ↔ OLD (SC-01..03)
- **SC-01** NEW escribe → OLD lee (`JSON.parse` crudo) sin lanzar.
- **SC-02** OLD escribe (string-encoded) → NEW (`capability.load`) lee correcto.
- **SC-03** NEW escribe → **rollback** a OLD → OLD sigue cargando sin lanzar.

## Resultado esperado

Cada script imprime una grilla `✓/✗` y termina con:

```
✅ RT-01..08 verde contra staging.
✅ subset PERSIST real verde contra staging.
✅ compatibilidad bidireccional NEW ↔ OLD verde contra staging.
```

y `exit 0`. **Todo debe salir verde.** Cualquier `✗` (o `exit ≠ 0`) es un
bloqueante de go-live: NO promover el frontend. En todos los casos las fixtures
`_f0_rt_probe_*` quedan borradas al finalizar.
