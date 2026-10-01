# Créditos — revisión antes del merge a `main`

Rama: `claude/laughing-dijkstra-8665xz`. Todo lo verificado aquí usa **datos simulados**
(tests y un Supabase falso en memoria). **Nada de esto concilia los datos reales**:
producción respondió 403 desde el entorno de trabajo, así que la conciliación real
se hace desde la app con el procedimiento de la sección 6.

---

## 1. Criterios aplicados (decisiones de Angelo)

| Tema | Regla implementada |
|---|---|
| Cuotas vencidas impagas | Una cuota vencida **confirmada** impaga se proyecta en el mes y la semana en curso, marcada "vencida" y con su **fecha contractual original** visible. |
| Registros antiguos | Una cuota que venció **antes de que el crédito se controlara en la app** (`control_desde`) y no tiene pago registrado queda **"por conciliar"**. No entra a la deuda confirmada ni al flujo. Su impacto potencial en caja se muestra aparte, en el aviso del flujo, en la pestaña 🔎 Conciliación y en la columna "Por conciliar" del servicio de deuda. Se concilia de dos maneras: (a) registrando el pago real, o (b) "Confirmar impaga" con un respaldo; esta confirmación se puede anular con motivo. Los créditos antiguos no tienen `control_desde`. Uno nuevo lo fija el día de su alta. |
| Cuotas sin desglose | No se asume que sean capital. Se completan con "Desglosar cuota", que exige un **respaldo contractual**. Mientras falte el desglose, la cuota aparece como "cuota sin desglosar": queda **fuera** del saldo de capital identificado y **dentro** del servicio de deuda. El Análisis CFO advierte el monto, el número de cuotas y de créditos, y el % de la deuda confirmada que representa. |
| Pagos y flujo real | El flujo real sigue siendo de ingreso manual. Registrar un pago reduce la obligación pendiente y el capital (solo por la parte de capital) y queda en el historial. **No** agrega ninguna salida al flujo real. |
| Nóminas | Una línea de nómina se vincula a un vencimiento. Vincularla **no** paga nada. El pago se registra solo con **"Confirmar pago efectivo"**, que exige nómina "Aprobada CFO" y permiso de edición en Créditos, e indica fecha, monto y desglose. Admite pagos parciales. La clave `nomina:<nómina>:<línea>` evita duplicados al reintentar. Anular el pago desde la línea exige motivo y el pago anulado queda en el historial. Crear o autorizar la nómina no cambia nada en Créditos. |
| Valores manuales antiguos en Pago Préstamos / Renovaciones | **Siguen aplicándose** hasta que se decide mes a mes en 🔎 Conciliación. La tabla muestra, para cada mes, valor manual, calendario de Créditos y diferencia. "Usar Créditos" retira el valor manual. "Mantener manual" lo conserva y exige motivo. Cada decisión queda registrada en `_resolucionesCreditos` con usuario, fecha y ambos montos. En el flujo ya no se pueden escribir valores manuales nuevos en esas líneas. |

---

## 2. Verificación del prepago (reproducible a mano)

### Crédito de prueba

| Dato | Valor |
|---|---|
| Capital original | USD 400.000 |
| Desembolso | 10-01-2026 |
| Tasa | 8% anual fija |
| Base | Actual/360 |
| Amortización | capital constante, trimestral: 4 cuotas de 100.000 |
| Comisión de prepago | 1 mes de interés sobre el capital prepagado |

**Ojo:** la comisión de "1 mes de interés" es una **hipótesis de prueba**, no una condición de un contrato real. En cada crédito real hay que cargar la condición que diga el contrato.

### Calendario original

| Vencimiento | Días desde el anterior | Saldo inicial | Capital | Interés = saldo × 8% × días/360 | Saldo final |
|---|---|---|---|---|---|
| 10-04-2026 | 90 (10-ene → 10-abr) | 400.000 | 100.000 | 8.000,00 | 300.000 |
| 10-07-2026 | 91 | 300.000 | 100.000 | 6.066,67 | 200.000 |
| 10-10-2026 | 92 | 200.000 | 100.000 | 4.088,89 | 100.000 |
| 10-01-2027 | 92 | 100.000 | 100.000 | 2.044,44 | 0 |

