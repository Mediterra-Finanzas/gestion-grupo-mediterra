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
  | **Cuadra** | Solo si no falta nada (ver 4b.2) y la diferencia exacta es ≤ la tolerancia de redondeo de esa moneda. |
  | **Conciliación incompleta** | Si falta cualquiera de esas informaciones, aunque el capital coincida. Indica el motivo. |
  | **Diferencia de capital** | La información está completa y la diferencia exacta supera la tolerancia de la moneda. |
  | **Sin dato del acreedor** | No hay saldo informado. |

- El saldo informado no se borra: se anula con motivo.

Ejemplo (vista previa con datos simulados): Privado Particular informa 550.000. La app tiene
capital identificado 0 y 550.000 sin clasificar. El estado es **incompleta**, no "cuadra".

### 4.2 Dos escenarios de caja

- **Confirmado** (fila SALDO ACUM.): no incluye las cuotas por conciliar.
- **Incluyendo por conciliar** (fila morada, "SALDO ACUM. incl. por conciliar"): las paga en el mes en curso. La diferencia se ve mes a mes y semana a semana.
- **Sin duplicar:** reemplazado en la tercera revisión por la cobertura explícita (ver 4b.1).
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

## 4b. Ajustes de la tercera revisión (01-10-2026)

### 4b.1 Valores manuales y cuotas por conciliar: cobertura explícita

Antes, un valor manual vigente en el mes en curso excluía del escenario **todas** las
cuotas por conciliar de esa empresa. Ya no se excluye nada de forma automática:

| Situación del valor manual del mes en curso | Cuota por conciliar en el escenario | Estado |
|---|---|---|
| No hay valor manual | se suma | completo |
| Hay valor manual y **no** se definió qué cubre | se suma y se marca "posible superposición" | **PROVISIONAL**: no es un saldo definitivo |
| Cobertura definida y la cuota está vinculada | se excluye (con usuario y respaldo) | completo |
| Cobertura definida y la cuota **no** está vinculada | se suma | completo |

La cobertura se define en Créditos → 🔎 Conciliación, tabla de valores manuales, columna
"Cobertura de cuotas por conciliar" → **Definir**: se marcan las cuotas que el valor manual
incluye según su respaldo, y el respaldo es obligatorio. Queda en
`realData[empresa]._coberturasManual`. No se borra: una nueva definición anula la anterior
con el motivo "reemplazada". Mientras haya cobertura pendiente, la fila morada del flujo, el
aviso y la tabla de escenarios dicen **PROVISIONAL** e informan el monto que puede estar
duplicado.

Ejemplo (datos simulados): Osiris tiene un valor manual de 150.000 en el mes en curso y una
cuota por conciliar de Banco Security por 9.178.

1. Sin cobertura definida, el escenario suma los 9.178 y queda provisional.
2. Al vincular la cuota, el escenario la excluye (excluidas: 1 · 9.178) y Osiris queda completo.

### 4b.2 Tolerancia por moneda y diferencia exacta

- Tolerancias iniciales: **CLP 1 · USD 0,01 · EUR 0,01 · PEN 0,01 · UF 0,01**. Se editan en "Editar tolerancias" y se guardan en `creditos_config.tolerancias`, con usuario y fecha.
- Siempre se muestra la **diferencia exacta** (informado − app, sin redondear; el valor completo aparece al pasar el cursor) y la tolerancia aplicada.
- La tolerancia **solo absorbe redondeo**. El estado es "Conciliación incompleta", cualquiera sea la diferencia, si se cumple al menos una de estas condiciones:
  - hay cuotas sin desglosar;
  - hay cuotas por conciliar;
  - hay cuotas marcadas pagadas sin registro;
  - el saldo informado no tiene respaldo;
  - hay contratos con condiciones incompletas;
  - hay pagos sin vencimiento asociado.
- Verificado (tests):
  - USD con diferencia 0,01 → cuadra; con 0,02 → diferencia.
  - CLP con 0,6 → cuadra; con 1,5 → diferencia.
  - Sin respaldo o con datos de contrato faltantes → incompleta.
  - En la vista previa, la tolerancia USD se subió a 0,50. Privado Particular siguió "incompleta" y Banco Demo siguió "diferencia".

### 4b.3 Tipo de cambio

