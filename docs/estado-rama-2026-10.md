# Estado de la rama `claude/fervent-bell-uu6ae8` (oct-2026)

**Documento único de estado.** Reemplaza `docs/cierre-funcional-2026-10.md` (renombrado acá) y las secciones de riesgos e integración de `docs/informe-integracion-2026-10.md`.

**Estado:** sin merge a `main`, sin despliegue, sin migraciones ejecutadas, sin respaldos activados ni borrados, sin consultas a producción.

Toda la evidencia es **local**: build de la rama, Chromium con hora de Chile, Supabase falso en memoria y Postgres local aislado. **Nada se verificó en producción**: la red de este entorno bloquea Vercel y Supabase. Solo se probó en Chromium; Safari, Firefox y dispositivos reales no están disponibles acá.

Confianza: **[Seguro]** = comprobado con prueba reproducible · **[Probable]** = inferencia sólida · **[Suponiendo]** = vacío llenado.

Correcciones a entregas anteriores:
- Calendario: son **11** meses afectados, no 12.
- Inventario: **138** tablas definidas en el repo, no ~92 ni ~130.
- El rollback se había verificado contra `8df9862`. `main` avanzó a **`3a9d33e`** el 07-10-2026 a las 12:07 UTC (otra sesión). La rama ya lo integró y el rollback se repitió contra ese commit (sección 6).
- "Osiris marca cuotas pagadas sin control de rol" era **falso**: el cambio queda en borrador y "Guardar" exige el permiso del módulo.