La cuota del 10-04-2026 se pagó completa ese día: 100.000 de capital + 8.000 de interés.
Ese es el **último pago de intereses** antes del prepago.

### A) Prepago total el 25-05-2026

| Paso | Cálculo | Monto |
|---|---|---|
| Capital pendiente antes del prepago | cuotas del 10-07, 10-10 y 10-01 | 300.000,00 |
| Días devengados | 10-04-2026 → 25-05-2026 = 20 (abril) + 25 (mayo) | 45 |
| Interés devengado | 300.000 × 8% × 45/360 | 3.000,00 |
| Comisión | 300.000 × 8% / 12 | 2.000,00 |
| **Desembolso total** | 300.000 + 3.000 + 2.000 | **305.000,00** |
| Intereses futuros del calendario original | 6.066,67 + 4.088,89 + 2.044,44 | 12.200,00 |
| Intereses futuros del escenario | no quedan cuotas | 0,00 |
| Intereses evitados | 12.200 − 0 − 3.000 | 9.200,00 |
| **Ahorro neto** | 9.200 − 2.000 | **7.200,00** |

Por qué se resta el devengado: en el calendario original, esos 3.000 se pagaban dentro de
la cuota del 10-07 (6.066,67). Con el prepago se pagan igual, solo que antes. Lo evitado es
el interés desde el 25-05 hasta cada vencimiento. El ahorro **no** descuenta el costo de
oportunidad de la caja usada.

### B) Prepago parcial de 100.000 el 25-05-2026, reduciendo el plazo

| Paso | Cálculo | Monto |
|---|---|---|
| Interés devengado sobre lo prepagado | 100.000 × 8% × 45/360 | 1.000,00 |
| Comisión | 100.000 × 8% / 12 | 666,67 |
| Desembolso | 100.000 + 1.000 + 666,67 | 101.666,67 |

Calendario posterior al prepago. El capital de cada cuota se mantiene en 100.000 y la última cuota desaparece:

| Vencimiento | Saldo inicial | Capital | Interés |
|---|---|---|---|
| 10-07-2026 | 200.000 | 100.000 | 200.000 × 8% × 91/360 = 4.044,44 |
| 10-10-2026 | 100.000 | 100.000 | 100.000 × 8% × 92/360 = 2.044,44 |

| Paso | Cálculo | Monto |
|---|---|---|
| Intereses evitados | 12.200,00 − (4.044,44 + 2.044,44) − 1.000,00 | 5.111,12 |
| Ahorro neto | 5.111,12 − 666,67 | 4.444,45 |

En mi reporte anterior dije 5.111,11 y 4.444,44. Sin redondear, el escenario suma 6.088,89. La app
redondea cada interés al centavo, igual que un banco, así que 4.044,44 + 2.044,44 = 6.088,88. Por eso la diferencia de 1 centavo.

### C) Prepago parcial de 100.000 el 25-05-2026, reduciendo la cuota

El devengado (1.000,00), la comisión (666,67) y el desembolso (101.666,67) son los mismos que en B.
El capital se reparte en las 3 cuotas que quedan: 66.666,67 + 66.666,67 + 66.666,66.

| Vencimiento | Saldo inicial | Interés |
|---|---|---|
| 10-07-2026 | 200.000,00 | 200.000 × 8% × 91/360 = 4.044,44 |
| 10-10-2026 | 133.333,33 | 133.333,33 × 8% × 92/360 = 2.725,93 |
| 10-01-2027 | 66.666,66 | 66.666,66 × 8% × 92/360 = 1.362,96 |

| Paso | Cálculo | Monto |
|---|---|---|
| Intereses del escenario | 4.044,44 + 2.725,93 + 1.362,96 | 8.133,33 |
| Intereses evitados | 12.200 − 8.133,33 − 1.000 | 3.066,67 |
| Ahorro neto | 3.066,67 − 666,67 | 2.400,00 |

Estos casos están en `node src/creditos.test.mjs`. El E2E en navegador repite otro caso:
prepago total el 20-10-2026, con devengado 100.000 × 8% × 10/360 = 222,22 y comisión 666,67.

