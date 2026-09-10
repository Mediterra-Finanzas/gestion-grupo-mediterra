# Osiris · Notas de crédito y anulaciones — reglas y controles

**Preparado. No implementado. No cambia ningún saldo histórico.**
Incorpora tus decisiones del 2026-09-10: la anulación queda visible y trazable, y
la nota de crédito se vincula a su factura con respaldo documental.

---

## Punto de partida medido

En la fila `osiris` de producción no existe ningún registro de nota de crédito,
anulación ni cobro parcial. No hay historia que migrar ni saldo que reinterpretar.

Hay además un hallazgo que condiciona el diseño: **el mismo hecho se registra en
dos lugares**. El factura/pago del contract fee se edita en la pestaña
Contratos (`contractFeeNFact`, `contractFeePagado`, `contractFeeEstado`) y la
pestaña Fee Entrada muestra una fila persistida aparte (`feeEntrada[]`) que no
lee el contrato. Si los ajustes se registran en una sola de las dos, se repite
el conflicto de Agroextiende. **Los ajustes se anclan al contrato**, que es la
fuente que el propio código declara ("El contrato es la fuente de verdad").

## Forma

Un arreglo `ajustes[]` dentro del registro de factura que ya existe — en el
contrato para el contract fee, y en la cuota (`rpPlantaCuotas[]`) para royalty
planta. No es una tabla nueva ni un segundo padrón de facturas.

```jsonc
{
  "id": "aj_…",
  "tipo": "nota_credito",            // nota_credito | anulacion
  "facturaRef": "43",                // nFact al que se aplica; obligatorio
  "documento": "NC-000123",          // número del documento emitido; obligatorio
  "respaldo": {                      // obligatorio para nota_credito
    "ruta": "osiris-docs/…/NC-000123.pdf",
    "sha256": "…",
    "bytes": 48211
  },
  "moneda": "USD",                   // igual a la de la factura
  "monto": 1500.00,                  // positivo; anulacion = total de la factura
  "fecha": "2026-09-15",             // fecha civil de Chile, del documento
  "motivo": "descuento por merma acordada",   // obligatorio, texto libre no vacío
  "registradoPor": "identity_id",    // actor
  "registradoEn": "2026-09-15T14:02:11-03:00",
  "revierteA": null                  // id del ajuste que compensa, si es una corrección
}
```

## Reglas

1. **Una anulación nunca borra.** La factura sigue existiendo, con su número, su
   importe y su historia. Queda en clase **cerrado con evidencia**, motivo
   "anulada por NC-…", visible en la ficha del contrato y en la bandeja bajo
   cerrados. Actor, fecha y motivo son obligatorios.
2. **Una nota de crédito se vincula a una factura existente.** Sin `facturaRef`
   que exista en el contrato o la cuota, se rechaza al capturar.
3. **Sin respaldo documental no hay nota de crédito.** El PDF se guarda en
   Storage con su SHA-256; el registro guarda ruta, hash y tamaño. Ese archivo
   entra en el alcance del respaldo de adjuntos, que coordina PLATFORM SECURITY.
4. **Un ajuste no deja saldo negativo.** Si `monto > saldo vigente`, se rechaza
   al capturar, no al calcular.
5. **Misma moneda que la factura.** Sin conversión automática.
6. **Inmutable.** Un ajuste mal registrado se compensa con otro que lo cite en
   `revierteA`; el original no se edita ni se elimina.
7. **Un contrato en conflicto no admite ajustes** hasta conciliarse. Registrar
   una nota de crédito sobre dos registros que se contradicen fija cuál de los
   dos "manda" sin que nadie lo haya decidido.

`saldoDe()` ya resta `ajustes[]` y ya está probado (`resta los ajustes
registrados`, `no inventa notas de crédito ausentes`). Lo que falta es la
captura con estas validaciones.

## Trazabilidad

Cada ajuste se escribe también en la bitácora con `modulo: "osiris"`,
`accion: "ajuste"`, `registroId` = contrato, `campo` = `ajustes`, y el saldo
previo y resultante.

Aviso medido que afecta a esto: **la bitácora corta los valores a 200
caracteres**. En `osiris / Contratos`, 708 de 1.399 eventos están cortados,
casi todos sobre campos que son arreglos (`rpPlantaCuotas` 655). Un arreglo de
ajustes registrado igual quedaría cortado. Para los ajustes la bitácora debe
guardar el **ajuste individual** (que cabe), no el arreglo completo.

## Permisos

Lo que existe hoy en Osiris:

| Permiso | Quién edita | Qué habilita |
|---|---|---|
| `tabPermisos.contratos = "editar"` | editor, admin, gerente_tecnico | pestaña Contratos, incluidos `contractFee*` |
| `tabPermisos.royalties = "editar"` | editor, admin, gerente_tecnico | pestañas de ingresos (`canIngresos`) |
| rol `admin` | admin | todo |

En IAM de staging (`iam_rol_capability`) no hay ninguna capacidad de Osiris,
facturación ni cobranza.

**Reutilización propuesta, sin conceder nada:** registrar una nota de crédito
exige `tabPermisos.royalties = "editar"`, igual que hoy exige editar ingresos.

**Brecha identificada:** no existe una capacidad para **aprobar** un ajuste que
reduce un importe cobrable. Con los permisos actuales, la misma persona que
registra la nota de crédito la daría por buena. Para anulaciones y notas de
crédito sobre facturas cobradas propongo separación (quien registra no aprueba),
lo que requiere una capacidad nueva — por ejemplo `osiris.ingresos.ajuste.aprobar`.
**No la creo ni la asigno**: es decisión tuya y del carril de identidad.

## Lo que necesito de ti

1. ¿Separación registra/aprueba para todo ajuste, o solo sobre importe mayor a un umbral?
2. Con los permisos actuales, ¿quién puede registrar mientras no exista la capacidad de aprobación?
3. ¿Dónde se guarda el PDF de la nota de crédito? Hoy Osiris no usa Storage; los documentos del contrato están en SharePoint.
