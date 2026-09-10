# Osiris · Notas de crédito y anulaciones — propuesta

**Propuesta. No implementada. No altera ningún saldo histórico.**
Nada de esto detiene la validación visual ni el respaldo.

---

## Punto de partida medido

En la fila `osiris` de producción, hoy:

- `"notaCredito"`, `"notasCredito"`, `"anulado"`, `"anulada"`: **0 apariciones**.
- `"cobros"` (cobros parciales): **0 apariciones**, aunque el código de cobros
  parciales existe en `OsirisModule.jsx` desde la línea ~397.
- El único mecanismo de neteo hoy es el booleano `pagado`, que es todo o nada.

No hay nada que migrar y no hay historia que reescribir. Eso hace la decisión
barata **ahora** y cara después.

## Forma propuesta

Un arreglo `ajustes[]` **dentro del hecho de ingreso que ya existe**
(`feeEntrada`, `royaltyPlanta`, `royaltyComercial`, `feeViveros`), al lado de
`pagos[]`. No una tabla nueva, no una fila nueva en `calendario_data`, no un
segundo padrón de facturas.

```jsonc
{
  "id": "aj_1789...",              // identificador propio
  "tipo": "nota_credito",          // nota_credito | anulacion
  "facturaRef": "F-4321",          // el nFact al que se aplica, no un id interno
  "documento": "NC-000123",        // número del documento emitido
  "moneda": "USD",                 // la del contrato; no se convierte sola
  "monto": 1500.00,                // positivo; el signo lo pone el `tipo`
  "fecha": "2026-09-15",           // fecha civil de Chile, del documento
  "motivo": "descuento por merma acordada",
  "emitidoPor": "identity_id",     // quién lo registró
  "registradoEn": "2026-09-15T14:02:11-03:00",
  "anulaTotal": false              // true solo para `tipo: "anulacion"`
}
```

`saldoDe()` **ya lee `ajustes[]` y ya los resta**. Está implementado y probado:
`resta los ajustes registrados` y `no inventa notas de crédito ausentes`. Lo que
falta no es el cálculo, es la captura y las reglas de negocio.

## Reglas que propongo, y que NO implemento hasta que las revises

1. **Una anulación deja la factura en saldo cero y saca la fila de cobranza.**
   No la borra: la fila queda con `estado: cerrado` y motivo "anulada por NC-…".
2. **Una nota de crédito parcial reduce el saldo y la fila sigue en cobranza**
   por la diferencia.
3. **Ningún ajuste puede dejar el saldo negativo.** Si `monto > saldo`, se
   rechaza al capturarlo, no al calcularlo.
4. **La moneda del ajuste debe ser la de la factura.** Sin conversión automática:
   si difieren, se rechaza. Convertir en silencio es cómo se pierde plata.
5. **Un ajuste es inmutable.** Si está mal, se registra otro que lo compense.
   Corregir el original destruye la trazabilidad que justifica el ajuste.
6. **Fecha civil de Chile**, con las mismas reglas de huso que ya usa la bandeja.

## Trazabilidad

Cada ajuste se registra además en `window.auditLog` con `modulo: "osiris"`,
`accion: "ajuste"`, `valorAnterior` = saldo previo, `valorNuevo` = saldo
resultante. La bitácora productiva ya guarda `valorAnterior` en los 8.164
eventos que tiene, así que el formato existe y no hay que inventarlo.

## Lo que esta propuesta NO hace

- No toca ningún saldo ya registrado.
- No convierte devengo en facturable.
- No crea una tabla de facturas: la factura sigue viviendo en el hecho de
  ingreso y en los campos `contractFee*` del contrato, como hoy.
- No decide qué pasa con el caso de conflicto que ya está en la bandeja
  (contrato dice pagado, registro derivado dice por cobrar). Ese caso se
  concilia primero; recién después tiene sentido registrar ajustes sobre él.

## Lo que necesito de ti para implementarlo

1. ¿Una anulación cierra la fila o la deja visible como "anulada"?
2. ¿Quién puede registrar un ajuste? Hoy no hay rol para eso en Osiris.
3. ¿El documento de la nota de crédito se adjunta? Si sí, entra en el alcance
   del incidente de adjuntos, que coordina PLATFORM SECURITY.