**Novedades (cierre funcional, tercera entrega, 08-10-2026):**
- **Lo incómodo primero:**
  - **No verifiqué el conjunto sobre el `main` vigente.** `main` pasó de 3fd03d9 a **0b86538** (PR #43, Créditos) y reescribió el guardado de Nóminas.
  - Permisos, tiempo real y Frisku chocan solo en bloques chicos. Remuneraciones, en cambio, hay que **portarlo** al nuevo guardado de nóminas (§4.17). No lo hice: es integración y no está autorizada.
  - La verificación anterior vale solo para 3fd03d9.
- **Tiempo real limitado por fila** (§4.14): cada navegador se suscribe solo a `main` y `usuarios`, más `finanzas` dentro de Finanzas, y solo con sesión iniciada.
  - Control contra `main`: hoy cualquier navegador, **incluso en la pantalla de ingreso**, recibe completas `nominas_remuneraciones`, `nominas` y `frisku_liquidaciones` cuando cambian.
  - Con el cambio no las recibe, y la sincronización de `usuarios` y `finanzas` sigue funcionando (Realtime emulado).
- **Clasificación explícita frente a sugerencia por palabras** (§4.15):
  - Solo «Anticipos de Sueldo» y el tipo «Remuneraciones» son remuneración.
  - «Anticipo a proveedor» o «descuento comercial» quedan como sugerencia: no se ocultan y no cambian ningún total.
  - Quien no está autorizado ve las remuneraciones como **un monto agregado** de solo lectura por nómina, y el total no cambia.
- **Nómina aprobada:** no se modifica en silencio. Su versión aprobada se congela con una huella en la fila restringida y conserva el total con una línea agregada; la rectificación queda visible, sin montos. Desde una nómina en borrador, la línea pasa al circuito de remuneraciones.
- **Rollback a `main` y reversión de datos, probados por separado** (§4.16). El fallo de lectura de facultades muestra un aviso con «Reintentar».
- Evidencia local:
  - jest 1.828/1.828 en UTC y en hora de Chile;
  - e2e de remuneraciones 36/36, de tiempo real 8/8, de rollback 9/9 y de permisos 31/31.
- Sin merge, despliegue ni RLS.

**Novedades (remuneraciones, transición de pagos y Frisku, 08-10-2026, segunda entrega):**
- **Corregido el periodo sin pagos de la entrega anterior.** Las facultades pasan a una fila propia (`permisos_facultades`). La regla de pago tiene dos modos:
  - **transición**: paga quien paga hoy en producción;
  - **matriz**: solo quien tiene la facultad. Se activa a mano, no se puede activar sin pagadores y se revierte con motivo (§4.12).
- **Hallazgo:** la versión publicada reescribe la ficha de los usuarios base al iniciar sesión. Por eso las facultades no podían quedar en `usuarios`: un rollback las habría borrado y, al volver, nadie habría podido pagar.
- **Remuneraciones separadas**, con clasificación explícita: sueldo, anticipo, descuento, bono y finiquito (§4.11).
  - Viven en su propia fila, que solo se pide desde la sesión de Angelo, Lucía o Cristobal.
  - Los registros existentes ambiguos se listan para revisión, sin reclasificarlos solos. Mientras no se decidan, quien no puede ver remuneraciones no los ve.
- **Frisku:** sin acceso a Liquidaciones, los montos aparecen como «restringido» o se omiten, nunca como cero (§4.13).
- **Sigue siendo control de la aplicación.** Se encontró además un canal de tiempo real sin filtro que puede llevar filas completas a cualquier navegador con sesión (§4.11 F). Nada de esto es confidencial frente a acceso directo a la base.
- Evidencia local:
  - jest 1.817/1.817 en UTC y en hora de Chile;
  - e2e de permisos 31/31 y de remuneraciones 33/33, en la rama y sobre `main` 3fd03d9;
  - contra el código anterior fallan 6 pruebas jest y el e2e de remuneraciones.
- Sin merge, despliegue ni RLS. El archivo de permisos no está en la rama.

**Novedades (propuesta perfil + facultades):**
- El conjunto preparado no se integra. Se reemplaza por la propuesta §4.7: perfil para ver y editar, más facultades explícitas por acción (aprobar asignadas, pagar, V°B°, aprobación final), independientes de la edición del módulo. Lucía conserva exactamente lo de hoy.
- Nóminas por versión: los V°B° y aprobaciones van ligados a una versión; quien es autor de esa versión no la aprueba.
- Frisku: tres personas sin ninguna configuración y una cuarta parcial; acceso efectivo por pestaña en §4.8.
- Tabla única de decisiones en §4.9.
- Sin cambios de código ni pruebas. Autorización en el servidor: trabajo separado. Merge y despliegue pendientes.

**Novedades (permisos reales, 08-10-2026):**
- Matriz con los permisos reales: solo diferencias, separadas en configurado, regla fija y configurado sin efecto (§4.6). El archivo no se sube a la rama.
- **El conjunto de permisos preparado chocaría con dos configuraciones explícitas** de una usuaria con rol consulta (Lucía Corbetto): edición del flujo y aprobación asignada de dos personas. No se integra hasta que lo decidas.
- Nóminas: en la práctica, solo Carol puede dar el V°B° (Michelle tiene "ver") y puede hacerlo sobre nóminas que ella misma preparó.
- Sin cambios de código ni pruebas.

**Novedades (desarrollo detenido hasta revisar los permisos reales):**
- Instrucciones para obtener el extractor desde la rama y abrirlo localmente, con SHA-256 para verificarlo (§4.5).
- Procedimiento para actualizar la matriz cuando llegue el archivo: solo diferencias, separadas en configurado, regla fija y configurado sin efecto (§4.5).
- Nóminas (§4.4): también es preparador quien modifica datos relevantes después de la preparación; tabla de cambios que invalidan el V°B° o la aprobación.
- Hallazgo: hoy no se registra quién edita los campos de una línea; es un requisito previo de la propuesta.
- Siguen pendientes de tu decisión: si una persona puede dar V°B° y aprobación final, titulares, reemplazos y excepciones. Nada implementado y sin pruebas nuevas.

**Novedades (extractor de permisos y propuesta de Nóminas):**
- Nuevo extractor local de permisos reales, sin PIN, hashes, tokens ni correos (§4.5). Prueba con datos ficticios: 11/11.
- La propuesta de Nóminas se reformula (§4.4): nadie aprueba lo que preparó, sin exigir tres personas. V°B° y aprobación final con titular y reemplazo configurables, y excepciones registradas que tú autorizas. No implementada.
- Permisos: sin cambios hasta que confirmes los responsables. La integración sigue pendiente.

**Novedades (07-10-2026, tarde):**
- La matriz de decisiones se reduce a seis preguntas (§4.3), basada en los valores por defecto.
- **Aclaración sobre "haré commit de la corrección":** se refería **solo a "Marcar pagada"** (commit `1059b1c`). La regla de Nóminas **no se modificó**: `git diff origin/main` no muestra cambios en `AUTORIZADORES`, `puedeAvanzar` ni `puedeRetroceder`. La separación de funciones sigue siendo una propuesta.
- Que "Marcar pagada" quede limitado a admin/CFO en el conjunto preparado es una **decisión provisional**, señalada en la pregunta 1.
- Corrección de redacción: los PIN están como **hash PBKDF2**, no cifrados. `.gitignore` **previene** subidas accidentales; no las impide. El respaldo original **no se borra automáticamente**: se conserva local y protegido hasta que decidas su conservación.
- Sin cambios de código en esta actualización, salvo textos del extractor y de este documento. No se repitieron pruebas.

---

## 1. Fechas y cálculos

### 1.1 Zona horaria en créditos

**Problema.** `new Date("2026-12-01")` se interpreta como medianoche UTC. Con hora de Chile, eso cae el 30-11 a las 21:00, así que toda cuota que vence un día 1 caía en el mes y la semana anteriores. **[Seguro]**

**Arreglo.** `fechaLocal()` y `hoyISOlocal()` en `src/FinanzasModule.jsx`. Con esto, `semanaDeDate` deja de depender del cambio de hora. Antes, entre abril y septiembre, un sábado quedaba en la semana siguiente.

**Comparación con datos FICTICIOS** (créditos por defecto del repositorio, `npm run comparar:tz`). 10 cuotas cambian de mes y ninguna cambia solo de semana:

| Empresa | Fecha | Monto | Mes antes → después | Semana antes → después |
|---|---|---|---|---|
| Allegria Foods · Santander | 01-09-2026 | 105.000 | Aug-26 → Sep-26 | S34 → S36 |
| Mediterra · Privado | 01-06-2026 | 34.650 | May-26 → Jun-26 | S21 → S23 |
| Mediterra · Privado | 01-09-2026 | 34.650 | Aug-26 → Sep-26 | S34 → S36 |
| Mediterra · Privado | 01-12-2026 | 34.650 | Nov-26 → Dec-26 | S47 → S49 |
| Mediterra · Privado | 01-01-2027 | 550.000 | **Dec-26 → Jan-27** (cambia de año) | S51 → S01 |
| Mediterra · Privado | 01-03/06/09/12-2027 | 17.325 c/u | mes anterior → mes correcto | — |
| Mediterra · Privado | 01-01-2028 | 550.000 | Dec-27 → Jan-28 | S51 → S01 |

Efecto en el flujo de Mediterra:

| Mes | Flujo neto antes | Flujo neto después | Cálculo |
|---|---|---|---|
| Dec-26 | −553.284 | −37.934 | −553.284 + 550.000 − 34.650 + 34.650 (la cuota de dic. entra y la de nov. sale) |
| Saldo acumulado Dec-26 | −594.501 | −44.501 | +550.000 |

Jan-27 queda igual en los dos casos (−597.784).

**Datos REALES: no comparados.** No tengo una copia autorizada. La herramienta está lista y no se conecta a Supabase:

```
COMPARAR_TZ_ARCHIVO=/ruta/respaldo.json COMPARAR_TZ_SALIDA=/ruta/salida npm run comparar:tz
```

Acepta el JSON de "💾 Respaldo" (v1/v2/v3), la fila `finanzas` o un arreglo de créditos. Entrega un CSV por cuota y un JSON con el delta por empresa × mes y por empresa × semana. **[Probable]** Con datos reales habrá más casos que con los ficticios, porque cualquier crédito pactado al día 1 se corre.

### 1.2 Otras fechas financieras revisadas

| Fecha | Antes | Ahora | Estado |
|---|---|---|---|
| "Hoy" de corte (11 usos de `toISOString().slice(0,10)` en Finanzas, 1 en Rendiciones) | Entre las 21:00 y las 24:00 de Chile ya era mañana | `hoyISOlocal()` | **[Seguro]** arreglado y probado (`fechasFinancieras.test.js`) |
| Fecha de saldo por cuenta (`fechasSaldosEmpresa`), saldo reciente, fecha de transferencia | Lectura UTC | `fechaLocal` | Arreglado |
| Vencimientos del año (KPI) | Comparación con `Date` UTC | Comparación de texto `AAAA-MM-DD` | Arreglado |
| Año de renovación | UTC | Local | Arreglado |
| Osiris, Frisku y Contabilidad (`PostingPipeline`) | Siguen usando "hoy" en UTC | — | **Pendiente**, fuera del alcance financiero de esta ronda. No afectan Flujo, Créditos ni Saldos. |

### 1.3 Calendario semanal

**Diagnóstico** (`node scripts/calendario/diagnostico.mjs --md`, igual con hora UTC y de Chile). En **11** meses de la tabla fija Apr-26..Dec-27, la etiqueta S1 cubre una semana **anterior** al día 1, así que la primera semana real del mes cae en S2:

| Mes | Tabla actual | Correcta | La S1 actual cubre | Clave antigua → nueva |
|---|---|---|---|---|
| Jun-26 | S22–S25 | S23–S26 | 24–30 may | S22→S23 … S25→S26 |
| Nov-26 | S44–S47 | S45–S48 | 25–31 oct | +1 |
| Dec-26 | S48–S51 | S49–S52 | 22–28 nov | +1 |
| Feb-27 | S05–S08 | S06–S09 | 24–30 ene | +1 |
| Mar-27 | S09–S12 | S10–S13 | 21–27 feb | +1 |
| Apr-27 | S13–S16 | S14–S17 | 21–27 mar | +1 |
| May-27 | S17–S20 | S18–S21 | 18–24 abr | +1 |
| Jun-27 | S21–S24 | S23–S26 | 16–22 may | **+2** (S1 y S2 sin días del mes) |
| Aug-27 | S31–S34 | S32–S35 | 25–31 jul | +1 |
| Nov-27 | S44–S47 | S45–S48 | 24–30 oct | +1 |
| Dec-27 | S48–S51 | S49–S52 | 21–27 nov | +1 |

**Cómo afectan hoy esas etiquetas** (sin migrar):

- **Flujo Empresas.** Las semanas cargadas se guardan por posición (`vals["mes_0..3"]`), no por etiqueta, así que el importe mensual no cambia. El rótulo de la columna muestra un número ISO equivocado. Una cuota con fecha real se ubica por su fecha y cae en la posición correcta del mes. Una línea mensual sin desglose va a S1, y esa S1 está rotulada con una semana que pertenece al mes anterior.
- **Consolidado.** Usa el mismo motor (`motorFlujoEmpresa`), así que hereda lo anterior. Los totales mensuales no cambian.
- **Reporte Semanal.** La ventana de 8 semanas parte en la semana real (`posicionSemana`). En esos 11 meses, los compromisos con fecha quedan en la semana correcta, pero el rótulo muestra la etiqueta antigua.
- **Datos reales por semana.** `realData[emp][mes][etiqueta]` sí usa la etiqueta como **clave**. Corregir la tabla sin migrar dejaría esos datos huérfanos. Por eso la pantalla ya muestra las claves que no calzan como "(clave anterior)", en vez de ocultarlas.

**Propuesta de migración** (`src/calendario/migracionSemanas.js`, **no ejecutada**):

- `planMigracionSemanas(realData)` lista cada movimiento clave → clave con su importe. No escribe nada.
- `aplicarMigracionSemanas` **copia** a la clave nueva y deja un registro con la clave original, el importe y la fecha. Si la clave destino ya tiene dato, no suma ni sobrescribe: lo informa como conflicto.
- `revertirMigracionSemanas(registro)` vuelve exactamente al estado anterior.
- Prueba (`migracionSemanas.test.js`): `totalRealMes` es igual antes y después, sin duplicados, y aplicar seguido de revertir deja el estado idéntico.

**Decisión tuya** antes de ejecutar: aplicar el plan sobre una copia y revisar el listado de conflictos.

### 1.4 "Compromisos 8 Sem.": corrección vs. imputación

Mismo juego de datos ficticio, hora de Chile (`DESCOMPONER=1 … descomponerCompromisos`):

| Paso | US$ | Origen |
|---|---|---|
| Versión de `main` | 1.784.637 | — |
| − corrección de zona horaria (cuota de 34.650 que no correspondía a la ventana) | 1.749.987 | Error corregido |
| + ventana desde la semana real (Oct S2 → Dec S1, antes Oct S1 → Nov S4) | **1.987.636** | Movimiento de ventana |
| Recorte a 50 ítems | 0 en este juego de datos | — |

Por origen, en la ventana nueva:

| Origen | Ventana anterior | Ventana real |
|---|---|---|
| **Con fecha** (cuotas de Créditos, nóminas) | 998.220 | 998.220 |
| Semana cargada a mano | 0 | 0 |
| **Mensual sin desglose** (regla S1) | 751.767 | 989.416 |

**Conclusión.**
- Corregir errores explica −34.650.
- Los +237.649 restantes salen **íntegros** de importes mensuales sin desglose que la regla S1 imputa a Dec S1: son proyección, no compromisos con fecha.

Para que se distingan:
- Los KPI del Reporte muestran "con fecha X · mensual sin desglose Y".
- El listado y el Excel tienen la columna **Origen**.
- El PDF agrega una línea que lo explica.

---

## 2. Tipo de cambio de saldos

Fuente única: `maestro_tc`, con la política `maestro_tc_v1` (`src/tc/conversionSaldos.js`).

| Punto pedido | Resultado | Evidencia |
|---|---|---|
| Falla de carga ≠ falta de cotización | Si `maestro_tc` no carga, la pantalla lo dice, ofrece **Reintentar** y al guardar **conserva** las cuentas no-USD sin degradarlas a "sin paridad". La degradación solo ocurre con `maestro_tc` cargado y sin cotización, y antes pide confirmación. | `tc-politica.mjs` (navegador) |
| "5 días hábiles" | Lunes a viernes; **no** descuenta feriados (el límite es más estricto). Lo dice el pie de Saldos Bancos, y cada saldo muestra la antigüedad ("del mismo día", "3 días hábiles / 5 corridos antes"). | `conversionSaldos.test.js` |
| Trazabilidad | Cada saldo nuevo guarda TC, par, fecha, fuente y antigüedad. Los históricos se rotulan "TC histórico" y no se recalculan en bloque. PDF y Excel llevan la misma etiqueta. | `tc-politica.mjs`, que extrae el PDF con `pdftotext` |
| Cotización manual modificada después | El saldo confirmado **no cambia**. La pantalla avisa ("la cotización usada cambió en maestro_tc"), con el valor guardado y el actual. | `tc-politica.mjs` (`data-aviso="tc-modificada"`) |
| Totales incompletos | Se mantienen: cuentas sin paridad nombradas y total rotulado INCOMPLETO. | `sin-paridad.mjs` 11/11 |

**[Seguro]** Ningún saldo histórico se recalcula al abrir ni al navegar. Solo cambia la cuenta que se vuelve a guardar.

---

## 3. KPI de deuda

Con datos **ficticios** (créditos por defecto) y corte al 07-10-2026:

| Concepto | US$ |
|---|---|
| Capital por vencer, 6 sociedades consolidadas | 4.571.791 |
| Capital por vencer, JV (Allpa, aparte) | 1.556.701 |
| **Por conciliar** (vencidos sin pago registrado y renovaciones con el original impago) | 1.647.854 (1.402.581 consolidadas) |
| Comprobación | 4.571.791 + 1.556.701 + 1.647.854 = **7.776.346** = Σ `monto` impago |

- **Leasing.** `verificarLeasing` comprueba que `cuota − monto` sea el interés del saldo a la tasa declarada.
  - En los datos del repo, la tasa implícita es 8,54% en los 5 pagos, así que `monto` = capital. **[Seguro] para los datos del repo.**
  - **[Probable]** para producción hasta correrlo con datos reales. Si no calza, la pantalla dice "NO CONSISTENTE" y el KPI no debe presentarse como capital.
- **Estado desactualizado.** Probado con casos sintéticos:
  - Un original vencido sin marcar pagado, con la renovación ya recibida, no suma: queda todo por conciliar.
  - Un original pagado suma la renovación menos lo amortizado.
  - Un pago marcado pagado **antes** de vencer se informa.
  - **Nada se marca pagado automáticamente.**
- **Consistencia ≠ corrección.** Que Dashboard y Créditos usen la misma función solo prueba consistencia. La corrección se fijó con casos cuyo resultado se calculó a mano (`capitalPendiente.test.js`).
- La pantalla muestra fecha de corte, perímetro, JV aparte e importe por conciliar.

---

## 4. Permisos de la aplicación

### 4.1 Matriz de defectos

"Configurado" = lo que dice `supabase/MATRIZ_ACCESO_MODULOS.md` (BORRADOR del 18-06-2026) o lo que se guarda en la fila `usuarios`. **No leí la fila `usuarios` de producción**: los perfiles afectados salen de los valores por defecto del código y pueden diferir.

| # | Perfil afectado | Comportamiento actual (main) | Esperado según permiso explícito | Riesgo | Estado en la rama |
|---|---|---|---|---|---|
| P1 | Quien tenga `rendVerTodas` (por defecto Milagros, Carol, Michelle, Pablo), incluido un rol **consulta** | "Marcar pagada" visible y ejecutable para todo `rendVerTodas`; la acción no revisaba rol ni estado | Solo quien tenga **autorización explícita** para pagar: admin y esCFO (CLAUDE.md: "Pagos = admin o esCFO"). `rendVerTodas` es un permiso de ver ("solo lectura; solo el dueño modifica"). Además, aprobada y no consulta | Pago registrado por quien no corresponde; estado de pago falso | **Corregido**: solo admin/esCFO, con aprobada y no consulta, también dentro de la acción. **Cambia el acceso actual de Carol y Milagros** (hoy pueden pagar y reciben los avisos de pago): ampliarlo es la decisión D1 |
| P2 | Todos los que tengan una cadena en Gestión de Usuarios | `cadenaAprobacion` se edita pero no se usa: manda `config.aprobadores` de Rendiciones | No hay un permiso explícito que contradiga: hay **dos** configuraciones y una sin efecto | Se cree que aprueba X y aprueba Y | **Pendiente** (D2): elegir cuál manda |
| P3 | Carol, Michelle, Pablo en Contabilidad | `canEdit={!esSoloConsulta}` es siempre `false`: solo edita esCFO | La matriz (borrador) propone admin + contadores, con `[DECISIÓN]` abierta | Contadores sin poder editar, o se les da edición sin decidirlo | **Sin cambio de comportamiento**: se dejó explícito `canEdit={false}`. Decisión D3 |
| P4 | Toda pestaña sin valor guardado | `getTabPerm` devuelve "editar" por defecto; en Frisku las claves resumen/documentos/bi/reportes/tablero no existen en la configuración | Sin permiso explícito no hay contradicción | Una pestaña nueva nace abierta | **Pendiente** (D4): cambiarlo a "sin acceso" puede bloquear a usuarios legítimos |
| P5 | Quien tenga una pestaña de Allegria en "ver" o "sin acceso" | Allegria ignoraba `tabPermisos` | "ver" = sin editar; "sin acceso" = no ver | Edición de clientes, liquidaciones o cobranza que el admin restringió | **Corregido** (pantalla y escritura); lo no configurado queda igual |
| P6 | Quien tenga Finanzas › "params" en "ver" o "sin acceso" | La sub-vista Parámetros dependía solo de "flujo" | Respetar "params" | Cambios de parámetros (anticipos, programas) por quien no debía | **Corregido** |
| P7 | Todo el personal sin Finanzas | La documentación decía "rendiciones = editar"; el código da **"ver"** (= cargar lo propio) | — | Documentación engañosa | **Corregido en CLAUDE.md/AGENTS.md** (el código no cambia) |
| P8 (nuevo) | Rol **consulta** en Finanzas | FinanzasModule recibía `esSoloConsulta` y no lo usaba: consulta heredaba "editar" | "Consulta – solo visualiza" | Un usuario de consulta podía cargar saldos, editar flujo y créditos | **Corregido**: tope "ver" |

Otros puntos revisados, sin defecto: Tareas, Frisku y Osiris ya bloqueaban el rol consulta. Nóminas sigue las reglas de `AUTORIZADORES`, aunque la matriz propone un círculo más reducido (D5).

### 4.2 Pruebas (acceso permitido y denegado)

| Prueba | Qué cubre | Resultado |
|---|---|---|
| `src/__tests__/permisosAcciones.test.js` | Cada guarda llamada **directamente**, con estados que la pantalla no ofrecería: pagar algo no aprobado, pagar con `rendVerTodas` sin autorización, aprobar fuera de turno, devolver sin haber aprobado, editar como consulta | 25 casos, todos verdes |
| `src/__tests__/rendicionesPermisosPantalla.test.js` | Pantalla real con Supabase simulado: Angelo (admin) paga y se guarda; Carol y consulta ven Pagos sin el botón y no escriben; la aprobadora asignada ve "Aprobar" y consulta no | 5/5. **Contra el código de `main`: 3 fallas** (Carol y consulta podían pagar; consulta podía aprobar) |
| `scripts/e2e/permisos.mjs` (navegador) | Admin de control; Carol con "params", "clientes" y "cobranza" restringidos; Milagros con rol consulta | **14/14** con la corrección. **Build anterior: 9/14** (5 fallas = los defectos) |

Los accesos con permiso explícito (admin pagando y editando; Carol editando bancos sin configurar; la aprobadora asignada aprobando) pasan antes y después. **Excepción deliberada:** Carol y Milagros dejan de poder marcar pagada, porque `rendVerTodas` no es una autorización explícita para pagar (ver D1 en la matriz).

### 4.3 Matriz de decisiones (seis preguntas)

**Basada en los valores por defecto del código de `main` (3a9d33e).** No hay copia autorizada de la fila `usuarios`, que en producción manda sobre estos valores. Cuando la haya, se reemplaza esta columna "Actual".

"Admin" **no** se trata como autorización general para acciones financieras. Donde hoy el rol admin habilita una acción, la matriz lo muestra como decisión. Por construcción del código, quien se crea con rol admin recibe además `esCFO` (App.jsx), así que hoy "admin" y "CFO" son la misma persona: Angelo.

| # | Pregunta | Actual (defaults de `main`) | Recomendación (no implementada) | Lo que tienes que definir |
|---|---|---|---|---|
| 1 | ¿Quién puede marcar rendiciones como pagadas? | Angelo, Carol, Michelle, Pablo y Milagros (todo `rendVerTodas`), y un usuario consulta si tiene `rendVerTodas`. La acción no revisaba rol ni estado. **La rama** (preparada, no integrada) lo limita a admin o CFO, con la rendición aprobada y sin rol consulta | Un permiso explícito por persona, "paga rendiciones", asignado en Gestión de Usuarios. Nadie paga solo por ser admin, CFO o por ver todas. Además, rendición aprobada y nunca rol consulta | Lista de personas que pagan (candidatos: Angelo, Carol, Milagros, que hoy reciben los avisos de pago). **Que la rama incluya admin/CFO es una decisión provisional mía**, pendiente de tu confirmación |
| 2a | ¿Quién puede ver todas las rendiciones? | Admin, CFO y `rendVerTodas`: Angelo, Carol, Michelle, Pablo, Milagros | Separar ver de aprobar y de pagar. Ver todas: solo quien revisa o contabiliza | Si Michelle y Pablo necesitan verlas todas (por ejemplo, para contabilizar) |
| 2b | ¿Quién puede aprobarlas? | El aprobador asignado a cada trabajador en Rendiciones → Maestros (los valores reales son desconocidos). Sin aprobador asignado: admin o CFO. El admin puede aprobar cualquiera (override, que queda registrado). La "cadena" de Gestión de Usuarios no tiene efecto | Una sola fuente: el maestro de Rendiciones, con aprobador **y reemplazo** por trabajador. La cadena sin efecto se retira o se rotula | Aprobador y reemplazo de cada persona. **Si el admin mantiene el override**, y con qué registro |
| 3 | ¿Quién puede crear y editar en Contabilidad? | Ven: Angelo, Carol, Michelle, Pablo. Editan: solo quien tiene `esCFO` (Angelo), por un error de código (`canEdit` siempre falso) | Michelle y Pablo (contadores) crean y editan. Carol ve | Si Carol edita. **Si el CFO/admin edita en Contabilidad** |
| 4 | ¿Quién puede ver, preparar, dar V°B° y aprobar al final las nóminas? | Ver y preparar: quien tenga la pestaña Nóminas en "editar" (Angelo, Carol). V°B°: Carol o Michelle, fijo por nombre en el código. Michelle no tiene la pestaña por defecto, así que en la práctica solo Carol. Aprobación final: rol admin (Angelo). **Sin separación de funciones** | Separar **preparación** de **aprobación**: quien preparó una nómina no da su V°B° ni su aprobación final. No se exigen tres personas distintas (ver §4.4). **No se implementa** hasta que definas responsables, reemplazos y excepciones | Responsable y reemplazo de cada paso. Tratamiento de excepciones (ausencia o urgencia): quién autoriza y cómo queda registrado. **Si la aprobación final sigue ligada al rol admin** o a una persona nombrada |
| 5 | ¿El perfil consulta puede cargar sus propias rendiciones como excepción explícita? | Sí, de hecho: todo usuario recibe Rendiciones en "ver", que en ese módulo significa cargar y ver las propias. La rama no lo cambia; solo le quita aprobar, pagar y devolver | Sí, **como excepción escrita** en la definición del rol: "Consulta – solo visualiza, salvo cargar sus propias rendiciones" | Confirmar la excepción |
| 6 | ¿Qué acceso tendrán las pestañas nuevas o sin configurar? | "Editar" para todo no-admin con el módulo (salvo "config", que es "sin acceso"). El admin tiene "editar" en todo. El gerente técnico tiene "editar" en todo Osiris. La rama pone el rol consulta en "ver" solo en Finanzas | 1) Guardar como explícito el nivel efectivo de hoy en cada persona y pestaña existente: nadie gana ni pierde acceso. 2) Las pestañas nuevas nacen "sin acceso" para no-admin | **Si el admin recibe acceso automático a las pestañas nuevas** o también se le asigna explícitamente |

