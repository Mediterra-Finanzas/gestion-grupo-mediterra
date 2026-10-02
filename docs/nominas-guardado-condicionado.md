# Nóminas: guardado condicionado a la versión leída

> **Estado (2026-10-02): IMPLEMENTADO EN LA RAMA `claude/laughing-dijkstra-8665xz`, sin merge ni despliegue.**
> Probado solo con datos de prueba (Supabase falso aislado). No requiere cambios en la base:
> funciona con la configuración de producción verificada el 2026-10-01/02 (`updated_at timestamptz`,
> `value jsonb`, sin reglas, políticas que permiten leer y actualizar `nominas_*`).
> **Bloqueante antes de desplegar:** sesiones abiertas con el código anterior siguen escribiendo sin
> condición hasta recargar (ver punto 10). No está resuelto.

## Por qué

Lo que hace hoy el código de producción (**[Seguro]**, revisado en `src/FinanzasModule.jsx`; los tiempos y tamaños son los de producción):

| # | Problema | Consecuencia |
|---|---|---|
| 1 | Cada fila `nominas_<empresa>` se guarda con **upsert sin condición**: gana el último | Una pestaña con datos antiguos pisa el trabajo de otros sin que nadie se entere |
| 2 | Cada guardado reescribe **las 9 empresas** que el usuario tiene cargadas, aunque haya editado una | En producción las 9 filas tienen la misma hora de guardado (20:24:16.231–.248). Editar una nómina de Osiris pisa también Mediterra, Allpa, etc. con la copia de esa pestaña |
| 3 | **La carga no revisa si el servidor respondió con error** (`dbLoadNominas`, ruta por empresa): un 401/500 se lee como "empresa sin nóminas" | Si el usuario crea una nómina en esa empresa, el guardado reemplaza la fila **completa** con solo la nueva: se pierden las demás. Hoy no hay nada que lo impida |
| 4 | Si falla la consulta "¿ya se migró?" (`dbNominasMigrado`), queda fijo "no migrado" toda la sesión | La app carga y guarda en la fila antigua `nominas`, que nadie más lee: muestra datos viejos y guarda donde no corresponde. Con un usuario de empresas restringidas, además reescribe esa fila solo con sus empresas |
| 5 | El guardado al cerrar la pestaña usa `keepalive`, que el navegador rechaza por encima de 64 KiB | 6 de las 9 filas pesan más (hasta 464 KB): una edición en los 0,8 s previos a cerrar se pierde en silencio |

La rama ya corrige que la pantalla **finja éxito** (aviso, copia local, refrescos que no pisan, confirmación al cerrar). Lo que falta es que el servidor **rechace** una escritura basada en datos viejos, en vez de aceptarla.

## Principios

- Nunca escribir una fila sin la versión con la que se leyó (`updated_at`), salvo al crearla, y en ese caso con una creación que falla si la fila ya existe.
- Escribir **solo** las filas que cambiaron.
- Ante un conflicto, **combinar** automáticamente lo que no choca. Lo que choca **no se escribe**, se informa, y la edición local se conserva.
- Mismo contrato que Finanzas: `persistContract` (escritura condicionada, confirmación del servidor, conservar el formato texto de cada fila). El formato **no cambia**: las filas siguen siendo texto JSON dentro del `jsonb`, compatibles con pestañas que tengan el código anterior.

## Diseño

### 1. Estado por fila

Por cada fila `nominas_<empresa>` que el usuario puede ver, la app guarda:

- `version`: el `updated_at` leído o devuelto por el último guardado confirmado;
- `base`: el contenido tal como vino del servidor (`{nominas:[…], empresa}`);
- `existe`: si la fila existía al leer.

El estado se actualiza en **cada** lectura que se aplica (carga inicial, refresco de 30 s, volver a la pestaña, "Recargar") y en cada guardado confirmado.

### 2. Carga (corrige los problemas 3 y 4)

