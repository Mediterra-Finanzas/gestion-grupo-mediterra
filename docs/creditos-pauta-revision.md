# Créditos: pauta breve de revisión en la vista previa

> **Datos simulados.** Nada de esto concilia los créditos reales: la conciliación real
> sigue **pendiente de validación** y la cobertura de los valores manuales se definirá
> con el equipo. La vista previa no lee ni escribe en producción y no envía correos.

## Cómo abrirla

En las dos versiones **nada se confirma por ti**: cada motivo lo escribes tú, y cada pago, anulación o prepago lo aceptas o cancelas tú.

- **Enlace (Artifact):** https://claude.ai/artifact/8gM287dbiu1FieVMYEiqp2. No requiere instalar nada.
  - Cuando la app pide un motivo o una confirmación, aparece un cuadro dentro de la página con el texto, un campo para el motivo y los botones **Aceptar** y **Cancelar**.
  - Con Cancelar no se registra nada.
  - Con Aceptar, la acción se ejecuta con lo que escribiste.
  - Los Excel se descargan desde el botón de exportar de siempre; el visor te pide confirmar antes de guardar el archivo.
- **Local:** usa los diálogos y descargas normales del navegador. Requiere Node y una copia del repositorio en la rama del PR.

  ```bash
  node scripts/vista-previa/armar.mjs --build
  node scripts/vista-previa/servir.mjs
  ```

  Luego abre http://localhost:4180. Es la única versión desde la que se puede **intentar** la descarga de UF en vivo; ver el punto 5.

**Ingreso:** `ahuerta@grupomediterra.cl`, PIN `482913`. Luego Flujo de Caja → 💳 Créditos.

- Lo que registres queda en tu navegador.
- **"Reiniciar datos"** (barra amarilla) vuelve al punto de partida.
- Las cifras de abajo suponen que revisas a comienzos de octubre de 2026. Si revisas más tarde, las cuotas que venzan entretanto aparecerán como vencidas y se arrastrarán al mes en curso.

## 1. Crédito con cuotas: Banco Demo (Osiris)

US$ 400.000, capital constante de 100.000 por trimestre, tasa 8 %, base Act/360. Ruta: Créditos → fila Banco Demo → 📅 Pagos.

| Cuota | Días | Interés | Total |
|---|---:|---|---:|
| 10-04-2026 | 90 | 400.000 × 8 % × 90/360 = 8.000,00 | 108.000,00 (pagada) |
| 10-07-2026 | 91 | 300.000 × 8 % × 91/360 = 6.066,67 | 106.066,67 |
| 10-10-2026 | 92 | 200.000 × 8 % × 92/360 = 4.088,89 | 104.088,89 |
| 10-01-2027 | 92 | 100.000 × 8 % × 92/360 = 2.044,44 | 102.044,44 |

Revisa:
- La suma de capital da 400.000.
- Total = capital + intereses + cargos.
- La cuota del 10-07 aparece "vencida (parcial)" y en el flujo de Osiris se arrastra al mes en curso con su fecha original.

## 2. Bullet: Banco Bullet Demo (Allegria Foods)

US$ 250.000 con intereses semestrales al 6 %, base Act/365. El capital se paga al vencimiento.

- 15-10-2026: interés 250.000 × 6 % × 183/365 = **7.520,55**. Capital 0.
- 15-04-2027: interés 250.000 × 6 % × 182/365 = **7.479,45** más capital **250.000**.

## 3. Pago parcial (Banco Demo)

**Ya cargado.** La cuota del 10-07 tiene un abono de 50.000 hecho desde la nómina de Osiris de hace dos semanas. Se imputó así:
- Interés: 6.066,67, primero.
- Capital: 50.000 − 6.066,67 = 43.933,33.
- Pendiente de la cuota: 106.066,67 − 50.000 = **56.066,67**.

**Para probar tú:**
1. En la cuota del 10-10, presiona 💵 Pagar.
2. Ingresa intereses 4.088,89 y capital 25.911,11. Total: 30.000.
3. Resultado esperado: pendiente 104.088,89 − 30.000 = **74.088,89**, en estado "parcial".
4. Anula el pago con un motivo: la cuota vuelve a quedar completa y el pago queda en el historial como anulado, no se borra.

**Nómina → crédito** (Nóminas → Osiris):
- **Semana en curso (borrador):** vincula la línea a una cuota. Comprueba que vincular **no** registra ningún pago en Créditos.
- **Semana anterior (aprobada, con ‹):** ya está vinculada a la cuota del 10-10. Presiona "Confirmar pago efectivo" para registrar el abono de 30.000, imputado primero a interés y luego a capital. Reintentar no lo duplica.

