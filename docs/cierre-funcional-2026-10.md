# Cierre funcional — rama `claude/fervent-bell-uu6ae8` (oct-2026)

**Estado:** sin merge a `main`, sin despliegue, sin migraciones ejecutadas y sin respaldos activados ni borrados.

Toda la evidencia es **local**: build de la rama, navegador Chromium con hora de Chile y un Supabase falso en memoria. **Nada se verificó en producción**, porque la red de este entorno bloquea Vercel y Supabase.

Este documento reemplaza las secciones de riesgos y de integración de `docs/informe-integracion-2026-10.md`. Ese informe sostenía dos cosas que ya no son válidas:
- "12 meses afectados" en el calendario: son **11**.
- "~92 tablas" en el inventario: son **138**.

Nomenclatura de confianza: **[Seguro]** = comprobado con prueba reproducible; **[Probable]** = inferencia sólida; **[Suponiendo]** = vacío llenado.

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

## 4. Recuperación y rollback

| Punto | Estado |
|---|---|
| Inventario | 138 tablas definidas en el repo, 37 usadas por el código, `calendario_data` sin DDL, 6 buckets. **Por consultar en producción:** existencia real, tamaños, RLS, funciones, `auth.users` y objetos por bucket. Ver `docs/plan-recuperacion.md` §1. |
| Prueba aislada (Postgres local, datos ficticios) | Copia, pérdida y restauración: 8/8, con documentos verificados por SHA-256. **Hallazgo:** la estructura **no** se reconstruye desde el repo (14 de 58 `.sql` fallan), así que la copia externa tiene que ser `pg_dump` completo. |
| Configuración y servicios | Variables de Vercel y Supabase, cron, edge functions e integraciones listados en `plan-recuperacion.md` §1.5. Los valores **no tienen copia documentada**. |
| Prueba en proyecto Supabase de prueba | **No hecha**: requiere tu aprobación y credenciales de un proyecto de prueba. |
| Respaldos | Sin activar ni borrar nada. auto-v4 sigue desactivado y las filas `backup_*` con credenciales siguen sin tocar. |

**Rollback verificado** (`scripts/e2e/rollback.mjs`, 13/13, mismo Supabase falso para esta rama y `main`):
- La versión anterior lee los saldos nuevos: usa `usd` e ignora los metadatos `tc*`.
- Un saldo `usd: null` suma 0, como hoy.
- Al navegar, la versión anterior no borra los metadatos.
- Al volver a la versión nueva, todo se lee igual.

**Riesgo encontrado y cerrado:** la versión anterior **aceptaba** el respaldo saneado de la nueva, y restaurarlo habría dejado usuarios sin PIN. Ahora el respaldo sale en formato v3 (`tablasSaneadas`): la versión anterior responde "Archivo inválido" y no escribe ninguna fila.

---

## 5. Integración reversible en dos etapas

**Dependencias revisadas.**
- Los commits de la rama comparten `FinanzasModule.jsx`, así que no se pueden elegir sueltos sobre `main`. Probado: el *cherry-pick* sobre `main` choca desde el quinto commit, porque la rama ya integró `main`.
- La forma reproducible es la rama completa **menos** los dos commits de TC (`cab4009`, `0644207`): `bash scripts/integracion/armar-etapa1.sh <carpeta>`.
- Hay un único conflicto, esperado: `DetalleSaldoBancos` depende de la conversión y sale con ella.

| | Etapa 1 | Etapa 2 |
|---|---|---|
| Contenido | Fechas y zona horaria, calendario y motor semanal único, origen de compromisos, `InputNumero`, escrituras sin cambios, Respaldo/Restaurar v3, ErrorBoundary, KPI de capital, cuentas sin paridad visibles, documentos y pruebas | + Conversión de saldos con `maestro_tc` (falla de carga, antigüedad, cotización modificada) |
| Build `CI=true` | OK | OK |
| jest, UTC / Chile | 1.644 / 1.644, 0 fallas | 1.653 / 1.653, 0 fallas |
| `semanal-cuadre` / `consolidado-semanal` | 392 / 85, 0 descuadres | 392 / 85, 0 descuadres |
| `sin-paridad` / `respaldo-restaurar` | 11/11 · 18/18 | 11/11 · 18/18 |
| Regresión 8 empresas (pantalla vs Excel recalculado) | 12.032 celdas, 0 diferencias | 12.032 celdas, 0 diferencias |
| `tc-politica` / `rollback` | no aplica | 25/25 · 13/13 |
| Requisito previo | Descargar Respaldo y confirmar el respaldo nativo del día | Cargar `USD-PEN` manual en `maestro_tc` |

**No se integra en ninguna etapa:** el prototipo (`prototipo/`), que tampoco entra al build.

**Rollback:**
- "Promote" del deployment anterior en Vercel, sin tocar datos.
- O `git revert` de la etapa, con merge commit (sin squash).

**Hallazgo a resolver antes de la etapa 1:** volver de la etapa 1 a `main` tras haber descargado un respaldo v3 deja ese archivo ilegible para `main`. Es lo esperado, porque protege los PIN, pero hay que guardar también un respaldo descargado **antes** del merge.

---

## 6. Riesgos pendientes

1. **Producción no verificada.** Antes de publicar: red habilitada y `prod-solo-lectura.mjs` con la cuenta de consulta (credenciales solo por variable de entorno).
2. **Zona horaria con datos reales:** falta la copia autorizada.
3. **Calendario:** 11 meses con etiquetas corridas. La migración está preparada, sin ejecutar y pendiente de tu decisión.
4. **Regla S1:** los importes mensuales sin desglose generan saltos en ventanas semanales. Ya se distinguen, pero la regla sigue vigente porque así está acordada.
5. **Leasing y créditos reales:** falta verificar con datos reales y depurar 1.647.854 por conciliar (cifra ficticia).
6. **Seguridad de permisos:** el control de acceso se aplica solo en el navegador, y hay 7 defectos de permisos confirmados (entre ellos, "Marcar pagada" de Rendiciones sin control de rol y Contabilidad en solo lectura para Carol, Michelle y Pablo). Ver `docs/propuesta-experiencia-perfiles-2026-10.md` §2. No se corrigieron.
7. **Fechas en Osiris, Frisku y Contabilidad:** siguen en UTC.
8. **Respaldo:** sin capa externa. `SUPA_URL` está fija en el código (R1) y los secretos no tienen copia documentada.