- Cada lectura revisa `res.ok`. Un error HTTP o de red **lanza excepción** (regla 9): no se habilita el guardado y se muestra "no se pudo cargar".
- Se lee `value,updated_at` (hoy solo `value`).
- `dbNominasMigrado`: si la consulta falla, **lanza** en vez de fijar "no migrado". Con `nominas_v2_done` presente en producción, la ruta de la fila antigua `nominas` deja de usarse para guardar. La fila antigua **no se borra ni se modifica**: queda como archivo histórico.

### 3. Qué se escribe (corrige el problema 2)

Al guardar, se agrupan las nóminas locales por empresa y se compara cada grupo con la `base` de su fila. **Solo** las filas distintas se escriben. Editar una nómina de Osiris escribe solo `nominas_osiris`.

### 4. Escritura condicionada

`PATCH …/calendario_data?id=eq.nominas_<empresa>&updated_at=eq.<version>` con `Prefer: return=representation`:

| Respuesta | Significado | Qué hace |
|---|---|---|
| 1 fila | Guardado | La nueva versión es la de la respuesta, y `base` = lo escrito |
| 0 filas | **Conflicto**: alguien guardó esa fila después de que la leímos | Ver punto 5 |
| HTTP error | 400 (incluye un eventual rechazo por sello), 401/403, 5xx | Aviso con el motivo (ya implementado en la rama); la edición se conserva |
| Sin respuesta | Red | Igual: aviso y reintento (punto 7) |

### 5. Conflictos: combinar lo que no choca

Ante 0 filas, la app **relee** la fila y hace una fusión a tres bandas entre `base` (lo que leí), `mío` (lo local) y `servidor` (lo recién leído):

1. **Por nómina** (clave `id`):
   - si solo yo cambié una nómina, va la mía;
   - si solo el otro la cambió, va la del servidor;
   - las nóminas nuevas de ambos se suman.
2. **Dentro de una misma nómina cambiada por los dos:**
   - los campos de la cabecera (estado, aprobaciones, fecha, tc, notas…) se combinan **campo a campo**;
   - las líneas (`items`) se combinan **por id**.
   - Solo es conflicto real si ambos cambiaron **el mismo campo** o **la misma línea** con valores distintos.
3. **Sin conflicto real:** se reintenta el PATCH con la versión recién leída, hasta 2 veces. Si en ese lapso alguien vuelve a guardar, se repite.
4. **Con conflicto real:** **no se escribe esa fila**. El aviso lista las nóminas (empresa, semana, N°) y los campos o líneas en conflicto con ambos valores. La edición local se conserva y queda en la copia del navegador. Para continuar: descargar los cambios, recargar y volver a aplicar lo propio.

**Reglas que no se combinan automáticamente** (siempre son conflicto real):

- **Transiciones de estado:** si el otro cambió el estado de la nómina (por ejemplo, la aprobó) y yo también, o yo edité líneas de una nómina que el otro aprobó.
- **Una línea anulada** (`estadoLinea: "inactiva"`) por uno y editada por el otro.

Un "borrado" en la app es siempre una anulación (nunca borra), así que no hay borrados que combinar.

Las filas de nóminas se guardan como texto, así que el orden de las claves se conserva tal como se escribió. No les afecta el falso conflicto por orden de claves que tiene la fusión de las filas guardadas como objeto (hallazgo aparte).

### 6. Filas nuevas (empresa sin fila todavía)

Si la fila no existía al leer, se crea con `POST` **sin** `merge-duplicates`: una inserción simple que **falla con 409** si otra pestaña la creó en el intervalo. Ante 409 se relee y se sigue como conflicto (punto 5), con `base` = fila vacía.

Hoy, en cambio, la creación es un upsert que reemplaza lo que haya.

Un usuario con empresas restringidas solo lee y escribe sus filas, igual que hoy.

### 7. Reintentos e idempotencia

- **Cola por fila.** Dos guardados de la misma fila desde la misma pestaña no corren en paralelo. Si llega una edición nueva mientras se guarda, se guarda después con la versión recién confirmada (coalescencia, como en `persistContract`).
- **Guardado parcial entre empresas:**
  - cada fila tiene su propio resultado;
  - las confirmadas actualizan su versión y salen de "pendientes";
  - las fallidas quedan pendientes;
  - "Reintentar" envía **solo** las pendientes, cada una con su versión.
