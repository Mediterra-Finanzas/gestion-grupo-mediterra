# Waterfall desde el saldo bancario de corte — conciliación (datos FICTICIOS)

> **Estado 13-10 (tarde):** el resultado se rotula «Proyección parcial: mes del corte pendiente
> de conciliar». **No es un saldo final definitivo** y no está autorizado como tal. El mes del
> corte queda excluido: ni se incluye completo ni se supone que su pendiente es cero. La fila con
> el mes completo es una **simulación**, no el saldo correcto, ni un mínimo, ni un máximo. La
> fila «atribuible» se retiró. Propuesta para registrar el flujo posterior al corte y
> comparación de criterios entre pantallas: `propuesta-pendientes-corte.md`.

Alcance: build de la rama `claude/waterfall-perimetro` (desde `main` c9c5792), Chromium emulado,
Supabase falso y datos ficticios de la vista previa; Excel recalculado en LibreOffice. No es
producción.

## 1. Por qué no cuadraban 205.433 + 1.334.508 y 2.181.662

La versión anterior mezclaba tres períodos distintos:

| Concepto | Fecha / período usado | Monto (6 sociedades) |
|---|---|---|
| Saldo inicial | saldo bancario de cada sociedad, con **su** fecha: 08-10 a 12-10-2026; **Allegria Foods 15-09-2026** | 205.433 |
| Flujo del período | temporada completa Jul-26 → Jun-27 | 1.334.508 |
| Saldo final | saldo inicial + flujo **Oct-26 → Jun-27 de todas**, también Allegria Foods | 2.181.662 |

Mes a mes (flujo de las 6 sociedades):

| Mes | Flujo | Entra al flujo del período | Entra al saldo final anterior |
|---|---|---|---|
| Jul-26 | −276.316 | sí | no |
| Aug-26 | −174.299 | sí | no |
| Sep-26 | −191.106 (−161.854 de 5 sociedades + −29.252 de Allegria Foods) | sí | no |
| Oct-26 → Jun-27 | 1.976.229 | sí | sí |
| **Total** | **1.334.508** | | |

1.334.508 − 1.976.229 = −641.721. Esa es la diferencia, y es el flujo Jul–Sep de las 6
sociedades (−276.316 − 174.299 − 191.106).

No es un doble conteo: son meses que sumaban en una fila y no en la otra. Hay dos defectos
concretos:

- **Omisión sin aviso.** Allegria Foods tiene su saldo al 15-09. Lo que se movió después de esa
  fecha en septiembre no estaba en el saldo bancario ni en la proyección (su septiembre completo
  es −29.252).
- **Posible duplicación.** Las otras cinco sociedades tienen saldos del 08 al 12 de octubre.
  Sumaban octubre completo (−174.402), y lo pagado o cobrado entre el 1.º de octubre y la fecha
  del saldo ya está en el banco.

## 2. Tratamiento nuevo

Identidad que se muestra: **saldo al corte + flujo proyectado = saldo final**.

- **Corte por sociedad.** Es la fecha del saldo bancario, con el mismo criterio de conversión de
  Saldos Bancos (el US$ guardado con cada saldo). Si una sociedad tiene cuentas con fechas
  distintas, se usa la más reciente y se avisa.
- **Mes del corte.** No entra a la identidad. La proyección es mensual, sin fecha por movimiento,
  así que no permite separar lo que ya está en el banco: incluirlo puede duplicar y excluirlo
  puede omitir. Se eligió no duplicar. El monto se muestra aparte, junto con el saldo final que
  resultaría si el mes estuviera completo pendiente.
- **Proyectado.** Son los meses posteriores al mes del corte.
- **Histórico.** Son los meses de la temporada anteriores al mes del corte. Se informan, no suman.
- **Temporada futura.** El saldo inicial es el saldo al corte más el flujo proyectado hasta el
  inicio de la temporada. No se inventa un saldo de inicio de temporada.
- **Temporada terminada.** No tiene proyección; solo se muestra el histórico.
- **Sin saldo bancario** (Allpa Chile y Perú en estos datos). Se usa el saldo base del código, sin
  fecha, y así se rotula.

Temporada 2026-2027, 6 sociedades:

