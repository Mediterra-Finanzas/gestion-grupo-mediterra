# Aplicar la conciliación aprobada sin sobrescribir producción

> **Estado: script asistido implementado y probado SOLO con datos de prueba**, en un
> Postgres 16 + PostgREST 12 locales. **No se ha ejecutado contra producción.** El
> trigger de versión y los sellos son **propuestas no aplicadas**.
> - El script rechaza cualquier destino que no sea local (`127.0.0.1` / `localhost`) y, en particular, `*.supabase.co`.
> - Habilitar producción requiere cambiar el código, con autorización explícita.
> - El PR #43 sigue en borrador, sin autorización de merge ni de escritura en producción.

## El riesgo que se evita

Entre la descarga del respaldo y la aplicación, en producción se siguen registrando pagos, nóminas y valores manuales.

- Restaurar el respaldo conciliado, aunque sea solo la fila `finanzas`, **borraría todo lo ocurrido después**.
- El botón **"📤 Restaurar"** de la app hace exactamente eso. **No se usa para esto.**

## Principio

Se aplican **operaciones**, no filas. Cada operación del archivo exportado se comprueba contra el estado **vigente**, leído en el momento.

- Se aplica solo si el dato que toca sigue como en el respaldo (su "antes").
- Todo lo demás de la fila se conserva tal como está en producción.

## Cómo se usa (`scripts/conciliacion/aplicar.mjs`)

```bash
# 1) Ensayo: lee el estado actual, clasifica cada operación. NO escribe.
node scripts/conciliacion/aplicar.mjs ensayo --resultado conciliacion_creditos_X.json \
  --destino http://127.0.0.1:PUERTO --salida carpeta
#    → ensayo_<sello>.txt (informe), ensayo_<sello>.json, decisiones_plantilla.json

# 2) Revisar el informe y completar decisiones_plantilla.json (guardarlo como decisiones.json):
#    · "aprobadas": dejar SOLO las operaciones aprobadas
#    · "duplicados": cada posible duplicado → decision "aplicar" u "omitir" + motivo
#    · registrar la aprobación con aprobadoPor y fechaAprobacion (ver "Aprobación registrada")

# 3) Aplicar lo aprobado (relee y reclasifica TODO de nuevo antes de escribir)
node scripts/conciliacion/aplicar.mjs aplicar --resultado conciliacion_creditos_X.json \
  --decisiones decisiones.json --destino http://127.0.0.1:PUERTO --usuario "Nombre" --salida carpeta
#    → auditoria_<sello>.json / .txt + línea en auditoria.jsonl
#    Exige la tabla de sellos (ver más abajo); --sin-sellos si la desactiva a
#    propósito (queda en la auditoría); --sello-dias N (30 por defecto).
#    Con DESTINO_KEY = llave de servicio (los sellos no se pueden crear con la llave pública).
```

Los archivos de salida contienen datos reales y están en `.gitignore`.

## Clases del ensayo

| Clase | Significado | Qué pasa |
|---|---|---|
| **aplicable** | el dato está como en el respaldo | se aplica si está en "aprobadas" |
| **ya aplicada** | producción ya tiene exactamente ese resultado (por ejemplo, un reintento) | se omite |
| **conflicto** | el dato cambió en producción después del respaldo | no se aplica; el informe muestra el valor de producción |
| **posible duplicado** | en producción hay algo posterior que puede ser lo mismo | **decisión individual** obligatoria |
| **no encontrada** | no se ubica el crédito, pago, línea o fila | no se aplica |
| **bloqueada** | depende de una operación que no se aplica | no se aplica; el informe dice de cuál depende |
| **no aplicable** | `QUITADO_*` / `modificar_*` | solo alerta; se revisa a mano |

**Posibles duplicados.** Se aplica uno solo con decisión `"aplicar"` + motivo y si además está en "aprobadas". Con `"omitir"` + motivo queda omitido.
- Una decisión **sin motivo no cuenta**: el duplicado queda pendiente.
- Nada se descarta ni se aplica solo.
- Casos detectados:
  - pago vigente posterior en la misma cuota, o con la misma fecha y monto;
  - saldo informado posterior del mismo acreedor, moneda y fecha;
  - crédito nuevo con la misma huella;
  - cuota ya confirmada impaga con otro registro.

