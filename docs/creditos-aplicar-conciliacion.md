# Aplicar la conciliación aprobada sin sobrescribir producción

> **Estado: script asistido implementado y probado SOLO con datos de prueba**, en un
> Postgres 16 + PostgREST 12 locales. **No se ha ejecutado contra producción.**
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
#    · firmar con aprobadoPor y fechaAprobacion

# 3) Aplicar lo aprobado (relee y reclasifica TODO de nuevo antes de escribir)
node scripts/conciliacion/aplicar.mjs aplicar --resultado conciliacion_creditos_X.json \
  --decisiones decisiones.json --destino http://127.0.0.1:PUERTO --usuario "Nombre" --salida carpeta
#    → auditoria_<sello>.json / .txt + línea en auditoria.jsonl
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

## Control de concurrencia: ¿es atómico con la configuración actual?

**Sí, para todo lo que escribe la app; con un hueco para ediciones hechas fuera de la app.**

1. **[Seguro] La escritura es una sola sentencia condicionada, no "comprobar y luego guardar".**
   - El script escribe con `PATCH …?id=eq.X&updated_at=eq.<versión leída>`, igual que el contrato de persistencia de la app.
   - PostgREST lo ejecuta como **un único** `UPDATE … WHERE id = X AND updated_at = V`.
   - Si otra transacción cambió la fila, Postgres vuelve a evaluar la condición sobre la versión nueva: actualiza **0 filas** y el script lo trata como conflicto.
   - **Probado con servidor real** (escenario 7): otra transacción bloquea la fila y la cambia; el PATCH espera (~1,1 s), no actualiza nada y prevalece la otra transacción.
2. **[Seguro, según el código del repositorio] Todos los escritores de la app cambian `updated_at` en cada guardado.** Se revisaron:
   - persistContract (finanzas, main, pins, allegria…), friskuHelpers y Osiris;
   - upsert de nóminas, auditoría, EEFF y "Restaurar".
3. **Hueco [Seguro, probado en el escenario 8].** Una edición que no cambie `updated_at` **no se detecta**: por ejemplo, desde el editor de tablas o el SQL Editor de Supabase, o un script externo.
   - Cierre propuesto (**no aplicado**): `scripts/conciliacion/propuesta-trigger-version.sql`, un trigger que fija `updated_at` en el servidor en todo UPDATE.
   - Probado en local: detecta esa edición y la app sigue funcionando, porque toma la versión de la respuesta del servidor.
4. **[Probable] No pude inspeccionar la base de producción** (sin acceso, 403). Para confirmar tipo de columna, triggers, reglas y RLS, ejecutar en el SQL Editor `scripts/conciliacion/verificar-supabase.sql` (**solo lectura**).
5. **Límite que no resuelve la condición: escrituras posteriores de quien no condiciona.** Las filas `nominas_*` se guardan con upsert sin condición, y un navegador abierto con nóminas viejas puede pisar el vínculo **después** de aplicado.
   - Recomendación: aplicar con la app cerrada en todas las sesiones.
   - Repetir el **ensayo** unos minutos después: todo debe salir "ya aplicada".

**Varias filas:** no hay transacción entre filas.
- Se escribe primero `finanzas`, después `maestro_tc` y al final `nominas_*`.
- Si una fila sale en conflicto, el script se **detiene** y no escribe las siguientes.
- Repetirlo relee, reclasifica y completa lo pendiente sin duplicar, porque las operaciones son idempotentes.

## Verificación posterior y auditoría

- **Relectura:**
  - cada operación aplicada debe quedar "ya aplicada";
  - cada fila escrita debe ser exactamente el valor escrito, o el informe indica que alguien escribió después.
- **Defensa adicional:** antes de escribir se comprueba que en `finanzas` solo cambian rutas de Créditos:
  - `creditos_*`;
  - `_coberturasManual` y `_resolucionesCreditos`;
  - valores manuales de Pago Préstamos y Renovaciones.
- **Auditoría** (`auditoria_<sello>.json` + `auditoria.jsonl`):
  - SHA-256 del resultado, de las decisiones y del respaldo;
  - firma de aprobación y usuario;
  - versiones leídas y escritas;
  - estado de cada operación con su motivo;
  - decisiones de duplicados;
  - resultado de la verificación;
  - SHA-256 del propio registro.

## Prueba (datos de prueba)

```bash
POSTGREST_BIN=/ruta/postgrest PG_BIN=/usr/lib/postgresql/16/bin OUT_DIR=/tmp/conc \
  node scripts/conciliacion/prueba.mjs
```

La prueba levanta Postgres y PostgREST locales y un proxy con el prefijo `/rest/v1` de Supabase. Los movimientos de la sesión se generan con las funciones reales de `src/creditos.js` y la comparación de `scripts/vista-previa/diff.js`. Resultado: **53/53 OK**.

- Rechazo de producción y de destinos no locales.
- Ensayo:
  - 0 escrituras;
  - las 7 clases;
  - bloqueo por dependencia, también entre filas (nómina → pago) y por grupo (valor manual → decisión);
  - advertencia de 7 días;
  - informe de lo registrado en producción después del respaldo.
- Aplicación:
  - sin firma, nada;
  - solo lo aprobado;
  - posibles duplicados sin decisión no se aplican;
  - se conservan los cambios posteriores (pagos, desglose, cuota, valor manual, vínculo, TC manual y un dato ajeno a Créditos);
  - la nómina sigue guardada como texto.
- Decisión individual: sin motivo no cuenta; uno omitido (su bitácora queda bloqueada) y otro aplicado.
- Reintento: 0 escrituras, misma versión, nada duplicado.
- Concurrencia:
  - otro guardado entre lectura y escritura → rechazado, sin escribir las filas siguientes;
  - al repetir se aplica conservando el cambio ajeno;
  - carrera real en Postgres → 0 filas.
- Hueco sin `updated_at` y su cierre con el trigger.
- Respaldo de prueba intacto (SHA-256).

## Antes de usarlo con datos reales (pendiente de tu autorización)

1. Ejecutar `verificar-supabase.sql` (solo lectura) y decidir si se aplica el trigger.
2. Habilitar el destino de producción en el código (hoy bloqueado). Requiere tu autorización.
3. Respaldo nuevo del mismo día, como punto de retorno.
4. Pedir al equipo que cierre la app durante la aplicación.
5. Ensayo → revisión → decisiones firmadas → aplicar → ensayo de control.