### 4.4 Propuesta: separación de funciones en Nóminas (no implementada)

**Regla única:** nadie aprueba lo que preparó. Quien marcó una nómina como "preparada" no puede darle V°B° ni aprobarla al final. No es obligatorio que haya tres personas distintas.

| Elemento | Propuesta | Hoy en el código |
|---|---|---|
| Preparadores | Lista configurable de personas que pueden crear y preparar | Cualquiera con la pestaña Nóminas en "editar" |
| V°B° | Lista configurable de titulares, más un reemplazo configurable por titular. Puede incluir a un preparador, pero nunca para una nómina que preparó él mismo | Carol o Michelle, fijo por nombre |
| Aprobación final | Persona titular configurable, más un reemplazo configurable. Puede ser la misma persona que dio el V°B° si así lo configuras; nunca quien preparó | Rol admin |
| Autoaprobación | Bloqueada: el sistema compara quién preparó (ya queda en el historial) con quien intenta aprobar | Permitida |
| Excepciones | Solo con tu autorización explícita para esa nómina, con motivo. Queda registrado en el historial de la nómina y en el log de auditoría (quién autorizó, cuándo y por qué). Una excepción no cambia la configuración | No existen; tampoco hay bloqueo |
| Configuración | Editable solo por quien designes. Los cambios quedan registrados | Fija en el código |

**Quién cuenta como preparador.** Es preparador de una nómina quien la marcó "preparada" (`nom.preparadoPor`) **y también cualquier persona que modifique un dato relevante después** (tabla siguiente). Ninguno de ellos puede dar el V°B° ni la aprobación final de esa versión.

**Requisito previo [Seguro, por el código]:** hoy el historial de una línea registra solo inactivaciones y documentos (`linea_inactivada`, `doc_interno_generado`, adjuntos). **No registra quién editó** monto, proveedor, RUT o fechas. Sin ese registro no se puede saber quién modificó después de preparar, así que la propuesta exige primero guardar, por cada cambio relevante: autor, fecha, campo, valor anterior y valor nuevo.

**Qué cambios invalidan una revisión previa:**

| Cambio | Efecto propuesto |
|---|---|
| Monto de una línea (CLP, USD, PEN), tipo de cambio de la nómina | Invalida el V°B° y la aprobación previa |
| Proveedor o beneficiario, RUT, N° y tipo de documento | Invalida |
| Fecha de pago o de vencimiento de una línea, fecha o semana de la nómina | Invalida |
| Empresa pagadora, sección o clasificación de la línea (cambia el flujo) | Invalida |
| Agregar, inactivar o reactivar una línea | Invalida |
| Reemplazar o inactivar un documento de respaldo | Invalida (cambia la evidencia aprobada) |
| Agregar un documento adicional, sin quitar ni reemplazar otros | No invalida; queda registrado y se muestra al revisor |
| Comentarios, notas internas, marcar "pagado" posterior a la aprobación | No invalida; queda registrado |

**Qué pasa al invalidar:** la nómina vuelve a "revisión" y se pierden el V°B° y la aprobación anteriores, que quedan en el historial como invalidados, con el cambio que los invalidó. Quien hizo el cambio pasa a ser preparador de la nueva versión.

**Hoy:** con V°B° o aprobada, la nómina queda bloqueada para todos, incluido el admin. Para modificarla hay que devolverla, y eso ya la saca de esos estados. El hueco está antes: en "revisión" se puede editar, y quien edita puede luego dar el V°B°.

Lo que tienes que definir antes de implementarla:
- titulares y reemplazos de V°B° y de aprobación final;
- si la aprobación final puede coincidir con el V°B°;
- quién puede autorizar excepciones (¿solo tú?);
- quién edita la configuración.

### 4.5 Extractor de permisos reales

`scripts/datos/extraer-permisos.html` funciona igual que el de créditos: local, sin red, sobre el "💾 Respaldo" de la versión publicada (v1).

**Exporta por persona, identificada por su nombre:** cargo, rol, módulos, permisos por pestaña, CFO, ver todas las rendiciones, rendir por otros, desactivado, empresas permitidas y cadena de aprobación. Además, el aprobador de rendiciones asignado a cada persona.

**No exporta:** PIN, hashes, tokens ni correos. Los correos se traducen a nombres, y un correo sin persona queda como "correo no registrado N".

Antes de descargar muestra una vista previa de cada campo y la lista de campos descartados. El archivo declara además las reglas de nóminas que están fijas en el código.

Prueba con datos ficticios en formato v1, con PIN, hashes, tokens, correos y teléfono (`node scripts/datos/prueba-extractor-permisos.mjs`): **11/11**. Ninguno de esos datos aparece en la vista previa ni en el archivo, y la página no hace pedidos de red.

**Cómo obtenerlo (no está en tu computador hasta que lo descargues):**
1. Con tu cuenta de GitHub abre:
   `https://github.com/mediterra-finanzas/gestion-grupo-mediterra/blob/claude/fervent-bell-uu6ae8/scripts/datos/extraer-permisos.html`
2. Usa el botón **"Download raw file"** (ícono de descarga, arriba a la derecha del archivo). Guárdalo con extensión **`.html`**. Si el navegador lo guarda como `.txt`, renómbralo.
3. Opcional, para comprobar que es el mismo archivo: SHA-256 `7d651d9f0823992a7ec65d39fb13bb2d9443aaf644903d6c8bc990c5a0cd5952` (versión que además exporta la regla de pago y las facultades de la fila `permisos_facultades`; la anterior, `fc287e0e…` del commit `2e19143`, sigue sirviendo para lo demás).
   - Windows: `certutil -hashfile extraer-permisos.html SHA256`
   - Mac: `shasum -a 256 extraer-permisos.html`
4. Doble clic para abrirlo en Chrome, Edge, Safari o Firefox. No necesita internet.
5. Elige el archivo de "💾 Respaldo" y revisa la vista previa y los campos descartados antes de descargar.

Otra forma, con git: `git fetch origin claude/fervent-bell-uu6ae8` y luego `git show origin/claude/fervent-bell-uu6ae8:scripts/datos/extraer-permisos.html > extraer-permisos.html`.

**Cuando entregues `permisos-AAAA-MM-DD.json`:** se actualiza §4.3 mostrando **solo las diferencias** con los defaults, en tres grupos:
- **Configurado:** lo que trae la fila `usuarios` o el maestro de Rendiciones y cambia algo respecto del default (por ejemplo, Michelle con Nóminas en "editar").
- **Regla fija en el código:** no se configura y el archivo no lo trae. Por ejemplo: V°B° de nóminas por nombre, aprobación final por rol admin, admin = acceso total, consulta con tope "ver" (en la rama).
- **Configurado sin efecto:** se guarda pero el código no lo usa. Por ejemplo: `cadenaAprobacion`, la pestaña `params` en `main` y las pestañas de Allegria en `main`.

Si quieres trabajar con los usuarios reales sin compartir el respaldo completo, la misma extracción local podría producir un archivo solo con los campos de permisos: nombre, rol, módulos, pestañas y marcas, sin PIN ni correos. Ya está hecho: §4.5.

### 4.6 Permisos reales (archivo saneado del 08-10-2026): solo diferencias con los defaults

Fuente: `permisos-2026-10-08.json`, generado con el extractor desde la fila `usuarios` de producción. **No se guarda en la rama.** Contiene 22 personas: las 6 de los defaults y 16 más. Abajo, "efecto" es el comportamiento del código de `main` (3a9d33e) con esa configuración [Seguro por lectura del código; no probado en producción].