**Dependencias.** Una operación bloqueada arrastra a las que dependen de ella, aunque estén en otra fila.
- Movimientos de un crédito nuevo → su alta.
- Anular un pago → agregarlo, si el alta está en el mismo archivo.
- Prepago → su pago.
- Pago con origen nómina → vínculo de esa línea (otra fila).
- Entrada de bitácora → la operación que describe.
- Anular un crédito → anular sus pagos.
- Se guardan juntos, todo o nada:
  - decisión sobre valor manual + retiro o cambio del valor del mismo mes;
  - cobertura reemplazada + cobertura nueva.

**Antigüedad del respaldo.** Más de 7 días genera una **advertencia**, no un bloqueo. Aunque el respaldo sea del mismo día, se relee el estado y se comprueba **cada** operación.

**Identidad del crédito.**
- Se busca por `uid`. Si no lo tiene, por la huella entre los créditos sin `uid`, que debe ser única.
- Al aplicar se le fija el `uid` exportado, para que las claves de cuota coincidan.
- Si en producción tiene **otro** `uid` → conflicto.

## Aprobación registrada (no es firma digital)

El archivo de decisiones **no está firmado digitalmente**. Es una **aprobación registrada**:

- `aprobadoPor` y `fechaAprobacion`, escritos en el archivo. No hay criptografía de identidad: cualquiera que edite el archivo puede escribir un nombre.
- Está **amarrado por SHA-256** al resultado que aprueba (`resultadoSha256`). Si el resultado cambia en un byte, el script no aplica nada.
- El SHA-256 del propio archivo de decisiones queda en la auditoría (`aprobacion.sha256`, con la nota "no es firma digital"). Cualquier cambio posterior al archivo se puede detectar comparando ese hash.
- Para que valga como respaldo de quién aprobó, el archivo y su SHA-256 deben quedar también fuera del equipo que ejecuta: correo del CFO o comentario en el PR.

## Control de concurrencia

1. **[Seguro] La escritura es una sola sentencia condicionada**, no "comprobar y luego guardar": `UPDATE … WHERE id = X AND updated_at = V`.
   - Probado con una carrera real: otra transacción bloquea y cambia la fila, nuestra escritura espera y actualiza 0 filas.
2. **[Seguro, según el código] Todos los escritores de la app cambian `updated_at`.** El proxy `/api/db` está **retirado** (responde 410): la app escribe directo a Supabase.
3. **Hueco** (probado): una edición que no cambie `updated_at` no se detecta. Por ejemplo, desde el editor de tablas o el SQL Editor de Supabase. Lo cierra el trigger de versión (siguiente sección).
4. **[Probable]** No tengo acceso a la configuración real de producción: la confirma `verificar-supabase.sql` (solo lectura).

## Trigger de versión (`propuesta-trigger-version.sql`, NO aplicado)

**Qué hace.** La versión la genera la **base** y cambia en **cada** actualización:
- `INSERT` → `clock_timestamp()`.
- `UPDATE` → `greatest(clock_timestamp(), versión anterior + 1 µs)`. Cambia aunque dos escrituras caigan en el mismo microsegundo o el reloj retroceda.
- Se ignora el `updated_at` que mande el navegador. Los upsert (`POST … merge-duplicates`) son `INSERT … ON CONFLICT DO UPDATE` y también pasan por el trigger.

**Alcance.**
- Solo la tabla `calendario_data`, todas sus filas.
- No cambia permisos ni otras tablas.
- No actúa ante un `DELETE`. La app no borra filas.
- **Requisito:** `updated_at` debe ser `timestamp with time zone`, lo que confirma `verificar-supabase.sql`. Si es otro tipo, la propuesta hay que ajustarla.

**Compatibilidad, probada con los módulos REALES de la app** (importados tal cual desde `src/`, con la red redirigida a la base local):