### Regla usada para el devengado

- **Prepago total:** devenga todo el saldo desde el último vencimiento pagado hasta la fecha del prepago.
- **Prepago parcial:** el capital prepagado paga su interés devengado hasta la fecha del prepago. El capital que queda devenga el período completo, hasta su vencimiento.
- **Datos faltantes:** si falta la tasa, la base o la condición de prepago, el resultado se muestra como **estimación**, con el dato faltante declarado y sin opción de aplicarlo. La app no inventa condiciones.

---

## 3. Tasa variable

- La tasa del contrato se calcula como **referencia vigente cargada como hipótesis + margen**.
- La hipótesis se proyecta **constante hasta el vencimiento**.
- Dónde se ve marcada como proyección:
  - vista previa del calendario: "Intereses PROYECTADOS: SOFR 3M 5% supuesta constante (hipótesis) + margen 3%";
  - detalle del crédito: etiqueta "proy." en cada interés;
  - servicio de deuda: columna "de ello proy. tasa variable";
  - Análisis CFO: la hipótesis de cada crédito y una sensibilidad de +100 pb (saldo variable × 1%);
  - simulador: la hipótesis aparece explícita.
- No hay integración con fuentes de tasas: la referencia se actualiza a mano en cada crédito.

---

## 4. Ajustes de la segunda revisión (01-10-2026)

### 4.1 Conciliación de deuda: capital contra capital

El procedimiento anterior estaba mal: sumaba las cuotas sin desglose al capital para
compararlo con el saldo del acreedor. Ahora:

- La tabla **"Conciliación con cada acreedor"** (Créditos → 🔎 Conciliación) agrupa por empresa, acreedor y **moneda original**. No convierte nada.
- **Capital app** = capital pendiente identificado **a la fecha de corte** del certificado. Solo cuentan los pagos con fecha ≤ corte: un pago posterior no reduce lo adeudado al corte.
- **Capital informado** = el capital insoluto que informa el acreedor (con respaldo obligatorio).
- **Diferencia** = informado − app. Es la única comparación.
- Se presentan por separado, sin sumarse al capital: intereses vencidos impagos, cargos vencidos, intereses futuros del calendario, **cuotas sin clasificar** y cuotas por conciliar.
- **Estado de la conciliación:**

  | Estado | Cuándo |
  |---|---|
  | **Cuadra** | Solo si no hay cuotas sin clasificar, ni por conciliar, ni cuotas antiguas marcadas pagadas sin registro, y la diferencia es ≤ 1 unidad de la moneda. |
  | **Conciliación incompleta** | Si falta cualquiera de esas informaciones, aunque el capital coincida. Indica el motivo. |
  | **Diferencia de capital** | La información está completa y la diferencia es mayor a 1 unidad de la moneda. |
  | **Sin dato del acreedor** | No hay saldo informado. |

- El saldo informado no se borra: se anula con motivo.

Ejemplo (vista previa con datos simulados): Privado Particular informa 550.000. La app tiene
capital identificado 0 y 550.000 sin clasificar. El estado es **incompleta**, no "cuadra".

### 4.2 Dos escenarios de caja

- **Confirmado** (fila SALDO ACUM.): no incluye las cuotas por conciliar.
- **Incluyendo por conciliar** (fila morada, "SALDO ACUM. incl. por conciliar"): las paga en el mes en curso. La diferencia se ve mes a mes y semana a semana.
- **Sin duplicar:** si la línea Pago Préstamos o Renovaciones de esa empresa tiene un **valor manual vigente en el mes en curso**, esas cuotas **no se suman** al escenario, porque el valor manual podría estar cubriéndolas. Se listan aparte con el motivo.
- Tabla por empresa en Créditos → Conciliación, con: diferencia de caja, cuotas no sumadas y cuotas sin TC (escenario incompleto).

### 4.3 Excel: hoja "Servicio deuda"

Está en el export individual y en el consolidado. No se agregaron filas dentro de la hoja
del flujo: su subtotal suma un rango de filas y los componentes se habrían contado dos veces.
Filas por empresa (y total grupo en el consolidado):