- **Respuesta perdida** (el servidor guardó pero la respuesta no llegó):
  - el reintento con la versión vieja da 0 filas;
  - al releer, el contenido del servidor es **igual** a lo que quería guardar, y se toma como confirmado;
  - no se duplica nada (lo mismo que hace `persistContract`).
- **Transiciones de estado:**
  - se guardan antes de notificar (ya implementado en la rama);
  - con este diseño, una aprobación sobre datos viejos da conflicto, no pisa;
  - no se envía ningún correo hasta confirmar.

### 8. Ediciones locales (lo ya implementado en la rama, se mantiene)

- Aviso con el motivo y si hay que recargar.
- Copia en el navegador; no se re-aplica sola.
- "Descargar mis cambios".
- "Recargar" con advertencia.
- Los refrescos de 30 s y al volver a la pestaña no pisan cambios sin confirmar.
- Cerrar la pestaña pide confirmación.
- **Nuevo:** el aviso de conflicto muestra el detalle de qué chocó.
- **Nuevo:** con cambios confirmados, el refresco de 30 s actualiza versión y base de **todas** las filas aunque no haya cambiado ningún estado. Hoy solo actualiza si cambia un estado o una aprobación, así que una pestaña abierta seguía con datos viejos de líneas y vínculos.

### 9. Cerrar la pestaña (problema 5)

- No se usa `keepalive` para filas de más de ~60 KB: el navegador las rechaza igual.
- Con cambios pendientes, el navegador pide confirmación (ya implementado) y la copia local queda guardada.
- Al volver a abrir, si la copia coincide con lo que hay en el servidor (el guardado sí alcanzó a llegar), se elimina sola. Si no, se ofrece para descargar.

### 10. Pestañas con el código anterior (periodo de transición)

**[Seguro]** Una pestaña que siga con el código de hoy guardará sin condición hasta que se recargue. La app ya tiene un detector de versión nueva (`checkNewDeploy`, revisa cada 60 s):

- recarga sola las pestañas ocultas;
- muestra un aviso en las visibles.

**Riesgo residual:** una pestaña visible que ignore el aviso y edite antes de recargar. Mitigaciones:

- desplegar en un horario sin uso (no hay cambios de base de datos que coordinar);
- pedir al equipo que recargue.

Si se quisiera **imponer** el guardado condicionado desde la base, haría falta una regla del lado del servidor (por ejemplo, rechazar upsert sin condición en `nominas_*`). Es una decisión aparte, no incluida aquí.

## Lo que no cambia

- La estructura de los datos: mismas filas, formato texto, campos y estados.
- El flujo de aprobación, los correos, el expediente y los respaldos.
- Las pestañas Finanzas, Créditos y el resto de los módulos.
- No requiere triggers, cambios de permisos ni migraciones.

## Casos de prueba (diseño original)

| Caso | Esperado |
|---|---|
| Dos pestañas editan **nóminas distintas** de la misma empresa | Se guardan ambas (combinación automática) |
| Dos pestañas editan **líneas distintas** de la misma nómina | Se guardan ambas |
| Dos pestañas editan **la misma línea** | La segunda no escribe; aviso con ambos valores; su edición queda en pantalla y en la copia |
| Una aprueba y la otra edita líneas de esa nómina | Conflicto; no se pisa la aprobación |
| Editar una nómina de Osiris | Se escribe **solo** `nominas_osiris` (se cuentan los requests) |
| Carga con HTTP 500 en una empresa | No se habilita el guardado; aviso "no se pudo cargar" |
| Falla la consulta "¿ya se migró?" | No se carga ni se escribe la fila antigua `nominas` |
| Empresa nueva creada a la vez por dos pestañas | La segunda recibe 409, relee y combina |
| Respuesta perdida después de guardar | El reintento no duplica |
| Falla una empresa y otras no | Solo las fallidas quedan pendientes; el reintento envía solo esas |
| Transición con conflicto | No cambia el estado ni envía correos |
| Pestaña con el código anterior (upsert sin condición) | Documentado como riesgo de transición. Una vez recargada, queda condicionada |
| Regresión | `nomina-guardado.mjs`, `nomina-credito.mjs`, jest completo, build con `CI=true` |