| Guardado de la app | Con el trigger |
|---|---|
| `persistContract` (finanzas, main, pins, allegria, escenarios, tipos de documento de nóminas) | Dos guardados seguidos OK: toma la versión de la respuesta, con microsegundos. Una edición directa posterior hace que su próximo guardado se rechace sin pisar. Dos sesiones sobre una colección se fusionan |
| `friskuHelpers` (maestros, Frisku, rendiciones) | Guardados seguidos OK. Ante una edición ajena, fusiona sin perderla |
| Osiris | Mismo patrón que friskuHelpers (PATCH condicionado y versión de la respuesta). Revisado en el código, no ejecutado: es JSX |
| Upsert sin condición (nóminas, auditoría, respaldo diario, "Restaurar", EEFF) | Se guarda. La versión queda la del servidor; ninguno la usa |
| Tiempo real | Entrega la versión guardada, la del servidor |

**Reversión** (probada): `drop trigger if exists calendario_data_version on public.calendario_data; drop function if exists public.calendario_data_version();`.
- Después, la versión vuelve a ser la del navegador y el contrato de persistencia sigue funcionando.
- Las versiones ya guardadas quedan como están y siguen sirviendo.

## Sesiones con datos antiguos: sellos (`propuesta-sellos.sql`, NO aplicado)

**El riesgo.** Una pestaña abierta antes de aplicar puede guardar después y deshacer lo aplicado.
- Las **nóminas** se guardan hoy con upsert **sin condición**: se escribe la fila completa y gana el último.
- Cerrar la app y repetir el ensayo reduce el riesgo, pero no lo impide.

**La protección.**
- Por cada operación aplicada, el script registra un **sello**: fila, ruta SQL/JSON y una condición: "existe", "igual a" o "ausente".
- Un trigger **rechaza cualquier escritura que deshaga un sello vigente**, sea upsert o PATCH. Devuelve HTTP 400 `MEDITERRA_SELLO`.
- Todo lo demás de la fila se guarda normal.
- Funciona con la app **tal como está**, incluidas pestañas con código viejo: no requiere cambios en el navegador.

**Cómo se usa en la aplicación.**
1. Los sellos se crean **antes** de escribir. Son inertes hasta que la fila tiene el dato, así que no hay una ventana entre escribir y proteger.
2. Si la aplicación se detiene, los sellos de lo no escrito se **levantan**.
3. Un reintento los **reactiva**.
4. Vigencia: 30 días, o hasta levantarlos con la consulta documentada, que registra quién y por qué.
   **El vencimiento NO resuelve la concurrencia.** Cuando un sello vence o se levanta, una pestaña que siga abierta con datos anteriores a la conciliación **puede volver a sobrescribir lo conciliado**, porque las nóminas se siguen guardando sin condición. Los 30 días solo acotan cuánto tiempo se bloquean los cambios legítimos; no garantizan que ya no queden sesiones antiguas. Cerrar ese riesgo de forma permanente requiere que la propia escritura de nóminas sea condicionada a la versión leída, como ya lo es la de Finanzas. Es un cambio en la app que **no** está hecho ni autorizado. Los sellos quedan en evaluación; la decisión depende del resultado de `verificar-supabase.sql`.

**Probado:**

| Caso | Resultado |
|---|---|
| Pestaña antigua de nóminas guarda con una edición suya, con el mismo request que `dbSaveNominas` | **Rechazada** (400); los vínculos aplicados siguen |
| Sesión al día (recargada) guarda en nóminas | Normal |
| Pestaña antigua de Finanzas con el contrato real | Conflicto: no pisa (protección propia de la app) |
| Upsert con datos antiguos de Finanzas (como "Restaurar") | **Rechazado** por sello |
| Anular un pago aplicado por la conciliación, desde una sesión al día | **Permitido**: el sello exige que el pago exista, no que esté vigente |
| La llave pública (anon) crea o levanta sellos | No puede (401). Solo la llave de servicio |
| Sellos levantados | La pestaña antigua vuelve a pisar: el sello es la protección |