Una nómina aprobada no se puede editar, por eso la vinculación se prueba en la de borrador.

**Conciliación:** en 🔎 Conciliación, Banco Demo aparece en **Diferencia de capital**: el certificado simulado dice 300.000 y la app 256.066,67. Con "Ver movimientos" ves la explicación:
- Capital: 400.000 − 100.000 − 43.933,33 = 256.066,67.
- Los intereses pagados (14.066,67) se muestran aparte y no reducen el capital.

## 4. Prepago: Banco Prepago Demo (Integrity Farms)

US$ 300.000 en cuota fija mensual, tasa 7,2 %, base Act/360. Las cuotas de abril a octubre están pagadas. Saldo de capital: **111.566,98**. Comisión de prepago: 1 % del capital.

Ruta: 🧮 Simular prepago → Banco Prepago Demo → fecha 15-10-2026.

| | Total | Parcial 100.000 (reduce plazo) |
|---|---:|---:|
| Capital | 111.566,98 | 100.000,00 |
| Interés devengado desde el 01-10 (14 días) | 111.566,98 × 7,2 % × 14/360 = 312,39 | 100.000 × 7,2 % × 14/360 = 280,00 |
| Comisión 1 % | 1.115,67 | 1.000,00 |
| **Desembolso** | **112.995,04** | **101.280,00** |
| Intereses evitados (netos del devengado) | 1.407,52 | 1.368,19 |
| Ahorro neto (− comisión) | 291,85 | 368,19 |

- Simular no cambia nada.
- "Aplicar prepago" registra el pago y recalcula el calendario.
- Anular ese pago revierte el prepago.

## 5. Crédito en UF: Banco UF Demo (Mediterra)

1.000 UF en dos cuotas semestrales de capital 500, tasa 3,5 %, base Act/360. Ruta: 🔎 Conciliación → panel **"UF utilizada: contrastar valor, fecha y fuente"**.

| Cuota | Monto en UF | UF usada | Equivalente |
|---|---|---|---|
| 09-10-2026 | 500 + 1.000 × 3,5 % × 183/360 = **517,7917 UF** | **Publicada para esa fecha:** 40.131,84 (simulada) | 517,7917 × 40.131,84 = CLP 20.779.933,66 → / 955 = **US$ 21.759,09** |
| 09-04-2027 | 500 + 500 × 3,5 % × 182/360 = **508,8472 UF** | **Hipótesis:** sin UF publicada, se usa la última disponible (40.118,27, con su fecha visible) | 508,8472 × 40.118,27 = CLP 20.414.069,36 → **US$ 21.375,99** |

No se proyecta IPC. El USD-CLP de una fecha futura es el último conocido (955, manual).

**Conciliación en UF:**
- El acreedor informa 1.000,0003 UF y la app tiene 1.000,0000 UF.
- La diferencia exacta es **0,0003 UF**, mayor que la tolerancia de 0,0001 UF, así que el estado es **Diferencia de capital**.
- Si cambias la tolerancia de UF a 0,001 en "Editar tolerancias", pasa a **Cuadra**.
- Si el saldo informado no tuviera respaldo, el estado sería "incompleta" con cualquier tolerancia.

**Descarga de UF en vivo: PENDIENTE, NO VERIFICADA.**
- La versión con enlace no sale a internet, así que no puede descargar la UF.
- En la versión **local**, Maestros → Tipo de Cambio → "Actualizar hoy" **intenta** la descarga desde mindicador.cl.
- Ese intento no está verificado: desde el entorno de desarrollo la llamada real estuvo bloqueada, así que nunca se comprobó la respuesta.
- Para darla por buena hay que comprobar tres cosas contra el Banco Central para la misma fecha:
  - el **valor**;
  - la **fecha** (la del valor, no la de la descarga);
  - la **fuente** (`mindicador` en la tabla de Maestros y en el panel "UF utilizada").
- Si algo difiere, carga la UF como valor manual (el par `UF-CLP` ya se acepta) y avísame.
- Hasta entonces, el panel "UF utilizada" sigue mostrando "pendiente de prueba en vivo".

## Otros puntos para mirar

- **Análisis CFO y Saldo por Mes:** la fila "Hoy" es la misma cifra que el KPI. Ambas muestran los mismos avisos:
  - total incompleto (PEN sin TC);
  - total estimado (EUR con TC declarado);
  - TC con más de 7 días;
  - UF como hipótesis.
- **Escenario "incl. por conciliar":** Osiris tiene un valor manual de 150.000 en el mes en curso.
  - Sin cobertura definida, el escenario suma la cuota de Banco Security (9.178) y queda **PROVISIONAL**.
  - Con "Definir" se vincula esa cuota y el escenario la excluye.