| Fila | Contenido |
|---|---|
| Capital / Intereses / Otros cargos / Cuotas sin desglosar | valores del calendario |
| `= Servicio de deuda según Créditos` | fórmula `SUM(capital:sin desglosar)`: cada componente se suma una vez |
| `Ajuste: valor manual vigente` | flujo − Créditos (≠ 0 solo donde rige un valor manual antiguo) |
| `= Pago Préstamos + Renovaciones en el flujo` | servicio + ajuste |
| `Control vs hoja del flujo` | fórmula contra las celdas de la hoja del flujo; debe dar 0 |
| `Escenario: cuotas por conciliar` | informativa, NO incluida en el flujo |

En pantalla, el desglose de Pago Préstamos muestra la misma fila de ajuste cuando corresponde.

Verificado con el archivo descargado desde la app y **recalculado por LibreOffice** (vista previa):

| Archivo | Identidades verificadas | Desvío máximo | Control |
|---|---|---|---|
| Osiris | 63 meses | 0,00 | 0 |
| Consolidado | 441 celdas (63 meses × 7 bloques: empresas + total grupo) | 0,00 | 0 |

Ejemplo, Osiris en el mes en curso:

| Concepto | Monto |
|---|---|
| Servicio según Créditos (vencida 10-07 por 56.066,67 + cuota 10-10 por 104.088,89) | 160.155,56 |
| Ajuste por valor manual vigente | −10.155,56 |
| Línea del flujo (valor manual vigente) | 150.000,00 |

### 4.4 Nóminas y pagos

Al anular una **nómina** o una **línea** que tiene un pago vigente en Créditos:

1. Se muestra el vínculo (acreedor, cuota, fecha y monto del pago).
2. Hay que decidir pago por pago:
   - **Conservar:** el pago sigue vigente y se le agrega una anotación con el motivo. No cambian ni montos ni fecha.
   - **Anular en Créditos:** con motivo; la cuota vuelve a quedar pendiente.
3. El motivo es obligatorio y la decisión queda en el historial del crédito y en el de la nómina o línea.
4. Si Créditos no confirma el guardado, la nómina o línea **no** se anula.

### 4.5 Monedas

- Los saldos se conservan y se muestran en su **moneda original**.
- **Valorización a la fecha de corte** (hoy), en este orden:
  1. Último TC del histórico de **Maestros → Tipo de Cambio** con fecha ≤ corte. Un valor **manual** del CFO prevalece sobre las APIs. Pares `USD-<moneda>`, su inverso, o triangulación vía CLP (por ejemplo, UF).
  2. Si Maestros no tiene el par: el **TC declarado en el crédito**, con su fecha, rotulado "hipótesis".
  3. Si no hay ninguno: **no se convierte**. Análisis CFO muestra el importe no convertido en su moneda y advierte "Total consolidado en USD **INCOMPLETO**".
- Se muestran TC, fecha y fuente en Análisis CFO (tabla por moneda original) y en el detalle de cada crédito.
- Si el TC tiene más de 7 días de antigüedad respecto del corte, se avisa.
- La lectura del histórico de TC es solo lectura: si falla, se avisa y no se escribe nada.

---

## 5. Qué se verificó y cómo

| Nivel | Qué | Resultado |
|---|---|---|
| Compilación | `CI=true npx react-scripts build` | sin errores |
| Modelo (Node) | `node src/creditos.test.mjs`: 6 casos pedidos, conciliación, nómina, tasa variable, TC de Maestros y conciliación por acreedor; también con TZ=America/Santiago | todo OK |
| Suite jest | `CI=true npx react-scripts test --watchAll=false` (incluye hoja "Servicio deuda") | todo OK |
| Navegador (datos simulados) | `scripts/e2e/vista-previa-creditos.mjs`: puntos 1–5 de esta revisión, Excel recalculado por LibreOffice | 20/20 OK |
| Navegador (datos simulados) | `scripts/e2e/creditos.mjs`, `scripts/e2e/nomina-credito.mjs` | OK / OK |
| Navegador (datos simulados) | `scripts/e2e/regresion-empresas.mjs`: pantalla vs Excel recalculado, 8 empresas | 12.032 celdas, 0 diferencias; 0 peticiones a producción |
| **Datos reales** | — | **NO verificado** |