**Límites.**
- Mientras un sello está vigente, un cambio **legítimo** que deshaga ese dato también se rechaza. Por ejemplo, desvincular una línea vinculada por la conciliación: primero hay que levantar el sello.
- **Corregido en la app (ver "Guardado de Nóminas" abajo):** antes el guardado de nóminas era "dispara y olvida" y una pestaña rechazada no se enteraba. Ahora comprueba la respuesta: muestra que no se guardó, conserva la edición y explica que hace falta recargar.
- Con RLS desactivado en `calendario_data`, los sellos protegen contra **accidentes** (sesiones antiguas), no contra alguien que actúe de mala fe con la llave pública sobre la tabla de datos.

## Guardado de Nóminas: la app comprueba la respuesta del servidor

Corregido en `src/FinanzasModule.jsx`, en la rama del PR y sin merge:

- **`dbSaveNominas`** devuelve el resultado real de cada fila (`ok`, `motivo`, `status`, empresas guardadas y fallidas), no un `true/false` que antes se ignoraba. Motivos:
  - `sello`: la base rechazó deshacer un dato protegido; los datos están desactualizados;
  - `http`: código de error del servidor;
  - `red`: sin respuesta.
- **Si el servidor no confirma:**
  - aviso rojo arriba de Nóminas, en la lista y en la nómina abierta, con qué pasó y qué hacer;
  - la edición **se conserva** en pantalla;
  - una **copia** de las nóminas cambiadas queda en este navegador;
  - **"Descargar mis cambios (JSON)"** para revisarlas o recuperarlas.
- **Cuándo recargar**, según el motivo:

  | Motivo | ¿Recargar? | Qué hacer |
  |---|---|---|
  | Sello | **Sí** | Reintentar no sirve: descargar, recargar y volver a aplicar sobre la versión actual |
  | Red | **No** | Reintentar cuando vuelva la conexión |
  | 5xx | **No** | Reintentar |
  | 401/403 | Sí | Descargar antes de volver a ingresar |

- **Antes de perder cambios:**
  - "Recargar datos del servidor…" pide confirmación y dice cuántas nóminas se pierden de la pantalla (la copia sigue disponible);
  - cerrar la pestaña con cambios sin guardar pide confirmación del navegador;
  - los refrescos automáticos (cada 30 s y al volver a la pestaña) **no reemplazan** la lista mientras haya cambios sin confirmar. Antes la reemplazaban y la edición se perdía.
- **La copia no se re-aplica sola**: re-aplicar datos viejos es lo que pisa a otros. Al abrir Nóminas, si existe, se avisa con "Descargar" y "Eliminar la copia".
- **Transiciones** (marcar preparada, enviar a revisión, V°B°, aprobar, devolver):
  - se guardan **antes** de notificar;
  - si el servidor no confirma, la nómina vuelve en pantalla a su estado anterior, **no se envía ningún correo** ni se audita el cambio, y el aviso lo dice;
  - el botón queda deshabilitado mientras guarda.
  - Antes, los correos de "APROBADA" se enviaban aunque el guardado fallara.
- **"Aplazar"** ya esperaba el guardado y revertía; ahora además muestra el motivo.

Prueba en navegador (app real, Supabase falso aislado, datos de prueba): `OUT_DIR=/tmp/ng node scripts/e2e/nomina-guardado.mjs` → **27/27 OK**.
- Casos: rechazo por sello, error de red, HTTP 500, y aprobación CFO con red caída y con 500.
- Para cada caso comprueba: aviso, edición conservada, servidor sin cambio, copia local, confirmación al cerrar, refrescos que no pisan, descarga, recarga con advertencia, reintento exitoso y que los 2 correos de aprobación salen solo cuando el servidor confirmó.

## Varias filas: qué pasa si una escritura falla

No hay transacción entre filas. El script escribe **por fases según las dependencias entre filas**: una operación va en la fase posterior a la última fase de aquello de lo que depende en otra fila.

Ejemplo de la prueba: alta de crédito, vínculo de la línea L3 de nómina, pago que sale de L3, y anulación de un pago de nómina con desvínculo de L4. Orden resultante:

1. **finanzas:** alta del crédito sin el pago de L3; anulación del pago de L4; resto.
2. **nómina:** vínculo L1.
3. **nómina:** vínculo L3 y desvínculo de L4.
4. **finanzas:** pago de L3.