**A. Configurado distinto del default, con efecto**

| Persona | Configuración real | Efecto hoy en `main` |
|---|---|---|
| Milagros Becerra | Módulos tareas, **finanzas** y **osiris**. Finanzas: bancos y **nóminas en "editar"**. Osiris: todo "editar". Tareas: **config "editar"** | Ve y **prepara nóminas**, carga saldos bancarios, edita Osiris y **edita la configuración de Tareas**. Con `rendVerTodas`, también **marca rendiciones pagadas** |
| Carol Machuca | Finanzas: bancos y nóminas "editar"; **flujo, créditos, dashboard, reporte, parámetros y EEFF en "sin acceso"**. Tareas: config "editar" | Prepara nóminas **y da su V°B°** (está fija por nombre). **No ve el flujo de caja**: el default suponía acceso completo |
| Michelle Garcia | Finanzas: bancos "editar", **nóminas "ver"**. **Frisku**: maestros, programa, embarques y liquidaciones "ver". Tareas: config "editar" | **No puede dar el V°B° de nóminas**: el código exige "editar" en la pestaña. En la práctica, el único V°B° posible es el de Carol |
| Pablo Duran | Finanzas: bancos "editar", nóminas "ver". Tareas: config "editar" | Carga saldos bancarios y ve nóminas |
| Lucía Corbetto (rol **consulta**, socia) | Ve casi todo. **Flujo en "editar"**. Rendiciones sin configurar | En `main` **edita el flujo de caja**: Finanzas no aplica el rol consulta. Además ve nóminas (sueldos), bancos y créditos. Es **aprobadora asignada** de las rendiciones de Lorena Pinto y Nicolás Fuenzalida |
| Cristobal Ortiz (rol **consulta**, socio) | Finanzas casi todo "ver"; rendiciones sin configurar | Solo lectura en lo financiero. Ve nóminas |
| Raimundo Valenzuela (CEO Frisku) | Frisku: clientes, contratos, dashboard y exportadoras "editar"; las demás pestañas de Frisku sin configurar. Finanzas: bancos "ver", **rendiciones "editar"**. Empresas: Frisku Foods y Frisku Foods Perú | Edita todo Frisku (lo no configurado queda en "editar"). Es aprobador asignado de 3 personas |
| Carolina Lara, Denise Piaget, José Tomás Silva | Frisku **sin ninguna pestaña configurada** | Editan **todo** Frisku, incluidas liquidaciones, por el default "editar" (pregunta 6) |
| Lorena Pinto (Comercial Osiris) | Osiris todo "ver" | Solo lectura en Osiris |
| Otras 9 personas (operaciones y campo) | Solo rendiciones "ver" | Cargan sus propias rendiciones. Una está desactivada |
| Aprobadores de rendiciones (`config.aprobadores`) | 22 asignaciones. Angelo aprueba a 12. Marcos Gaete aprueba a 4; Raimundo Valenzuela, a 3 de Frisku. **Lucía Corbetto (consulta) aprueba a Lorena Pinto y Nicolás Fuenzalida**. Las rendiciones de **Angelo las aprueba Carol** | Es la única configuración de aprobación que funciona |

**B. Reglas fijas en el código (no se configuran)**
- V°B° de nóminas: Carol Machuca y Michelle Garcia, por nombre, y además deben tener nóminas en "editar".
- Aprobación final de nóminas: rol admin, es decir, solo Angelo.
- El rol admin tiene acceso total en todo.
- La pestaña Auditoría de Finanzas es solo para el admin.
- El gerente técnico edita todo Osiris.
- Marcar pagada: en `main` lo hace todo `rendVerTodas` + admin; en la rama, solo admin/CFO.
- En la rama, el rol consulta tiene tope "ver" en Finanzas.

**C. Configurado pero sin efecto**
- `cadenaAprobacion`: está en 18 personas y el código no la usa. Casi siempre repite al aprobador del maestro. Discrepa en Jose Tomas Reyes (desactivado: cadena a Gaston Bejares, sin aprobador asignado) y Lorena Pinto (sin cadena; aprobadora asignada, Lucía Corbetto).
- Auditoría en "ver" para Cristobal Ortiz: la pestaña es solo del admin.
- Parámetros configurado ("sin acceso" o "ver") en todos: en `main` no tiene efecto; en la rama sí.
- Las pestañas de Allegria de Lucía y Cristobal ("ver"): en `main` no se aplican, pero no cambia nada porque el rol consulta ya no edita Allegria.

**D. Lo que el conjunto preparado cambiaría con estos datos reales (por eso no se integra todavía)**

| Cambio del conjunto | A quién afecta | ¿Contradice algo configurado? |
|---|---|---|
| Consulta con tope "ver" en Finanzas | **Lucía Corbetto pierde la edición del flujo**, que tiene configurada explícitamente en "editar" | **Sí**: choca el rol consulta con una pestaña configurada. Decisión tuya |
| Consulta no aprueba rendiciones | **Lucía Corbetto no podría aprobar las rendiciones de Lorena Pinto y Nicolás Fuenzalida**: quedarían sin aprobador efectivo, salvo admin/CFO | **Sí**: choca con una asignación explícita. Bloquearía un flujo legítimo |
| Parámetros respeta su pestaña | Lucía deja de ver Parámetros (configurado "sin acceso", con flujo en "editar"). Nadie más cambia | No: aplica lo configurado |
| Marcar pagada solo admin/CFO | Milagros, Carol, Michelle y Pablo dejan de pagar | No hay autorización explícita; es la pregunta 1 |
| Allegria respeta pestañas | Nadie: los únicos con restricciones son los dos de consulta, que ya no editaban | No |

**Ajuste a las preguntas de §4.3 con datos reales:**
- **1. Marcar pagada:** hoy pagan Angelo, Milagros, Carol, Michelle y Pablo.
- **2. Aprobación de rendiciones:** decidir si el rol consulta puede ser aprobador asignado (caso Lucía Corbetto) o si sus dos rendiciones asignadas pasan a otra persona.
- **4. Nóminas:**
  - Preparan Milagros, Carol y Angelo.
  - Solo Carol puede dar el V°B° (Michelle tiene "ver").
  - Solo Angelo aprueba al final.
  - Carol puede preparar y dar el V°B° a la misma nómina.
  - Lucía y Cristobal (consulta) ven las nóminas.
- **5. Consulta:** Lucía y Cristobal tienen aprobador asignado, así que **sí cargan rendiciones propias**. Hoy su nivel de Rendiciones queda en "editar" por no estar configurado.
- **6. Pestañas sin configurar:** en Frisku afectan a 4 personas, que hoy editan liquidaciones sin configuración explícita. Tareas › config está en "editar" para Milagros, Carol, Michelle y Pablo.

### 4.7 Propuesta: perfil + facultades explícitas (no implementada; reemplaza el conjunto preparado)

El conjunto preparado **no se integra**. El bloqueo global del rol consulta no representa la operación (§4.6 D).

**Modelo propuesto, en dos capas que no se mezclan:**
1. **Perfil** (rol + módulos + nivel por pestaña): permisos generales de ver y editar. El rol consulta queda en "ver" por defecto.
2. **Facultades explícitas por persona**: una lista cerrada de acciones concretas. Cada facultad autoriza **solo esa acción**: no da edición del módulo ni otras facultades, y la edición del módulo tampoco la da.

| Facultad | Qué permite | Qué NO permite | Origen |
|---|---|---|---|
| Aprobar rendiciones asignadas | Aprobar, rechazar o devolver las rendiciones donde la persona es la aprobadora asignada | Ver las de otros, pagar, editar Finanzas | La asignación en el maestro de Rendiciones (ya existe); vale para cualquier rol, incluido consulta |
| Marcar rendición pagada | Marcar como pagada una rendición aprobada y ver la lista "por pagar" | Aprobar, editar rendiciones, ver Finanzas | Nueva marca por persona, la asigna el admin |
| Ver todas las rendiciones | Lectura de todas | Aprobar, pagar | `rendVerTodas` (ya existe) |
| V°B° de nóminas | Ver nóminas en revisión, dar V°B° o devolver con comentario | Editar líneas o montos, preparar | Nueva marca; reemplaza la lista fija por nombre. **No requiere "editar" en la pestaña** |
| Aprobación final de nóminas | Aprobar al final o devolver | Editar, preparar | Nueva marca; hoy es el rol admin |
| Ver sueldos | Ver las nóminas (las líneas de remuneraciones) | Editar | La pestaña Nóminas en "ver" o "editar"; lista a confirmar |
| Excepción de pestaña para consulta | Una pestaña concreta en "editar" pese al rol consulta | Ninguna otra pestaña ni facultad | El nivel configurado en esa pestaña, marcado como excepción |

**Precedencia:** facultad explícita > perfil. El rol consulta pone el tope en "ver", **salvo** en una pestaña configurada explícitamente en "editar" (excepción) y en las facultades asignadas. Ninguna excepción se infiere: debe estar configurada, y se muestra como tal en Gestión de Usuarios.

**Lucía Corbetto con este modelo:** conserva exactamente lo de hoy.
- **Perfil:** consulta, todo en "ver".
- **Excepción de pestaña:** flujo en "editar", tal como está configurado.
- **Facultad:** aprobar las rendiciones asignadas de Lorena Pinto y Nicolás Fuenzalida, por la asignación del maestro.
- **No gana nada.** Sigue sin pagar, sin ver todas las rendiciones, sin V°B° y sin editar créditos, bancos ni nóminas.
- **Única diferencia con `main`:** Parámetros está configurado "sin acceso". En `main` lo puede editar porque esa pestaña no se aplica; en la propuesta se respeta lo configurado. Confírmalo.

**Nóminas por versión:**
- Cada nómina tiene un **número de versión**. Cualquier cambio relevante de §4.4 la sube.
- Cada versión guarda sus **autores**: quien la preparó más quien la modificó (requiere registrar autor por cambio, hoy inexistente).
- El V°B° y la aprobación final se registran **contra una versión**. Si la versión cambia, quedan invalidados (en el historial) y la nómina vuelve a revisión.
- Nadie da V°B° ni aprobación final a una versión de la que es autor.
- Si una misma persona puede dar el V°B° y la aprobación final de la misma versión: **pendiente de tu decisión**.

**Servidor (trabajo separado):** esta matriz es la especificación que después debe comprobar el servidor (RLS o API con sesión, §5). Implementarla en la app no la protege. Los dos trabajos se mantienen separados.

### 4.8 Frisku: personas sin configuración y acceso efectivo por pestaña (código de `main`)

Pestañas que se ven: Resumen, Documentos, Contratos, Programa, Embarques, Liquidaciones, Reportería BI y Maestros + TC (incluye Clientes y Exportadoras).
- **Resumen, Documentos y Reportería BI no se pueden configurar** en Gestión de Usuarios: quedan visibles y, salvo rol consulta, en "editar".
- La clave "dashboard" sí se configura, pero **no tiene efecto**.

**Tres o cuatro personas.** **Tres** personas no tienen ninguna pestaña de Frisku configurada. Una **cuarta** (Raimundo Valenzuela) tiene configuradas solo 4 de 8 claves; las otras 4 quedan en "editar" por defecto. Por eso dije "tres" en el chat y "cuatro" en §4.6.

| Persona | Contratos | Programa | Embarques | Liquidaciones | Maestros (clientes, exportadoras) | Resumen / Documentos / BI | Origen |
|---|---|---|---|---|---|---|---|
| Carolina Lara | Editar | Editar | Editar | Editar | Editar | Ver/editar | Todo por defecto |
| Denise Piaget | Editar | Editar | Editar | Editar | Editar | Ver/editar | Todo por defecto |
| José Tomás Silva | Editar | Editar | Editar | Editar | Editar | Ver/editar | Todo por defecto |
| Raimundo Valenzuela | Editar (configurado) | Editar (por defecto) | Editar (por defecto) | Editar (por defecto) | Clientes y exportadoras configurados; maestros por defecto | Ver/editar | Mixto |
| Michelle Garcia (referencia) | Sin acceso | Ver | Ver | Ver | Maestros "ver"; clientes y exportadoras "sin acceso" | **Visibles: no se pueden restringir** | Configurado |

Hallazgo: Documentos muestra a quien tenga el módulo los clientes y exportadoras con documentos faltantes, aunque tenga Clientes en "sin acceso" (caso Michelle). No se cambia nada: es información para tu decisión.

### 4.9 Tabla única de decisiones (confirmada el 08-10-2026; implementación en §4.10, sueldos en §4.11)

"Hoy" = configuración real + reglas del código de `main`. Nada de esto está implementado.