| Sociedad | Fecha del saldo | Saldo al corte | Histórico | Mes del corte (no incluido) | Proyectado | Saldo final |
|---|---|---|---|---|---|---|
| Mediterra | 10-10-2026 (Oct-26) | 85.000 | −9.850 | −3.283 | −1.051.268 | −966.268 |
| Allegria Service | 12-10-2026 (Oct-26) | 31.000 | −153.807 | −48.399 | −540.003 | −509.003 |
| Frisku Foods | 09-10-2026 (Oct-26) | 0 (EUR sin TC: INCOMPLETO) | −92.703 | −22.697 | 629.279 | 629.279 |
| Integrity Farms | 08-10-2026 (Oct-26) | 22.000 | −37.050 | −12.400 | −98.850 | −76.850 |
| Osiris | 11-10-2026 (Oct-26) | 50.000 | −254.920 | −87.622 | 3.507.451 | 3.557.451 |
| Allegria Foods | 15-09-2026 (Sep-26) | 17.433 | −64.138 | −29.252 | −295.978 | −278.545 |
| **Total** | 15-09 a 12-10-2026 | **205.433** | **−612.469** | **−203.654** | **2.150.631** | **2.356.064** |

- 205.433 + 2.150.631 = 2.356.064.
- −612.469 − 203.654 + 2.150.631 = 1.334.508: es el flujo de la temporada; nada se pierde ni se
  repite.
- Si el mes del corte estuviera completo pendiente, el saldo final sería 2.152.410
  (2.356.064 − 203.654).
- Contra el saldo final anterior (2.181.662), toda la diferencia es el octubre de las cinco
  sociedades con corte en octubre, que ya no entra: 2.181.662 + 174.402 = 2.356.064. El septiembre
  de Allegria Foods (−29.252) no entraba antes ni entra ahora. La diferencia es que ahora se
  muestra como su mes del corte, en vez de desaparecer sin aviso.

Conciliación mes a mes (pantalla «Conciliación mes a mes» y hoja «Conciliación» del Excel):

| Mes | Histórico | Mes del corte | Proyectado | Saldo proyectado acumulado |
|---|---|---|---|---|
| Jul-26 | −276.316 | | | |
| Aug-26 | −174.299 | | | |
| Sep-26 | −161.854 | −29.252 | | |
| Oct-26 | | −174.402 | −31.568 | |
| Nov-26 | | | 996.531 | 1.170.396 |
| Dec-26 | | | −355.946 | 814.450 |
| Jan-27 | | | 143.873 | 958.323 |
| Feb-27 | | | −17.333 | 940.990 |
| Mar-27 | | | 2.303.544 | 3.244.534 |
| Apr-27 | | | −1.271.798 | 1.972.736 |
| May-27 | | | −188.441 | 1.784.295 |
| Jun-27 | | | 571.769 | 2.356.064 |

Nov-26: 205.433 − 31.568 + 996.531 = 1.170.396. El acumulado del total parte cuando todas las
sociedades pasaron su mes del corte.

## 3. Inclusión proporcional de JV = vista gerencial

Al activar «Perú 26 %» en el Consolidado (rotulado «Allpa · vista gerencial proporcional (no IAS
28)»), el total pasa a llamarse «TOTAL · VISTA GERENCIAL» y el pie lo declara: no es
consolidación contable, porque bajo IAS 28 una JV va por método de participación y su caja no se
suma.

- **Solo se escala la JV.** Saldo 208.000 × 26 % = 54.080; flujo proyectado
  −1.217.718 × 26 % = −316.607.
- **Las subsidiarias no cambian.** Allegria Service sigue en 31.000 y −540.003; Frisku Foods, en 0
  y 629.279.
- **Total.** 205.433 + 54.080 = 259.513; 2.150.631 − 316.607 = 1.834.024;
  259.513 + 1.834.024 = 2.093.537.

La fila «Participación Controladora» aplicaba el % de propiedad a la caja de las subsidiarias:
**retirada** de la pantalla y del Excel.

## 4. Excel

Saldo final = saldo inicial + flujo proyectado y total = suma de las sociedades van como
**fórmulas**, con su valor.

| Archivo | Fórmulas | Distintas al recalcular en LibreOffice | Columnas que cumplen la identidad |
|---|---|---|---|
| 2026-2027 | 27 | 0 | 9 de 9 |
| 2027-2028 | 24 | 0 | 9 de 9 |
| 2026-2027 con Allpa Perú proporcional | 27 | 0 | 9 de 9 |

Hoja 2: conciliación por sociedad y mes, con fecha y saldo de corte. Archivos en esta carpeta.

## 5. Límites y decisiones abiertas

- El mes del corte queda fuera **entero**. Lo que falte pagar o cobrar de ese mes después del
  corte no está en el saldo final. Se ve el monto y el saldo alternativo, pero el número
  principal puede sobrestimar la caja si hay egresos de fin de mes. Separarlo exige movimientos
  con fecha: un desglose semanal confiable no existe en `main`.
- Consolidado y Dashboard siguen con el criterio anterior (mes en curso completo, sin fecha por
  sociedad). No se tocaron.