- Cada escritura va condicionada a la versión que devolvió la anterior de esa fila.
- Si un crédito nuevo trae dentro un pago con origen en nómina, el pago se separa del alta y se escribe después del vínculo.
- Antes de escribir, el script comprueba que **tras cada escritura** no aparezca ninguna inconsistencia nómina↔crédito nueva. Si aparecería, no aplica nada.

| Falla probada | Estado intermedio | Reintento |
|---|---|---|
| **Finanzas se guarda y la nómina falla** (503 simulado) | Crédito nuevo **sin** el pago de L3; pago de L4 anulado con L4 aún vinculada (válido: línea vinculada sin pago vigente). 0 inconsistencias. Sellos de lo no escrito, levantados | Relee y escribe nómina y luego el pago. Pago de L3 **una sola vez**, L3 vinculada, L4 desvinculada, 0 inconsistencias |
| Falla la última escritura (pago de L3) | L3 vinculada sin pago (válido: vincular no paga). 0 inconsistencias | 1 escritura; un tercer intento no escribe nada |
| Orden ingenuo (toda finanzas primero) y falla la nómina | **Inconsistente**: pago vigente de nómina sin vínculo en su línea | — |

Inconsistencias que se verifican (`invariantesNominaCredito`):
- un pago vigente con origen `nomina:<id>:<línea>` exige esa línea vinculada al mismo crédito y cuota;
- una línea vinculada exige que el crédito exista.

Las que ya existan en producción se informan aparte y no bloquean.

## Verificación posterior y auditoría

- **Relectura:**
  - cada operación aplicada debe quedar "ya aplicada";
  - la última escritura de cada fila debe coincidir con lo que hay;
  - no puede aparecer ninguna inconsistencia nómina↔crédito nueva.
- **Antes de escribir** se comprueba que en `finanzas` solo cambian rutas de Créditos.
- **Auditoría:**
  - SHA-256 del resultado, de las decisiones y del respaldo;
  - aprobación registrada;
  - versiones leídas y escritas por fase;
  - estado de cada operación;
  - sellos creados y levantados;
  - protección usada;
  - verificación y SHA-256 del registro.

## Prueba (datos de prueba)

```bash
POSTGREST_BIN=/ruta/postgrest PG_BIN=/usr/lib/postgresql/16/bin OUT_DIR=/tmp/conc \
  node scripts/conciliacion/prueba.mjs
```

La prueba levanta, **en local**, Postgres 16 y PostgREST 12 con roles como en Supabase (`anon`, `authenticated`, `service_role`, JWT) y un proxy con el prefijo `/rest/v1`. Las dos propuestas SQL se ejecutan **tal cual**. Resultado: **85/85 OK**, en dos corridas.

- **Ensayo, aplicación, duplicados, dependencias, reintento, concurrencia y carrera real:** igual que antes.
- **T:** trigger de versión con `persistContract` y `friskuHelpers` reales, upsert, dos UPDATE en una transacción y 0 salidas a internet.
- **S:** sellos frente a una pestaña antigua de nóminas y de Finanzas, upsert antiguo, cambio legítimo, permisos y levantamiento.
- **P:** fallas entre filas y reintentos.
- **R:** reversión de ambas propuestas.

Hallazgo aparte, previo e independiente del trigger: la fusión por ítem de la app (`friskuPersistencia.fusionarPorId`) compara objetos **sensible al orden de las claves**, y jsonb las reordena. Ante una edición simultánea del mismo listado puede declarar un conflicto falso. Es seguro (no pisa nada, pide recargar), pero molesto. Queda como tarea separada.

## Antes de usarlo con datos reales (pendiente de tu autorización)

1. Resultado de `verificar-supabase.sql`, que es solo lectura.
2. Decidir el trigger de versión y los sellos. Hoy no están autorizados.
3. Habilitar el destino de producción en el código (hoy bloqueado) y usar la llave de servicio. Ambas cosas requieren tu autorización.
4. Un respaldo nuevo del mismo día.
5. Ensayo → revisión → aprobación registrada → aplicar → ensayo de control.