---

## 6. Procedimiento de conciliación con datos reales (desde la app)

1. **Respaldo.** Antes de desplegar, descarga el "💾 Respaldo" de la app.
2. **Tipo de cambio.** En Maestros → Tipo de Cambio, confirma que existan los pares de cada moneda de crédito a la fecha de corte (USD-CLP, USD-PEN manual, UF-CLP si hay créditos en UF). Lo que falte aparecerá como "no convertido".
3. **Revisar lo pendiente.** Abre Créditos → 🔎 Conciliación.
4. **Cotejar.** Con "📥 Exportar a Excel para cotejar", contrasta las cuotas por conciliar con las cartolas.
5. **Resolver cada cuota por conciliar:**
   - Si se pagó: 📅 → "💵 Pagar", con la fecha y el monto reales.
   - Si sigue impaga: "Confirmar impaga", con el respaldo.
6. **Desglosar.** Desglosa las cuotas sin clasificar con respaldo contractual (tabla de desarrollo, pagaré).
7. **Valores manuales antiguos.** Decide mes a mes: "Usar Créditos" o "Mantener" con motivo.
8. **Saldos de los acreedores.** Por cada acreedor, en "Conciliación con cada acreedor", registra el **capital insoluto** que informa el certificado, a su fecha de corte, con el respaldo.
   Opcionalmente registra intereses y cargos; se muestran al lado, sin mezclarse.
9. **Leer el estado.**
   - **Cuadra:** solo capital contra capital, con la información completa.
   - **Conciliación incompleta:** resuelve lo que indica el motivo y vuelve a revisar.
   - **Diferencia de capital:** falta registrar un pago, hay un pago mal imputado entre capital e interés, o el calendario está mal cargado.
10. **Caja.** Revisa en cada empresa la diferencia entre los dos escenarios (fila morada) y las cuotas no sumadas por un posible duplicado con un valor manual.

---

## 7. Pendientes que requieren información contractual o tu validación

1. **Datos reales no conciliados.** Requiere seguir el procedimiento de la sección 6 en la app.
2. **Desglose de cada cuota antigua** (capital / intereses / cargos): requiere las tablas de desarrollo o los pagarés.
3. **Condiciones de prepago** de cada crédito (comisión, aviso, mínimos): requieren los contratos. Hoy el ejemplo usa "1 mes de interés" solo como hipótesis de prueba.
4. **Tasas variables:** confirmar la referencia y el margen de cada contrato, y quién actualiza la hipótesis de la referencia y cada cuánto.
5. **Tolerancia de cuadre:** hoy es 1 unidad de la moneda. Confirma si te sirve o prefieres otra, en monto o en %.
6. **Escenario "incluyendo por conciliar":** confirma que el criterio de no sumar cuando hay un valor manual vigente en el mes en curso es el que quieres. La alternativa es sumarlas igual y mostrar el posible duplicado.
7. **Antigüedad máxima aceptable del TC** para la valorización (hoy se avisa sobre 7 días).
8. **UF:** si hay créditos en UF, confirma la fuente del par UF-CLP en Maestros (mindicador no se descarga hoy automáticamente para UF).

## 8. Limitaciones técnicas pendientes

1. **Documentos de respaldo.** Se guardan como enlaces. No hay subida a Supabase Storage.
2. **Prepago parcial en registros legacy o de socio.** Solo se simula; el prepago total sí se aplica.
3. **Renovaciones legacy.** Siguen con su modelo anterior: mensual, sin día.
4. **Flujo real.** Sigue siendo de ingreso manual; los pagos registrados no se trasladan. Falta definir esa conciliación.
5. **Saldo por Mes.** La vista "Saldo por Mes" sigue con su tipo de cambio manual para mostrar en CLP; no usa Maestros.
6. **Fila de ajuste en vista semanal.** En la vista semanal, la fila de ajuste por valor manual aparece solo en la columna Σ del mes.
7. **Prepagos anteriores al corte.** La conciliación por acreedor recalcula el calendario de un contrato con todos sus prepagos, aunque tengan fecha posterior al corte. Es poco frecuente, pero puede descuadrar un corte antiguo.