| # | Facultad | Hoy (real) | Propuesta | Tú confirmas |
|---|---|---|---|---|
| 1 | Marcar rendiciones pagadas | Angelo, Milagros, Carol, Michelle, Pablo | Facultad explícita por persona | **Responsables de pago** |
| 2 | Ver todas las rendiciones | Angelo, Milagros, Carol, Michelle, Pablo | Sin cambio (`rendVerTodas`) | Si se mantiene la lista |
| 3 | Aprobar rendiciones asignadas | Según el maestro: Angelo (12), Marcos Gaete (4), Raimundo Valenzuela (3), Lucía Corbetto (2), Carol (las de Angelo), Cristopher Martinez (1) | Conservar todas, incluida Lucía (consulta), como facultad por asignación | Que la asignación a un usuario consulta es válida |
| 4 | Editar el flujo de caja (Lucía, consulta) | Sí, configurado | Excepción explícita de pestaña; Parámetros queda "sin acceso", como está configurado | Excepción y Parámetros |
| 5 | Preparar nóminas | Angelo, Carol, Milagros | Sin cambio | Lista |
| 6 | V°B° de nóminas | Solo Carol en la práctica (Michelle, por nombre, tiene "ver") | Facultad explícita, sin requerir "editar"; nunca sobre una versión propia | **Titulares y reemplazo de V°B°** |
| 7 | Aprobación final de nóminas | Angelo (rol admin) | Facultad explícita; nunca sobre una versión propia | Titular, reemplazo y si puede coincidir con el V°B° |
| 8 | Ver nóminas (sueldos) | Angelo, Carol, Milagros (editar); Michelle, Pablo, Lucía, Cristobal (ver) | Solo quien confirmes | **Quiénes ven sueldos** |
| 9 | Editar Contabilidad | Solo Angelo (por un error de código) | Michelle y Pablo, según la matriz borrador | Lista |
| 10 | Editar liquidaciones Frisku | Raimundo, Carolina, Denise, José Tomás (todos por defecto) + Angelo | Configurar explícito lo que corresponda | **Responsables de liquidaciones** |
| 11 | Otras pestañas Frisku sin configurar | Ver §4.8 | Configurar explícito; sin cambios automáticos | Por persona |
| 12 | Editar la configuración de Tareas | Milagros, Carol, Michelle, Pablo (configurado) + Angelo | Sin cambio | Si se mantiene |
| 13 | Excepciones de Nóminas (autoaprobación) | No existen | Solo con tu autorización por nómina, registrada | Quién puede autorizarlas |

### 4.10 Matriz confirmada (08-10-2026): implementación

> **Actualizado en la segunda entrega:**
> - Las facultades ya no van en la ficha de `usuarios`: van en la fila `permisos_facultades` (§4.12).
> - El aplicador suma remuneraciones y la decisión de Frisku: 13 cambios, 14 reglas que ya se cumplen y 11 nombres verificados.
> - El orden de despliegue de C quedó reemplazado por la transición de §4.12 D.

Commits `fe9470f`, `2f9da34` y el del extractor. **Control de la aplicación, no del servidor** (§5).

**A. Qué cambia en el código** [Seguro, por prueba]

| Tema | Regla implementada | Dónde |
|---|---|---|
| Perfil | Lo configurado se respeta para todos los roles. Lo no configurado: consulta → "ver"; los demás roles, igual que antes. Se retira el tope global del rol consulta | `permisosCore.getTabPerm` |
| Pestañas existentes | Conservan el acceso actual aunque no estén configuradas: la lista explícita `TABS_REGISTRADAS` las registra **antes** de aplicar el nuevo valor por defecto | `permisosCore.TABS_REGISTRADAS` |
| Pestañas nuevas | Una pestaña que no esté en esa lista nace **sin acceso para todos, incluido admin**, hasta que se le asigne un nivel | `getTabPerm`, merge de usuarios, `FinanzasModule.perm`, `FriskuComercialModule.permTab` |
| Rendiciones · pagar | Solo con la facultad `rendPagar === true` y solo sobre rendiciones aprobadas. **Admin y CFO ya no pagan por su rol.** La pestaña Pagos se ve con la facultad o con "ver todas" | `acciones.puedeMarcarPagada`, `RendicionesModule` |
| Rendiciones · ver todas | Sin cambio (`admin`, `esCFO`, `rendVerTodas`). Los datos reales ya coinciden con la matriz | — |
| Rendiciones · aprobar | El aprobador asignado en el maestro aprueba aunque su perfil sea consulta (Lucía). Las demás asignaciones no se tocan | `acciones.puedeAprobarRendicion` |
| Contabilidad | Edita quien tiene `contabEditar === true`. El CFO sigue editando por `esCFO`, como antes | `App.jsx` |
| Lucía | Flujo "editar" y Parámetros "sin acceso", tal como están configurados. No gana ninguna otra facultad | sin código propio: lo resuelve la regla de perfil |
| Frisku · Liquidaciones | Sin acceso a la pestaña, `frisku_liquidaciones` y `frisku_po` **no se piden ni se guardan**. Así, ni el detalle de embarque (pierde la sección Liquidación), ni el Resumen (sin la alerta), ni Reportería BI y sus exportaciones pueden mostrarlas. BI avisa que los montos aparecen en cero | `FriskuComercialModule` |
| Tareas · Configuración | Sin cambio de código: los cinco ya la tienen en "editar"; Angelo, por admin | — |
| Nóminas | Sin cambio: preparan Angelo, Carol y Milagros (ya configurado); V°B° y aprobación final como hoy | — |

**B. Aplicador de la matriz** (⚙️ Permisos → "Matriz de permisos confirmada")
- Primero muestra una **vista previa**: qué cambia (persona, correo, antes → después), qué ya se cumple y a quién no pudo identificar. Solo aplica con tu confirmación, y deja cada cambio en la auditoría.
- **Identidad = correo.** Para las 5 personas cuyo correo está en el código, se exige que correo y nombre coincidan. Para las otras 5, la matriz trae el nombre tal como figura en el archivo autorizado: debe existir **una sola** persona activa con ese nombre completo y con correo; ese correo se muestra en la vista previa. Si alguien queda sin identificar, **no se aplica nada**.
- "José Tomás Silva" y "Jose Tomas Reyes Guevara" (desactivado) son personas distintas: la comparación es por nombre completo, nunca por prefijo.
- Verificado **localmente** contra el archivo autorizado, sin subirlo:
  - los 10 nombres se resuelven sin ambigüedad;
  - resultado: **10 cambios, 12 reglas que ya se cumplen, 0 sin identificar**.
- Los 10 cambios:

| Persona | Cambio |
|---|---|
| Carol Machuca, Milagros Becerra, Angelo Huerta | marca rendiciones pagadas: no → sí |
| Angelo Huerta, Michelle Garcia, Pablo Duran | edita Contabilidad: no → sí |
| Raimundo Valenzuela, Carolina Lara | Frisku Liquidaciones: sin configurar (editaban por defecto) → "editar" explícito |
| Denise Piaget, José Tomás Silva | Frisku Liquidaciones: sin configurar → "sin acceso" |

- Las 12 que ya se cumplen: "ver todas las rendiciones" (4), Lucía Flujo y Parámetros (2), Nóminas "editar" de Carol y Milagros (2) y Configuración de Tareas (4).
- En el panel se agregaron las casillas "Marca rendiciones pagadas" y "Edita en Contabilidad", con registro de auditoría. Las facultades valen solo si están guardadas como `true`.

**C. Orden de despliegue:** reemplazado por §4.12 D. Ya no queda ningún periodo sin pagos.

**D. Evidencia** (todo local: build de la rama, Supabase falso, datos ficticios, solo Chromium)

| Prueba | Qué comprueba | Resultado | Contra el código anterior |
|---|---|---|---|
| `permisosAcciones.test.js` | Pagar con y sin facultad, admin/CFO sin facultad, valor no booleano, estado no aprobado (llamada directa); aprobar asignado como consulta y no asignado | 26/26 | 3 fallan |
| `rendicionesPermisosPantalla.test.js` | Pantalla real: quién ve "Marcar pagada" y "Aprobar", qué se guarda | 9/9 | 4 fallan |
| `matrizPermisos.test.js` (nuevo) | Pestañas registradas y nuevas, consulta con excepción, plan y aplicación de la matriz, identidad (correo distinto, nombre repetido, sin correo, prefijo), idempotencia | 15/15 | 5 fallan |
| `friskuLiquidacionesAcceso.test.js` (nuevo) | Sin acceso: no se piden ni se guardan liquidaciones ni PO, sin pestaña, sin alerta, aviso en BI, montos ausentes del documento. Con acceso: se cargan | 3/3 | 1 falla (el caso restringido) |
| jest completo (UTC y `npm run test:cl`) | Todo lo demás sigue igual | 1.783/1.783 en ambos | — |
| `scripts/e2e/permisos.mjs` (navegador) | Lucía edita Flujo y no ve Parámetros; consulta sin configurar no edita Flujo; Michelle edita Contabilidad y Carol no; el aplicador muestra vista previa, guarda en `usuarios` y es idempotente | **30/30** | Fallan Lucía-Flujo y Michelle-Contabilidad; el aplicador no existe |
| `prueba-extractor-permisos.mjs` | El extractor exporta también `rendPagar` y `contabEditar` | 12/12 | — |

**E. Verificado sobre `main` vigente** [Seguro, local]
- El conjunto se armó sobre `3fd03d9` en un worktree aparte, sin tocar `main` ni la rama.
- Archivos: permisos de `3302695`, `1059b1c` y `fe9470f`.
- Conflicto único: el bloque de Contabilidad en `App.jsx`. `main` no tiene el ErrorBoundary, así que se aplicó a mano solo `canEdit={usuarioFresco?.contabEditar === true}`.
- Resultado: build `CI=true` OK; jest 1.758/1.758; e2e de permisos 30/30.
- No se integró `main` en la rama: el choque de saldos (`92d9f0d`, `3fd03d9`) con el trabajo de TC queda fuera de este alcance.

**F. Limitaciones**
- **Servidor:** la llave pública sigue leyendo y escribiendo todas las filas. Esto incluye `frisku_liquidaciones`, `frisku_po`, `usuarios` (con sus facultades) y `pins`. Quien abra las herramientas del navegador o llame a la API directamente no está limitado por nada de esto.
- **Frisku:** decidido el 08-10. Michelle Garcia y Lucía Corbetto conservan la consulta sin edición; la matriz las verifica en "ver".
- **Frisku · Documentos:** sigue mostrando clientes con documentos faltantes a quien tenga Clientes en "sin acceso" (hallazgo §4.8, sin cambio).
- **Pagos:** quien tiene la facultad de pagar pero no "ver todas" ve la lista de rendiciones aprobadas por pagar: nombre, monto y respaldos. Es lo mínimo para pagar.
- **Prueba de Lucía en navegador:** usa un usuario ficticio con su configuración, no su ficha real.

### 4.11 Remuneraciones separadas (decisión del 08-10-2026): implementación

**A. Qué se implementó** [Seguro, por prueba]

| Regla decidida | Implementación |
|---|---|
| Remuneración = sueldos, anticipos, descuentos, bonos y finiquitos; honorarios siguen como proveedores | Cada línea lleva `clase` de esa lista cerrada; no se envía a aprobación sin clase, trabajador y monto (`src/remuneraciones/modelo.js`) |
| Solo Angelo, Lucía y Cristobal ven el detalle y sus respaldos | Facultades `remPreparar` (Angelo) y `remAprobar` (Lucía, Cristobal) en la fila de facultades. El rol admin **no** las da |
| Fila separada, que no llegue a navegadores sin autorización | `nominas_remuneraciones` se pide **solo** desde la pantalla de quien tiene la facultad (`src/RemuneracionesNomina.jsx`). Comprobado en navegador: el de Carol y el de Michelle nunca la piden |
| Angelo prepara; Lucía **o** Cristobal aprueban; sin V°B° | borrador → preparada → aprobada. Devolver exige motivo y vuelve a borrador; anular exige motivo. Quien prepara o editó no aprueba. Cada guarda se revisa dentro de la acción |
| Respaldos | Se suben al bucket privado `nominas-docs` con el prefijo `remuneraciones/` y se abren con URL firmada |
| Exportación | CSV de cada nómina y del listado de revisión, solo dentro de la pantalla restringida |
| Nóminas no salariales sin cambios | Carol y Milagros siguen igual. Las líneas **nuevas** de la nómina general ya no pueden ir a "Anticipos de Sueldo" ni llevar el tipo "Remuneraciones" |
| Totales agregados en Flujo y Contabilidad | Sin cambios: siguen visibles según los permisos existentes |