- **Proyecciones:** se mantiene el aviso cuando el TC tiene más de 7 días de antigüedad (o no tiene fecha), con el valor, la fecha y la fuente. Aparece en Análisis CFO, Saldo por Mes, la pestaña Créditos y el aviso de créditos del Flujo Empresas.
- **Conciliaciones históricas:** el equivalente en US$ de cada fila de la conciliación por acreedor usa el TC **de la fecha de corte** del certificado. Es el último dato con fecha ≤ corte, nunca uno posterior. Un TC declarado en el crédito con fecha posterior al corte no se usa: la fila dice "sin TC al corte".
- **TC declarado en el crédito:** si se usa porque Maestros no tiene el par, la cifra se rotula **ESTIMADO** en los KPI, en el aviso "Total ESTIMADO", en la tabla por moneda y en el flujo.
- Verificado:
  - Con 955 al 29-09 y 960 al 05-10, un corte al 30-09 usa 955.
  - Un TC declarado con fecha posterior al corte no se usa.
  - En la vista previa, un crédito EUR con TC declarado 0,85 del 01-09 aparece como estimado y con 30 días de antigüedad.

### 4b.4 Créditos en UF

**Fuente oficial verificada (documentación; la consulta en vivo está bloqueada desde este entorno):**
- La UF la calcula y publica el **Banco Central de Chile** en el Diario Oficial.
- Se publica a más tardar el día 9 de cada mes, con los valores diarios del 10 de ese mes al 9 del mes siguiente.
- **mindicador.cl** expone el indicador `uf` (endpoint `/api/uf/dd-mm-yyyy`) con datos tomados del Banco Central. Es la misma API que la app ya usa para USD y EUR.
- Fuentes consultadas:
  - [mindicador.cl](https://mindicador.cl/)
  - [documentación de la API](https://github.com/LuisFigueroaG/mindicador)
  - [uf-hoy.com](https://www.uf-hoy.com/)
  - [Buk: valor UF hoy](https://www.buk.cl/novedades/finanzas/valor-uf-hoy)

Implementación:
- El botón de actualización de Maestros → Tipo de Cambio ahora también descarga la UF al par `UF-CLP`, con fuente `mindicador`. Un valor **manual** prevalece.
- Cada pago y cada vencimiento en UF usa la UF **de su propia fecha**. El detalle del crédito muestra, bajo cada total, el equivalente en CLP con el valor UF, su fecha y su fuente:
  - si existe el valor publicado de ese día → exacto;
  - si es una fecha pasada sin valor de ese día → el último publicado anterior;
  - si es una fecha futura sin valor publicado → **la última UF publicada al corte, rotulada "hipótesis de proyección"**. No se proyecta el reajuste por IPC.
- El USD-CLP de una fecha futura también es el último conocido (hipótesis).
- Verificado:
  - La UF publicada del 09-06 se usa exacta.
  - Un vencimiento del 10-12 usa la UF del corte y queda marcado como hipótesis.
  - Flujo de 1.000 UF: 1.000 × 39.600 / 955 = **41.465,97 US$**.

### 4b.5 Saldo por Mes = Análisis CFO

- Las dos vistas, más la pestaña Créditos (KPI, "Deuda por empresa", cierre de temporada y trimestres), leen ahora una sola función: `saldosAlCorte(creditos, corte)`.
- La fila **"Hoy"** de Saldo por Mes es la misma cifra que el KPI de Análisis CFO. La igualdad exacta está probada en el test del modelo; en el navegador se comparó con redondeo a miles: 514.551 → 515 K.
- Capital identificado y cuotas sin clasificar van en columnas separadas, y por conciliar aparte (solo en "Hoy").
- La vista en CLP usa el USD-CLP de Maestros con fecha y fuente. **Se eliminó el TC editable a mano**, que podía diferir del usado en Análisis.
- Muestra los mismos avisos que Análisis (incompleto, estimado, TC desactualizado, UF como hipótesis), también por fila y en el Excel, que tiene columnas separadas.

### 4b.6 Banco Demo: por qué 256.066,67 y no 300.000

Datos simulados. Crédito contrato USD 400.000, capital constante 100.000 por trimestre,
tasa 8 %, base Act/360, desembolso el 10-01-2026. Corte: 01-10-2026.

| Movimiento hasta el corte | Capital | Interés | ¿Toca el capital? |
|---|---:|---:|---|
| Capital inicial (desembolso 10-01) | 400.000,00 | — | — |
| Prepagos | 0,00 | — | no hay |
| Anulaciones | — | — | no hay |
| Pago cuota 10-04 | −100.000,00 | 8.000,00 | solo la parte de capital |
| Pago parcial cuota 10-07 (vía nómina, 50.000) | −43.933,33 | 6.066,67 | solo la parte de capital |
| **Capital app al corte** | **256.066,67** | | |

- Interés de la cuota 10-07: 300.000 × 8 % × 91/360 = 6.066,67. Capital del pago parcial: 50.000 − 6.066,67 = 43.933,33. El interés se imputa antes que el capital (art. 1595 CC).
- Capital pagado: 100.000 + 43.933,33 = 143.933,33. Capital app: 400.000 − 143.933,33 = 256.066,67.
- **Ningún interés se descontó del capital.** Los intereses pagados, 8.000 + 6.066,67 = 14.066,67, se listan aparte y no entran al cálculo. El panel "Ver movimientos" lo muestra con un control: el cálculo paso a paso es igual al capital app.
- El certificado simulado informa 300.000, porque omite el pago de capital del 10-07. Diferencia exacta: 300.000 − 256.066,67 = **43.933,33** USD, igual al capital de ese pago. El estado es **"Diferencia de capital"**.
- En datos reales, una diferencia así se resuelve de dos formas. Si el pago del 10-07 existió, se pide al acreedor el certificado actualizado. Si no existió, se anula el pago en la app con motivo.

---

---

## 5. Qué se verificó y cómo

| Nivel | Qué | Resultado |
|---|---|---|
| Compilación | `CI=true npx react-scripts build` | sin errores |
| Modelo (Node) | `node src/creditos.test.mjs`: 6 casos pedidos, conciliación, nómina, tasa variable, TC de Maestros, conciliación por acreedor y (3.ª revisión) movimientos de Banco Demo, tolerancias, TC al corte, estimado, UF, Saldo por Mes = Análisis; también con TZ=America/Santiago | todo OK |
| Suite jest | `CI=true npx react-scripts test --watchAll=false` (incluye hoja "Servicio deuda" y escenario con cobertura explícita) | todo OK |
| Navegador (datos simulados) | `scripts/e2e/vista-previa-creditos.mjs`: puntos 1–8 (cobertura, tolerancia, movimientos, Saldo por Mes, estimado, UF), Excel recalculado por LibreOffice | 36/36 OK |
| Navegador (datos simulados) | `scripts/e2e/creditos.mjs`, `scripts/e2e/nomina-credito.mjs` | OK / OK |
| Navegador (datos simulados) | `scripts/e2e/regresion-empresas.mjs`: pantalla vs Excel recalculado, 8 empresas | 12.032 celdas, 0 diferencias; 0 peticiones a producción |
| **Datos reales** | — | **NO verificado** |

---

## 6. Guía breve: cargar y conciliar los créditos reales desde la app

> **Estado: PENDIENTE DE VALIDACIÓN.** Nada de lo anterior concilia datos reales. Las
> cifras de este documento (Banco Demo, Osiris 150.000, Privado Particular, etc.) son
> simuladas. La conciliación real se da por terminada solo cuando la hagas tú en la app y
> cada acreedor quede en "Cuadra" o con su diferencia explicada.

**Preparar**

1. Descarga el **💾 Respaldo** antes de empezar.
2. **Tipo de cambio:** en Maestros → Tipo de Cambio, presiona actualizar. Ahora descarga USD-CLP, EUR y **UF**. Carga a mano **USD-PEN** (las APIs no lo cubren) y cualquier valor que quieras fijar: lo manual prevalece. Debe haber un dato con fecha ≤ a cada fecha de corte que vayas a conciliar.
3. **Tolerancias:** en Créditos → 🔎 Conciliación → "Editar tolerancias", confirma o ajusta los valores iniciales (CLP 1 · USD/EUR/PEN/UF 0,01).

**Cargar cada crédito** (Créditos → ➕)

4. **Contrato**: tipo de cuota, tasa (fija, o variable con referencia + margen), base, periodicidad, gracia, cargos y condición de prepago. Si el acreedor entrega la tabla de desarrollo, cárgala como **calendario manual**. Lo que falte queda listado como "dato faltante"; la app no lo inventa.
5. **"Controlado desde"**: la fecha desde la que registras pagos en la app. Lo vencido antes queda "por conciliar".
6. Moneda original y, si Maestros no tiene el par, el TC declarado con su fecha (el total queda rotulado "estimado").

**Conciliar**

7. **Cuotas por conciliar:** con "📥 Exportar a Excel para cotejar", revisa contra las cartolas. Si una cuota se pagó, regístrala en 📅 → "💵 Pagar" con la fecha y el monto reales. Si no se pagó, usa "Confirmar impaga" con el respaldo.
8. **Cuotas antiguas sin desglose:** usa "Desglosar cuota" con la tabla de desarrollo o el pagaré como respaldo.
9. **Valores manuales antiguos** de Pago Préstamos y Renovaciones, mes a mes:
   - "Usar Créditos", o "Mantener" con motivo.
   - En el mes en curso, define también su **cobertura** ("Definir"): qué cuotas por conciliar incluye. Mientras no la definas, el escenario queda **provisional**.
10. **Saldo de cada acreedor:** en "Conciliación con cada acreedor" → "Saldo informado", registra el capital insoluto del certificado, su fecha de corte y el respaldo. Luego revisa:
    - **Cuadra:** la información está completa y la diferencia exacta es ≤ tolerancia.
    - **Conciliación incompleta:** resuelve el motivo indicado.
    - **Diferencia de capital:** abre **"Ver movimientos"**. Ahí ves el capital inicial, los prepagos, lo pagado con fecha ≤ corte, los pagos anulados y los posteriores (que no cuentan), y los intereses aparte. Con eso ubicas el pago faltante o mal imputado.
11. **Caja:** en el flujo de cada empresa, compara la fila SALDO ACUM. con la fila morada "incl. por conciliar".
12. **Cierre:** cuando cada acreedor esté en "Cuadra" o con su diferencia explicada y respaldada, exporta la conciliación y guárdala con el respaldo del día.

---

## 7. Pendientes que requieren información contractual o tu validación

1. **Datos reales no conciliados.** Requiere seguir el procedimiento de la sección 6 en la app.
2. **Desglose de cada cuota antigua** (capital / intereses / cargos): requiere las tablas de desarrollo o los pagarés.
3. **Condiciones de prepago** de cada crédito (comisión, aviso, mínimos): requieren los contratos. Hoy el ejemplo usa "1 mes de interés" solo como hipótesis de prueba.
4. **Tasas variables:** confirmar la referencia y el margen de cada contrato, y quién actualiza la hipótesis de la referencia y cada cuánto.
5. **Tolerancia UF:** el valor inicial es 0,01 UF (≈ CLP 395). Confirma si para la UF prefieres otra, por ejemplo 0,0001 UF.
6. **Cobertura de los valores manuales reales** del mes en curso: solo tú o tu equipo pueden decir qué cuotas incluye cada valor manual.
7. **UF en Maestros:** la descarga automática de UF se probó solo con datos simulados; la llamada real a mindicador.cl no se pudo ejecutar desde este entorno. Verifica el primer valor descargado contra el publicado por el Banco Central.
8. **Reajuste de la UF futura:** hoy la hipótesis es la UF vigente (sin IPC). Si quieres proyectar inflación, indica qué supuesto usar.

## 8. Limitaciones técnicas pendientes

1. **Documentos de respaldo.** Se guardan como enlaces. No hay subida a Supabase Storage.
2. **Prepago parcial en registros legacy o de socio.** Solo se simula; el prepago total sí se aplica.
3. **Renovaciones legacy.** Siguen con su modelo anterior: mensual, sin día.
4. **Flujo real.** Sigue siendo de ingreso manual; los pagos registrados no se trasladan. Falta definir esa conciliación.
5. **Saldo por Mes y cortes futuros:** proyecta suponiendo pagado lo que vence hasta cada cierre (igual que el flujo), no lo que efectivamente se pague.
6. **Fila de ajuste en vista semanal.** En la vista semanal, la fila de ajuste por valor manual aparece solo en la columna Σ del mes.
7. **Prepagos posteriores al corte.** La conciliación por acreedor recalcula el calendario de un contrato con todos sus prepagos, aunque tengan fecha posterior al corte. Es poco frecuente, pero puede descuadrar un corte antiguo.