## Implementación (rama, 2026-10-02)

| Pieza | Dónde |
|---|---|
| Fusión a tres bandas, plan por fila, escritura con reintento y verificación | `src/nominasPersistencia.js` (puro) — `fusionarNominas`, `planGuardado`, `guardarFila`, `resumirGuardado` |
| Pruebas unitarias | `node src/nominasPersistencia.test.mjs` |
| Transporte (GET / PATCH condicionado / POST sin `merge-duplicates`) | `transporteNominas` en `src/FinanzasModule.jsx` |
| Carga por empresa: `ok` / `inexistente` (confirmada) / `error` | `dbLoadNominas`; `dbNominasMigrado` lanza error en vez de suponer "no migrado" |
| Guardado, conflictos, resolución explícita, reintento de carga | `ejecutarGuardado`, `resolverConflicto`, `reintentarCarga` en `NominasModule` |
| Refresco que no borra lo ya cargado si una empresa falla al releer | `aplicarRefresco` |
| Pruebas en navegador | `scripts/e2e/nomina-condicionado.mjs` (dos navegadores sobre el mismo Supabase falso) |

Reglas acordadas con el CFO (2026-10-02):

- Se combinan cambios **independientes**: campos distintos de la cabecera y líneas distintas (por id).
- Requieren **resolución explícita** ("Usar la versión del servidor" / "Mantener la mía", ambas con confirmación que lista lo afectado): el mismo campo, la misma línea, una transición de estado y una anulación (nómina o línea) cuando el otro lado también cambió esa nómina. La misma transición hecha por ambos lados no es conflicto (el historial no se duplica).
- **Carga por empresa:** si `nominas_<empresa>` no se pudo leer, esa empresa no permite crear ni guardar hasta "Reintentar carga". Las demás siguen operando. Una fila que el servidor confirma inexistente (respuesta 200 vacía) sí permite crear; un error de lectura, no.
- **Respuesta perdida:** si el servidor no responde tras escribir, la app relee la fila. Si ya contiene exactamente lo enviado, lo da por guardado sin escribir de nuevo; si no puede releer, avisa "sin conexión" y conserva la edición. Reintentar no duplica escrituras ni historial.
- Las ediciones locales nunca se descartan sin decisión: quedan en pantalla, en la copia del navegador y en "Descargar mis cambios".

Defecto encontrado por la prueba en navegador y corregido: un refresco de fondo que fallaba al releer una empresa la marcaba como no cargada y **hacía desaparecer de la pantalla sus nóminas** (incluida la abierta) hasta el siguiente refresco. Ahora se conserva lo último leído bien (caso 4c-2; comprobado que falla sin la corrección).

### Resultados (datos de prueba)

| Prueba | Resultado |
|---|---|
| `node src/nominasPersistencia.test.mjs` | OK |
| `scripts/e2e/nomina-condicionado.mjs` | 23/23, tres corridas seguidas |
| `scripts/e2e/nomina-guardado.mjs` | 27/27 |
| `nomina-credito.mjs`, `apertura-sin-cambios.mjs`, `creditos.mjs` | OK |
| `node src/creditos.test.mjs`, `node src/anticipos.test.mjs` | OK |
| jest completo | 1.213 pasan, 9 omitidas |
| `CI=true npm run build` | OK |

### Pendiente

1. **Sesiones con código anterior** (punto 10): decidir cómo impedir que sobrescriban antes de desplegar. Desplegar fuera de horario reduce el riesgo, no lo elimina.
2. Borrar sola la copia local al reabrir cuando coincide con el servidor (hoy se ofrece y se elimina a mano).
3. Horario de despliegue: no fijado.