**B. Registros existentes: listado, sin reclasificar solos**
- **Candidatas:** líneas antiguas de la nómina general en la sección "Anticipos de Sueldo", con tipo "Remuneraciones", en una sección libre con nombre salarial, o con palabras como sueldo, remuneración, finiquito, bono, gratificación, aguinaldo, indemnización, anticipo o descuento. "Boleta de Honorarios" sola no cuenta.
- **No se asume que sean no salariales.** Hasta que se decidan, quien no tiene la facultad no las ve en pantalla, totales, búsquedas, impresiones, exportación ni expediente: se calculan desde la misma vista.
  - Ve un aviso con la **cantidad**, sin montos.
  - Al guardar la nómina se reponen en la base: comprobado en navegador.
- **Revisión** (Nómina de remuneraciones → Revisión de registros existentes): Angelo decide cada línea. El listado se exporta a CSV.
  - **Trasladar** (eligiendo la clase), en dos pasos:
    1. Se copia la línea completa, con historial y respaldos, a la fila de remuneraciones y se confirma en el servidor.
    2. Recién entonces, en la nómina general queda un rastro sin montos, nombres ni documentos.
  - Si el paso 2 se interrumpe, la línea aparece como «ya copiada» con un botón para completar, sin duplicar.
  - **No es remuneración:** queda registrado quién y cuándo, y la línea vuelve a la vista normal.
- **Auditoría:** el traslado y la clasificación se registran sin montos ni nombres de trabajadores.
- **Cuántas hay en producción:** no lo sé. El archivo de permisos no trae nóminas, así que el listado se verá en la app al desplegar.

**C. Efectos que tienes que conocer**
- **Nóminas ya aprobadas:** al trasladar una línea, el total visible de esa nómina general baja en ese monto. La aprobación original queda en su historial y la línea en la fila de remuneraciones, como "histórica", con su origen.
- **Líneas antiguas con palabras ambiguas** ("anticipo a proveedor", "descuento comercial") quedan ocultas a Carol y Milagros hasta tu revisión. Es el costo de no asumir que no son salariales.
- **Mientras no se aplique la matriz** (§4.12 D), nadie ve remuneraciones, ni siquiera Angelo. La fila nueva parte vacía, así que esto no frena pagos.

**D. Evidencia** (local, Supabase falso, datos ficticios, solo Chromium)

| Prueba | Qué comprueba | Resultado |
|---|---|---|
| `remuneracionesModelo.test.js` (nuevo) | Acceso, circuito completo con Lucía y con Cristobal, autor no aprueba, devolver/anular con motivo, candidatas, vista sin facultad, reposición al guardar, traslado idempotente, rastro sin montos, CSV | 16/16 |
| `scripts/e2e/remuneraciones.mjs` (nuevo, navegador) | Recorrido completo; detalle en §4.11 E | **33/33** en la rama y sobre `main` |
| Control: el mismo e2e contra el build anterior (`28bb0df`) | Carol veía «Juan Pérez» y los montos, y el total los incluía; el panel no existía | Falla, como corresponde |

**E. Recorrido del e2e de remuneraciones**
1. Carol: ve el aviso y no ve nombres ni montos, tampoco en los campos editables. El total no los incluye. Agrega una línea y las ocultas siguen en la base. Su navegador nunca pide la fila de remuneraciones.
2. Angelo: aplica la matriz; activa, revierte y reactiva la regla de pago; revisa los registros existentes y traslada 2 líneas. La nómina general queda sin el detalle y la auditoría sin montos. Prepara y envía una nómina nueva, y no puede aprobarla.
3. Lucía aprueba esa nómina; Cristobal aprueba otra.
4. Al final, Carol y Michelle no tienen acceso.

**F. Limitaciones, sin maquillaje**
- **Servidor:** la llave pública lee y escribe `nominas_remuneraciones`, `nominas`, `permisos_facultades` y el bucket de respaldos. **No hay confidencialidad frente a acceso directo** hasta tener autorización en el servidor (§5).
- **Canal de tiempo real sin filtro (hallazgo nuevo):**
  - `App.jsx` (cualquier usuario con sesión) y `FinanzasModule.jsx` se suscriben a `realtime:public:calendario_data` **sin filtro de fila**.
  - Si el Realtime de producción publica esa tabla, cada navegador abierto recibe **completa** cada fila que cambie, incluidas `nominas_remuneraciones`, `nominas` y `frisku_liquidaciones`. No se muestra, pero llega a la memoria del navegador.
  - **No lo cambié:** no puedo probar el protocolo de Realtime de producción desde acá, y filtrar mal deja sin sincronización. Propuesta: suscripción por fila (`id=eq.main`, `id=eq.usuarios`, `id=eq.finanzas`), o canal autorizado en el servidor. Queda como decisión D13.
- **Líneas pendientes de clasificar:** se ocultan en pantalla, pero **siguen en la fila `nominas`, que sí llega al navegador** de quien prepara nóminas. Solo el traslado saca el detalle de esa fila.
- **Respaldos trasladados:** el archivo sigue en el bucket en su ruta original (`nominas/...`). Lo que se traslada es la referencia. En la app ya no se llega a él desde la nómina general.
- **Historial de auditoría anterior:** el `audit_log` ya registró, antes de este cambio, ediciones de líneas de anticipos con nombres y montos. No se modificó: el historial no se reescribe.
- **Consultas de todas las filas** (respaldo manual y resumen diario): las ejecuta solo el rol admin, hoy solo Angelo. Otro admin traería todas las filas, incluidas las de remuneraciones.
- **Vale interno de anticipo:** el documento interno autogenerado de "Anticipos de Sueldo" no se trasladó a la nueva pantalla. En remuneraciones, el respaldo se sube como archivo.

### 4.12 Facultades en fila propia y transición de permisos sin periodo sin pagos

**A. Por qué cambió** [Seguro, por lectura del código de `main` 3fd03d9]
- `main` reconstruye la ficha de los usuarios base (`...wb` más una lista cerrada de campos) y la guarda al iniciar sesión.
- Si las facultades vivieran en la ficha, bastaría abrir la versión anterior (rollback) para borrarlas. Al volver a la nueva, nadie podría pagar.
- La fila `permisos_facultades` (por correo) no la toca ninguna versión anterior.

**B. Modelo** (`src/permisos/facultades.js`)
- Facultades: `rendPagar`, `contabEditar`, `remPreparar`, `remAprobar`. Solo cuentan si están en la fila como `true`; lo que diga la ficha se ignora.
- La fila se lee con el contrato de persistencia: la carga lanza ante un fallo de red (Regla 9) y el guardado lo confirma el servidor.
- Si la fila no se pudo leer, la sesión queda sin facultades y nadie paga (falla cerrada). El panel lo avisa.
- Casillas por persona en ⚙️ Permisos, con auditoría. Sin correo no hay facultad.

**C. Regla de pago con modo**

| Modo | Quién marca pagada (solo rendiciones aprobadas) | Cuándo |
|---|---|---|
| transición | Quien ve todas: admin, CFO o `rendVerTodas`. **Es exactamente la regla publicada hoy**: no amplía nada | Fila inexistente o recién creada |
| matriz | Solo `rendPagar`: Carol, Milagros y Angelo | Lo activa el admin. **No se puede activar si ninguna persona activa tiene la facultad** |

Volver a transición exige motivo, y cada cambio de modo queda en el historial de la fila.

**D. Pasos de transición** (cuando autorices el despliegue)
1. **Desplegar.** La fila de facultades no existe, así que rige la transición: pagan los mismos que hoy.
   - Contabilidad sigue como hoy (edita solo el CFO).
   - Denise y José Tomás siguen viendo Liquidaciones hasta el paso 2.
   - Remuneraciones: nadie las ve todavía.
2. **⚙️ Permisos → Ver vista previa → Aplicar** (13 cambios con los datos reales). Primero se guarda la fila de facultades, confirmada por el servidor; después la ficha de usuarios.
   - Pagos: siguen pagando los mismos.
   - Desde aquí: Michelle y Pablo editan Contabilidad, Angelo, Lucía y Cristobal entran a remuneraciones, y Denise y José Tomás pierden Liquidaciones.
3. **Ver vista previa otra vez:** debe decir 0 cambios. Si un paso falló, ahí aparece lo que falta.
4. **Activar regla de la matriz.** Desde este momento pagan solo Carol, Milagros y Angelo.
5. **Revisión de registros existentes** de remuneraciones (§4.11 B).

**Reversa:**
- Del paso 4: "Volver a la regla de transición", con motivo.
- De código (volver a `main`): `main` ignora la fila de facultades y paga con su regla. Al volver a desplegar, la fila sigue intacta y no queda ningún periodo sin pagos.
- Antes de un rollback de código conviene volver primero a transición, para que el historial lo refleje. No es obligatorio.

**E. Evidencia**

| Prueba | Qué comprueba | Resultado | Contra `28bb0df` |
|---|---|---|---|
| `facultades.test.js` (nuevo) | Identidad por correo, ficha ignorada, falla cerrada, pasos 1-3 sin periodo sin pagos, no activar sin pagadores, reversa con motivo, persistencia que lanza | 13/13 | no existía |
| `permisosAcciones.test.js` | Modo matriz, modo transición, falla cerrada, llamadas directas | 29/29 | 3 fallan |
| `rendicionesPermisosPantalla.test.js` | Pantalla: transición (Michelle paga como hoy), matriz, falla cerrada | 11/11 | 2 fallan |
| `matrizPermisos.test.js` | Plan 13/14, facultades en la fila y no en la ficha, idempotencia (0 cambios, 27 cumplen) | 15/15 | — |
| `scripts/e2e/permisos.mjs` | Además: la casilla de Contabilidad de la ficha se ignora y vale la de la fila; aplicar no activa | **31/31** (rama y `main`) | — |
| `scripts/e2e/remuneraciones.mjs` | Aplicar, activar, revertir con motivo y reactivar, sobre la fila real del Supabase falso | incluido en 33/33 | — |
| Extractor de permisos | Exporta la regla de pago y las facultades de la fila, por nombre | 13/13 | — |

### 4.13 Frisku sin acceso a Liquidaciones: «restringido», nunca cero

- **Motor BI** (`friskuBI.js`): sin acceso, las métricas de dinero (venta destino, comisión cliente, comisión Frisku y %) valen `null` y se muestran «restringido».
  - Quedan fuera de los selectores de medidas, de los KPIs fijos y de las columnas de tablas, pivotes y desgloses.
  - El dinero de cada contenedor es desconocido (`null`), no cero.
- **Resumen ejecutivo:** los tres paneles de comisión se reemplazan por un aviso «Restringido».
  - El Excel omite las columnas de dinero.
  - El PDF reemplaza las tablas de comisión por una línea «restringido».
- **Tablero:** desaparecen las fuentes Liquidaciones y Cobranza (PO).
- **Reportes:** se omiten Ingreso, Rentabilidad, Ranking de exportadoras y Cobranza, con una línea que los nombra como restringidos. Quedan Programa vs Real y Pipeline, y la exportación solo corre para un reporte permitido.
- **Evidencia:** `friskuLiquidacionesAcceso.test.js`, 3/3.
  - Sin acceso: en Resumen, Reportes y Análisis no aparece ningún «$0», ni las medidas de dinero, ni los reportes de dinero.
  - Con acceso: se ven los paneles de comisión.
  - Contra `28bb0df`, el caso restringido falla (mostraba «$0»).
- **Limitación:** no reviso píxel a píxel cada gráfico del espacio de Análisis; la comprobación es sobre el texto de la página.

### 4.14 Tiempo real limitado a las filas autorizadas

**Antes** (código de `main`, también 0b86538):
- `App.jsx` abre un canal a `realtime:public:calendario_data` **sin filtro**, al cargar la página, antes de iniciar sesión.
- `FinanzasModule` abre otro igual.

**Ahora** (`src/realtime/filas.js`):
- Una suscripción **por fila**: `main` y `usuarios` con sesión iniciada, más `finanzas` dentro de Finanzas.
- Cada una pide el filtro en el tópico (`...:id=eq.<fila>`) y en `postgres_changes`.
- Cualquier registro de otra fila se descarta.

**Evidencia** (local, Chromium, Realtime **emulado**; `scripts/e2e/realtime-filas.mjs`, 8/8):

| Comprobación | Rama | `main` 0b86538 (control) |
|---|---|---|
| Canales abiertos sin sesión | ninguno | 1, sin filtro |
| Filas que recibe Carol | solo `usuarios` | `usuarios`, `finanzas`, `nominas_remuneraciones`, `frisku_liquidaciones`, `nominas` |
| Sincroniza `usuarios` (hub) y `finanzas` (Créditos) | sí | sí |

Pruebas unitarias: `realtimeFilas.test.js`, 4/4.

