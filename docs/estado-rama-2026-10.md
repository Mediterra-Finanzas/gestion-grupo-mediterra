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
| 4 | ¿Quién puede ver, preparar, dar V°B° y aprobar al final las nóminas? | Ver y preparar: quien tenga la pestaña Nóminas en "editar" (Angelo, Carol). V°B°: Carol o Michelle, fijo por nombre en el código. Michelle no tiene la pestaña por defecto, así que en la práctica solo Carol. Aprobación final: rol admin (Angelo). **Sin separación de funciones** | Preparar: un responsable. V°B°: otra persona. Aprobación final: una tercera. Quien preparó no da el V°B° ni la aprobación final de esa nómina. **No se implementa** hasta que definas responsables, reemplazos y excepciones | Responsable y reemplazo de cada paso. Tratamiento de excepciones (ausencia o urgencia): quién autoriza y cómo queda registrado. **Si la aprobación final sigue ligada al rol admin** o a una persona nombrada |
| 5 | ¿El perfil consulta puede cargar sus propias rendiciones como excepción explícita? | Sí, de hecho: todo usuario recibe Rendiciones en "ver", que en ese módulo significa cargar y ver las propias. La rama no lo cambia; solo le quita aprobar, pagar y devolver | Sí, **como excepción escrita** en la definición del rol: "Consulta – solo visualiza, salvo cargar sus propias rendiciones" | Confirmar la excepción |
| 6 | ¿Qué acceso tendrán las pestañas nuevas o sin configurar? | "Editar" para todo no-admin con el módulo (salvo "config", que es "sin acceso"). El admin tiene "editar" en todo. El gerente técnico tiene "editar" en todo Osiris. La rama pone el rol consulta en "ver" solo en Finanzas | 1) Guardar como explícito el nivel efectivo de hoy en cada persona y pestaña existente: nadie gana ni pierde acceso. 2) Las pestañas nuevas nacen "sin acceso" para no-admin | **Si el admin recibe acceso automático a las pestañas nuevas** o también se le asigna explícitamente |

Si quieres trabajar con los usuarios reales sin compartir el respaldo completo, la misma extracción local podría producir un archivo solo con los campos de permisos: nombre, rol, módulos, pestañas y marcas, sin PIN ni correos. Eso es código nuevo y no lo hice; queda a tu decisión.

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
| D1–D6 | Resolver las diferencias de la matriz §4.3 (pagar, aprobador, Contabilidad, pestañas sin configurar, Nóminas y separación de funciones, rendiciones de consulta) |
| D7 | Etapa 1 de RLS: **pendiente**. Antes: confirmar el commit desplegado y correr la consulta de metadatos |
| D8 | Migración de claves del calendario (11 meses): **pendiente**, con los mismos requisitos previos |
| D9 | Permisos como primer grupo de integración (propuesto). Sin merge hasta cerrar D1–D6 |
| D10 | Confirmar el SHA desplegado y correr la consulta de metadatos |

## 11. Riesgos vigentes

1. Producción no verificada: ni el SHA desplegado, ni los metadatos, ni los permisos reales de `usuarios`.
2. La base sigue abierta a la llave pública (lectura, escritura y hashes de PIN) hasta las etapas 2–3.
3. Zona horaria y leasing sin datos reales: falta la copia mínima.
4. Calendario: 11 meses con etiquetas corridas, sin migrar.
5. Regla S1: los importes mensuales sin desglose generan saltos semanales. Se distinguen, pero la regla sigue vigente.
6. Fechas de Osiris, Frisku y Contabilidad siguen en UTC.
7. Respaldo sin copia externa; secretos sin copia documentada.
8. Prototipo de experiencia: A y B siguen como alternativas; falta tu revisión de capturas y recorridos, y pruebas en Safari, Firefox y dispositivos reales.