**Dependencia del servidor** [Seguro]:
- La emulación prueba qué pide el cliente, **no** que el Realtime real de Supabase respete el filtro. Eso no se puede comprobar desde acá.
- Aunque lo respete, con la llave pública cualquiera puede abrir un canal sin filtro desde fuera de la app.
- La protección efectiva exige autorización en el servidor:
  - Supabase Auth con sesión por persona;
  - RLS por fila en `calendario_data`, que Realtime aplica a `postgres_changes`;
  - sacar `nominas_remuneraciones` y `frisku_liquidaciones` del alcance de la llave pública.

**Transición comprobable, sin activar nada:**

| Paso | Qué se hace | Cómo se comprueba |
|---|---|---|
| 1 | Desplegar este cambio de cliente | Pestaña Red del navegador: solo tópicos con `id=eq.` |
| 2 | En un proyecto Supabase **de prueba**, activar RLS de solo lectura por rol sobre esas dos filas y confirmar que `postgres_changes` deja de entregarlas a la llave pública | Lo mismo que mide `realtime-filas.mjs`, pero contra el Realtime real |
| 3 | En producción, solo con tu aprobación y después de la consulta de metadatos | Igual que el paso 2 |

**Rollback:**
- Código: volver a `main` reabre el canal sin filtro, sin perder datos.
- Datos: no hay datos que revertir.

### 4.15 Clasificación explícita, versión aprobada y traslado

**Clasificación** (`src/remuneraciones/modelo.js`):

| Tipo | Cuándo | Efecto |
|---|---|---|
| **Explícita** | Sección «Anticipos de Sueldo» o tipo de documento «Remuneraciones» | Es remuneración. Quien no está autorizado ve **un** monto agregado de solo lectura por nómina, sin nombres ni documentos; el total no cambia |
| **Sugerencia por palabras** | Palabras como «anticipo», «descuento», «bono»; una sección con nombre salarial | Solo se lista para revisión. **No se oculta ni cambia ningún total.** «Anticipo a proveedor» y «descuento comercial» quedan como están |

- Confirmar «no es remuneración» en una sugerencia no pide motivo.
- Hacerlo en una explícita exige motivo y queda como rectificación visible.

**Por qué el agregado va en «Anticipos»** (hallazgo de la prueba de rollback):
- `main` solo suma en el total las líneas de secciones que conoce.
- Con una sección nueva, volver a `main` habría bajado el total de las nóminas aprobadas en silencio.
- **Costo:** dentro de la nómina, el subtotal de «Anticipos» incluye sueldos trasladados. El total general es correcto.

**Agregado por nómina, no por sección:** por sección, una sección con una sola línea mostraba ese monto individual. Aun así, **si una nómina tiene una sola remuneración, el agregado es su monto**, sin nombre. Decisión tuya: aceptarlo o no mostrar el total (lo que sí cambiaría el total visible).

**Traslado según el estado de la nómina de origen:**

| Origen | Qué pasa en la nómina general | Qué pasa en remuneraciones | Pago |
|---|---|---|---|
| Ya tramitada (preparada, revisión, V°B° o aprobada) | Estado y aprobación intactos. La línea queda como rastro sin montos ni documentos y su monto pasa al **agregado**: **el total aprobado no cambia**. Rectificación visible, sin montos, con la huella de la versión aprobada | Copia completa con historial y documentos, en una nómina «histórica». **Versión aprobada congelada**: copia de la nómina tal como estaba más su huella (FNV-1a sobre JSON canónico; identifica la versión, no es criptográfica) | Ya se pagó en la general. La histórica no se vuelve a pagar |
| Borrador | La línea sale, con una rectificación visible («pasa al circuito») | Nómina de remuneraciones en borrador: Angelo la envía y Lucía o Cristobal la aprueban | Solo por el circuito de remuneraciones |

En los dos casos no se duplica ni se omite ningún pago. La comprobación aritmética (e2e):
- **Aprobada:** 100.000 + 200.000 + 900.000 + 1.500.000 = **2.700.000** antes y después del traslado. El agregado suma 200.000 + 900.000 = 1.100.000.
- **Borrador:** 50.000 + 300.000 = 350.000 antes. Después, 50.000 en la general más 300.000 en remuneraciones = 350.000.

**Agregados de Flujo y Contabilidad:**
- Ninguno se calcula desde las nóminas: `dbLoadNominas` solo lo usa el módulo de Nóminas, y Contabilidad lee sus propias tablas.
- El e2e compara las cifras del Dashboard y de Flujo Empresas antes y después de los traslados: son idénticas.
- Los agregados de remuneraciones que ya había en el Flujo (líneas proyectadas) no se tocan.

**Documentos:**
- La referencia del respaldo viaja con la línea; el archivo no se mueve del bucket.
- La línea agregada no requiere respaldo: no cuenta para la cobertura ni para la validación, y nunca recibe un vale interno automático. Antes el sistema intentaba generárselo; el e2e lo detectó.

**Reversión de datos** (distinta del rollback de código):
1. Se marca la copia como revertida, con motivo; no se borra.
2. Se restaura la línea exactamente como estaba y se descuenta del agregado.

Si el paso 2 falla, la pantalla ofrece «Completar reversión». No se revierte una línea cuya nómina de remuneraciones esté en aprobación o aprobada.

**Evidencia:**
- `remuneracionesModelo.test.js`: 23/23.
- `scripts/e2e/remuneraciones.mjs`: **36/36**.
  - Carol ve el agregado y el total 2.700.000, sin nombres; la sugerencia sigue visible.
  - Guardar no pierde líneas.
  - Fallo de facultades con «Reintentar».
  - Traslados en los dos modos, con huella, rectificaciones y documentos.
  - Dashboard y Flujo sin cambios.
  - Circuito: Lucía aprueba lo que vino del borrador y Cristobal otra nómina; quien prepara no aprueba.
  - Reversión de datos.

### 4.16 Rollback de código, reversión de datos y recuperación

**Rollback de CÓDIGO a `main` 0b86538 después de trasladar** (`scripts/e2e/rollback-remuneraciones.mjs`, 9/9, misma base):

| Qué | Con `main` | Riesgo |
|---|---|---|
| Totales de nóminas aprobadas | Se conservan (2.700.000). El agregado aparece como una línea de «Anticipos de Sueldo» | Ninguno en una nómina aprobada (`main` no la deja editar). **En una nómina preparada o en revisión, `main` deja editar o inactivar la línea agregada** |
| Detalle restringido | No aparece: nombres y documentos no están en la fila `nominas` | — |
| Líneas que pasaron al circuito (borrador) | **No se ven**: `main` no tiene la pantalla de remuneraciones | **Un pago de remuneraciones pendiente queda fuera de la vista** hasta volver a la rama |
| Preparar o aprobar remuneraciones | No es posible | Hay que volver a la rama |
| Pagos de rendiciones | Rige la regla de `main`: Michelle, que ve todas, puede marcar pagada | Es el comportamiento publicado hoy |
| Datos (facultades, remuneraciones, nóminas, pestañas de Frisku) | `main` no los modificó | — |
| Volver a la rama | Regla de la matriz activa y los 3 traslados intactos | — |

**Antes de un rollback de código:**
1. Pasar la regla de pago a transición, con motivo.
2. Confirmar que no haya nóminas de remuneraciones en borrador o por aprobar.
3. Si hay, aprobarlas y pagarlas, o revertir sus traslados (reversión de datos).

**Si `permisos_facultades` no carga** (probado con la lectura fallando):
- Todos ven «No se pudo leer la configuración de permisos» con un botón **Reintentar**.
- Mientras tanto, nadie marca rendiciones pagadas ni usa facultades (Contabilidad, remuneraciones); el resto funciona.
- Recuperación:
  1. Reintentar.
  2. Si persiste, revisar la conexión.
  3. Si la base no responde, esperar o escalar.

  No hay atajo que habilite pagos sin la fila. **No es una transición sin interrupciones en todos los casos:** si la fila no se puede leer, los pagos se detienen hasta leerla.

**Transición temporal con salida explícita:**
- Mientras la regla esté en transición, el admin ve en el inicio «Regla de pago en transición (temporal)» con la salida: ⚙️ Permisos → aplicar → Activar regla de la matriz.
- Las restricciones de Frisku y los «restringido» se mantienen.

### 4.17 Verificación sobre el `main` vigente: bloqueo concreto

**`main` avanzó a 0b86538.** Entre 3fd03d9 y 0b86538:
- `FinanzasModule.jsx` cambió en unas 4.200 líneas: Créditos y el nuevo guardado de Nóminas.
- `NominasModule` pasó de 909 a 1.182 líneas, con guardado condicionado por `updated_at`, copia local de cambios no guardados y resolución de conflictos basada en `nominasRef`.

**Al aplicar el conjunto sobre 0b86538:**

| Parte | Resultado |
|---|---|
| Permisos, facultades, Frisku, Rendiciones, Allegria | Se aplican; el único conflicto es el bloque de Contabilidad de `App.jsx`, ya conocido |
| Tiempo real | Conflicto chico en `App.jsx` (el hub cambió) |
| Remuneraciones en `NominasModule` | **4 conflictos y un problema de fondo** |

**El problema de fondo:**
- El nuevo guardado de `main` trabaja sobre `nominasRef.current` en unos 20 puntos.
- Si alguno apunta a la vista saneada en vez de a los datos completos, **guardaría las nóminas sin las líneas ocultas**: pérdida de datos.
- Portarlo exige auditar los 33 usos de `nominas` del módulo nuevo y repetir los e2e de nóminas y remuneraciones sobre ese commit.

**Lo que necesito:** autorización para hacer esa integración en una rama aparte, o seguir sin ella hasta que decidas la integración. La verificación anterior (build, jest y e2e 30/30 y 33/33) **vale solo para 3fd03d9**.

**También quedó en `main`:** una vista previa local aislada (simulador + política del navegador que bloquea producción), después del incidente del 07-10. Es el camino seguro para revisar la rama de diseño (documento propio de esa rama).

## 5. Protección del servidor

**[Seguro, por el código]** Ocultar botones o validar en React no protege nada:
- La app lee y escribe `calendario_data` con la llave pública incluida en la página.
- El guardia `/api/db` se retiró el 30-06-2026 (responde 410).
- Ninguna tabla del flujo tiene RLS: `fase4_cerrar_todo.sql` está marcado "NO EJECUTAR".
- **El login se verifica en el navegador leyendo la fila `pins`**. Mientras la base esté abierta, cualquiera puede descargar los hashes de PIN de 6 dígitos y probarlos fuera de línea. La auditoría de junio lo anotaba como "se mitiga al cerrar".
- `main` agregó `autorizacionGuardado`, que cierra la vía accidental desde la propia app. No reemplaza la protección del servidor (su propio código lo dice).

**Propuesta por etapas** (`supabase/propuesta_rls_calendario_data.sql`, **no activada**):

| Etapa | Qué hace | ¿Bloquea usuarios? | Requisito |
|---|---|---|---|
| 1 | La llave pública ya no puede borrar ni vaciar `calendario_data` (la app nunca lo hace) + historial de versiones en el servidor, no legible con la llave pública (máximo una versión cada 15 min por fila) | No | Medir antes el tamaño de las filas (consulta de metadatos) |
| 2 | Verificar el PIN en el servidor y dejar `pins` y `backup_*` fuera del alcance de la llave pública | No, si se hace en orden | Desarrollo del login en servidor. Hacerlo antes deja a todos fuera |
| 3 | Supabase Auth + políticas por fila según la matriz; permisos fuera de `calendario_data`; Storage privado | Se diseña para no bloquear | Decisiones D1–D5; `rendiciones` debe pasar a una tabla por rendición |

Prueba de la etapa 1 en Postgres local con roles simulados (`node scripts/seguridad/prueba-rls-local.mjs`): **19/19**.
- La lectura, el upsert y el PATCH con versión siguen funcionando.
- Borrar, vaciar y leer o alterar el historial quedan bloqueados.
- El historial guarda la versión anterior.
- La reversa deja todo como hoy.

**No es Supabase real**: falta probarla en un proyecto de prueba.

**Alcance:** la propuesta cubre **solo `calendario_data`**. No demuestra protección de las otras tablas definidas en el repositorio (137 más), ni de las funciones, ni de los 6 buckets de Storage. Cada una necesita su propia evaluación con los metadatos reales.

**Pendiente, sin activar:** cualquier etapa de RLS espera dos cosas: confirmar el commit desplegado y correr la consulta de metadatos autorizada.

## 6. Despliegue, rollback y recuperación

**Commits:**

| | Commit | Cómo se sabe |
|---|---|---|
| `main` al iniciar las pruebas de rollback anteriores | `8df9862` | git |
| `main` hoy | **`3a9d33e`** (07-10-2026 12:07 UTC, otra sesión) | GitHub |
| Desplegado en producción | **No verificado** | Vercel está bloqueado desde acá y el repo no expone despliegues por GitHub (0 ejecuciones de Actions). **[Suponiendo]** Vercel despliega `main` automáticamente, así que sería `3a9d33e` |

Para confirmarlo: Vercel → proyecto → Deployments → Production → el SHA del commit.

**Rollback verificado contra `3a9d33e`** (`scripts/e2e/rollback.mjs`, mismo Supabase falso): **13/13**.
- Esa versión lee los saldos nuevos (`usd`) y no borra los metadatos de TC.
- Rechaza el respaldo v3 sin escribir nada.
- Al volver a la rama, todo se lee igual.

Es compatibilidad **contra ese commit**, no contra producción, hasta confirmar el SHA desplegado.

**Rollback sin descargar respaldos con credenciales.** Volver a la versión anterior del código no necesita un respaldo descargado: la rama no migra datos y la versión anterior lee lo que escribe la nueva (verificado localmente contra `3a9d33e`).

**Vías de recuperación de DATOS, clasificadas:**

| Clase | Vía | Situación |
|---|---|---|
| Disponible y verificada | — | **Ninguna.** No hay una restauración de datos de producción verificada |
| Disponible sin verificar | "💾 Respaldo" de la versión publicada (v1, manual, solo admin) | Existe en el código publicado. Incluye **`pins`** y todas las filas menos `backup_*`. No probado en producción |
| Disponible sin verificar, **con riesgo** | "📤 Restaurar" de la versión publicada | Existe. Restaura **todas** las filas del archivo, incluida `pins`, sin plan ni control de versión: puede pisar PIN y datos actuales. No usar sin revisión |
| Disponible sin verificar | Filas `backup_*` antiguas en `calendario_data` | Según el código, existían. Contienen credenciales. No confirmado en producción |
| Disponible sin verificar | Rollback de código: "Promote" de un deployment anterior en Vercel | Es una función de Vercel. No se probó desde acá |
| Sin confirmar que exista | Respaldo nativo de Supabase | [Probable] por el plan Pro, pero no confirmado. Se ve en el panel; es una lectura |
| Propuesta, no activa | PITR (restauración a un punto en el tiempo) | Complemento pagado; requiere tu aprobación |
| Propuesta, no activa | Historial de versiones (RLS etapa 1) | Probado solo en Postgres local. **No está activado** |
| Propuesta, no activa | auto-v4 + `scripts/respaldo/restaurar.mjs` | Construido y probado en aislamiento. Desactivado. No restaura `pins` y reinyecta las credenciales vigentes |
| Propuesta, no activa | Copia externa completa (`pg_dump` + buckets, cifrada) | Plan en `docs/plan-recuperacion.md` |

El "💾 Respaldo" v3 de la rama (saneado) no está publicado: no se cuenta como vía disponible.

**Inventario y recuperación**: sin cambios respecto de `docs/plan-recuperacion.md`.
- Tablas: 138 definidas en el repo.
- Prueba aislada: 8/8.
- La estructura **no** se reconstruye desde el repo: hacen falta `pg_dump` completos.

## 7. Integración: dependencias concretas y etapas

`node scripts/integracion/dependencias.mjs origin/main --md` detecta qué commit **usa una función o constante que otro introdujo**. No basta con que compartan archivo. Los nombres que ya existían en `main` no cuentan. Es una aproximación textual, revisada a mano.

| Grupo | Commits (orden) | Depende de |
|---|---|---|
| Fechas y semanal | `0c1de08` → `cb46698`, `ee5eeb0`, `95f071d` → `8a020f6` → `a69ca01` | `cuotasPrestamosEmpresa`, `semanaEnMes`, `fechaLocal`, `posicionSemana`, `hoyISOlocal` |
| Créditos (KPI) | `30ecf58` → `476560e` | `fechaLocal` (`ee5eeb0`) |
| Tipo de cambio | `1d1ac3a` → `cab4009` → `0644207` | `cuentasSinParidad` (`1d1ac3a`) |
| Respaldo | `7b8e350` → `af6571f` | `armarRespaldoDescargable` |
| Independientes | `e26cce2` (ErrorBoundary), `6407e6d` (Dashboard = Consolidado), `55a26d1` (rótulos), `d54c779` (auto-v4, inactivo), **`3302695` (permisos)** | — |
| Ya absorbidos por `main` | `dfe3e84` y `88ce198` (escrituras sin cambio): `main` trae una versión ampliada; en el merge se tomó la de `main` | — |

Ningún commit fuera del grupo TC usa algo del grupo TC. Por eso la **etapa 1 = rama sin `cab4009` + `0644207`** funciona sola (`scripts/integracion/armar-etapa1.sh`). Verificada de nuevo **sobre la rama ya integrada con `3a9d33e`**:

| | Etapa 1 | Etapa 2 (rama completa) |
|---|---|---|
| Build `CI=true` | OK | OK |
| jest UTC / Chile | 1.749 / 1.749 | 1.758 / 1.758 |
| `permisos` | 14/14 | 14/14 |
| `respaldo-restaurar` | 18/18 | 18/18 |
| `sin-paridad` · `semanal-cuadre` | 11/11 · 392 | 11/11 · 392 |
| `consolidado-semanal` · `tc-politica` · `rollback` | — | 85 · 25/25 · 13/13 |
| Regresión 8 empresas · reasignar-bandeja (de `main`) | — | 12.032 celdas, 0 diferencias · 37/37 |

Como los grupos son independientes, los permisos podrían integrarse **antes** y por separado.

**Grupo de permisos sobre `main` vigente (3a9d33e), comprobado sin publicar:**
- Son 7 archivos: `src/permisos/acciones.js`, `RendicionesModule.jsx`, `AllegriaModule.jsx`, `FinanzasModule.jsx`, las dos pruebas jest y `scripts/e2e/permisos.mjs`. Salen de `3302695` y de la parte de permisos de `1059b1c`.
- Quedan **fuera**: el comentario de Contabilidad en `App.jsx` (no cambia comportamiento y choca con el ErrorBoundary, que no está en `main`), la propuesta SQL y las herramientas de datos.
- Se aplica limpio sobre `3a9d33e`. Resultado: build OK; 41 pruebas (permisos + `autorizacionGuardado` de `main`); navegador 14/14.
- **Se prepara como rama de integración recién cuando cierres la matriz (§4.3)**: si la matriz cambia, cambia el conjunto.

## 8. Copia mínima para verificar fechas y leasing

**Formato de la versión publicada:** el botón "💾 Respaldo" de `main` genera "Mediterra Hub Backup v1" (`tablas[id].data`). Es el mismo formato en `8df9862` y en `3a9d33e`, sin cambios desde el 24-09-2026, así que vale para cualquiera de los dos que esté desplegado. **Incluye `pins`: los PIN en forma de hash PBKDF2** (no es cifrado: no se pueden descifrar, pero un hash de PIN de 6 dígitos se puede probar por fuerza bruta) y los datos de todos los módulos.

Procedimiento (todo en tu computador):
1. En la app publicada, "💾 Respaldo" (requiere rol admin). El archivo original **no se comparte ni se sube a la rama**. Se conserva **local y protegido** (no en carpetas sincronizadas ni compartidas) hasta que decidas su conservación; no se borra automáticamente. `.gitignore` incluye `backup_mediterra_*.json` y `creditos-minimo-*.json`: **previene una subida accidental, no la impide** (un `git add -f` o un nombre distinto la saltan).
2. Abrir `scripts/datos/extraer-creditos-minimo.html` (doble clic) y elegir el archivo.
   - La página no tiene acceso a la red.
   - Solo lee la fila `finanzas` → `creditos_data`. `pins`, usuarios y el resto nunca entran al archivo de salida.
   - Conserva únicamente: id, n, empresa, acreedor, tipo, moneda, monto, cuota, tasas, fechas (inicio, vencimiento, desembolso, pago), pagado, renovable, plazo y la tabla de cuotas de socio.
   - Lista los campos descartados.
3. Entregar solo `creditos-minimo-AAAA-MM-DD.json` por un canal autorizado. Con él:

```
COMPARAR_TZ_ARCHIVO=creditos-minimo.json COMPARAR_TZ_SALIDA=salida npm run comparar:tz
```

Produce:
- el cambio por cuota, mes, semana y empresa (CSV y JSON);
- `verificacion-leasing-capital.json`: tasa implícita por pago de leasing, capital por vencer y por conciliar al corte.

Prueba de la cadena completa con datos ficticios (`node scripts/datos/prueba-extractor.mjs`): **16/16**, con el formato publicado (v1, incluida una fila `pins` ficticia) y con el v3.
- El archivo no trae PIN ni hashes, notas, RUT, contactos ni otras filas.
- La página no hace pedidos de red.
- La comparación da 10 cuotas, igual que con los datos por defecto.
- Se corrigió que la herramienta no leía el formato v3 del respaldo.

## 9. Metadatos de producción

No tengo acceso autorizado desde este entorno: la red bloquea Supabase y no hay credenciales. Dejé lista `supabase/consulta_metadatos_solo_lectura.sql` para correrla en el editor SQL.
- Va en una transacción `READ ONLY` que termina en `ROLLBACK`.
- Lista tablas con tamaño y RLS, políticas, permisos de anon/authenticated, funciones (firma, sin código), triggers, vistas, buckets (configuración y volumen, sin nombres de archivo), tamaño por fila de `calendario_data` (solo id) y extensiones.
- No lee contenido de negocio ni secretos.

Probada en Postgres local: corre completa y rechaza una escritura.

## 10. Decisiones pendientes (tuyas)

| # | Decisión |
|---|---|
| D1–D6 | ~~Matriz §4.3~~: confirmada el 08-10 e implementada en la rama (§4.10) |
| D11 | ~~Sueldos~~: decidido e implementado (§4.11). Pendiente tuyo: revisar el listado de registros existentes al desplegar |
| D12 | ~~Frisku Michelle/Lucía~~: conservan consulta (§4.10 F) |
| D13 | ~~Canal sin filtro~~: cliente limitado por fila (§4.14). **Pendiente:** autorización en el servidor (Auth + RLS por fila), primero en un proyecto de prueba |
| D14 | Despliegue con los pasos de transición de §4.12 D y las precauciones de rollback de §4.16 |
| D15 | **Integrar remuneraciones con el nuevo guardado de nóminas de `main` 0b86538** (§4.17) |
| D16 | Agregado con una sola remuneración en la nómina: se ve su monto, sin nombre (§4.15) |
| D7 | Etapa 1 de RLS: **pendiente**. Antes: confirmar el commit desplegado y correr la consulta de metadatos |
| D8 | Migración de claves del calendario (11 meses): **pendiente**, con los mismos requisitos previos |
| D9 | Permisos y remuneraciones como primer grupo de integración: verificado sobre `main` 3fd03d9 (§4.10 E y §4.11 D). Sin merge ni despliegue hasta tu aprobación |
| D10 | Confirmar el SHA desplegado y correr la consulta de metadatos |

## 11. Riesgos vigentes

1. Producción no verificada: ni el SHA desplegado, ni los metadatos, ni los permisos reales de `usuarios`.
2. La base sigue abierta a la llave pública (lectura, escritura y hashes de PIN) hasta las etapas 2–3. Las restricciones de la matriz y de remuneraciones (§4.10–4.13) son de la aplicación: **no hay confidencialidad frente a acceso directo**. El canal de tiempo real sin filtro puede llevar filas completas a cualquier navegador con sesión (§4.11 F).
3. Zona horaria y leasing sin datos reales: falta la copia mínima.
4. Calendario: 11 meses con etiquetas corridas, sin migrar.
5. Regla S1: los importes mensuales sin desglose generan saltos semanales. Se distinguen, pero la regla sigue vigente.
6. Fechas de Osiris, Frisku y Contabilidad siguen en UTC.
7. Respaldo sin copia externa; secretos sin copia documentada.
8. Prototipo de experiencia: A y B siguen como alternativas; falta tu revisión de capturas y recorridos, y pruebas en Safari, Firefox y dispositivos reales. La matriz confirmada será la base de sus vistas por perfil.
9. ~~Periodo sin pagos al desplegar~~: corregido con la regla de transición (§4.12).
10. Remuneraciones: las líneas de clasificación explícita siguen en la fila `nominas` (y llegan al navegador de quien prepara nóminas) **hasta que se trasladen**. La pantalla las agrega; los datos no se protegen hasta el traslado.
11. Rollback de código con remuneraciones en el circuito: ese pago queda fuera de la vista en `main` (§4.16).
12. El conjunto no está verificado sobre `main` 0b86538 (§4.17).
