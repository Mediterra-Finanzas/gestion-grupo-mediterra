# Matriz de cierre · Osiris

Corte 2026-09-10. Sin porcentajes: hay tramos sin ejercer.
Cifras de **producción** leídas en solo lectura; **staging** rotulado aparte.
Ninguna operación de esta etapa eliminó ni sobrescribió datos de producción.

Estados: **OBSERVADO** · **NO OBSERVADO** · **PROBADO EN STAGING** · **FALLÓ** ·
**DETENIDO** (listo, esperando decisión) · **DECISIÓN** (requiere a una persona).

---

## 1 · Respaldo automático

| Tramo | Estado |
|---|---|
| snapshot → cifrado A/B → subida → READY → verificación (en proceso) | PROBADO EN STAGING · 14/14 |
| credencial sin identidad → evidencia incompleta → reintento, mismo snapshot | PROBADO EN STAGING · 22/22 |
| registro append-only de cada invocación, sin direcciones de correo | PROBADO EN STAGING · 9/9 |
| **B1 · Run manual desde el panel** | **NO OBSERVADO** |
| **B2 · Disparo automático por horario** | **NO OBSERVADO** |
| **B3 · Descarga, descifrado y restauración del lote remoto** | **NO OBSERVADO** |
| **B4 · Correo de prueba: aceptado por SMTP / recibido** | **NO OBSERVADO / NO OBSERVADO** |

**AUTOMATIZACIÓN COMPLETA = NO EJERCIDA** hasta observar B2 y B3. B1 no cierra B2.
Guía de panel: `GUIA-PANEL-VERCEL.md`. Comprobación posterior: `scripts/respaldo/verificar-runtime-remoto.mjs`.

## 2 · Recuperabilidad — pendiente propio

| Punto | Estado |
|---|---|
| Reconstrucción aislada desde la bitácora | **FALLÓ** · no sirve como sustituto del respaldo |
| Diagnóstico conservado | 708 de 1.399 eventos de contratos cortados a 200 caracteres; 109 campos distintos contra el snapshot de Fase 0; cambios sin registro |
| Respaldo nativo de producción | NO VERIFICADO · requiere captura del panel |
| Respaldo de adjuntos | NO RESPALDADO por este paquete · PLATFORM SECURITY |

No se amplía a una reescritura de auditoría en esta etapa.

## 3 · Cartera de los 23 contratos — producción

| Clasificación | Contratos |
|---|---|
| Conflicto | 1 |
| Pendiente confirmado | 4 |
| Información pendiente | 14 |
| Marcado pagado en el sistema | 4 |
| Pago corroborado | 0 |
| No aplicable | 0 |

**Contract fee, importes contractuales** — ninguno es deuda confirmada:

| Rótulo | USD |
|---|---|
| Pendiente de conciliación | 240.000 |
| Con factura, sin pago registrado | 30.000 |
| En conflicto | 30.000 |
| Marcado pagado en el sistema, sin corroborar | 390.000 |
| Pago corroborado | 0 |
| **Cuadre** | **690.000** |

**Qué sostiene los USD 390.000:** 13 contratos con número de factura y estado
pagado registrados en el contrato. 10 tienen fecha de pago; 3 no. **Ninguno tiene
comprobante ni referencia de conciliación.** 10 muestran cambios de esos campos en
la bitácora; 3 se fijaron antes del 2026-07-10 y no hay registro de quién ni cuándo.

**Planilla única:** `conciliacion-osiris/Osiris-conciliacion-23-contratos-2026-09-10.xlsx`
(local, fuera de git): 69 filas por concepto, 46 cuotas, 14 filas de evidencia.
Responsable interno "Sin asignar" en 69 de 69. **Correos reales bloqueados.**

## 4 · Fee Entrada con fuente única

| Punto | Estado |
|---|---|
| Implementación en rama aislada `osiris/fee-entrada-fuente-unica` | hecho, local |
| Registros anteriores `feeEntrada[]` | conservados con procedencia, sin borrar ni reescribir |
| Discrepancia `…2ba225` | en conciliación: no editable, fuera de correos, sin cobro en cálculos |
| Preservación sobre datos reales | producción 94/94 registros · 2.004/2.005 campos · 7/7 relaciones |
| **Impacto económico** | **DETENIDO · DECISIÓN** |

Desplegarla cambia: Resumen cobrado USD 0 → 390.000; Pago Obtentores, deuda por
contract fee USD 0 → 273.000 bruto / 245.700 neto, para un obtentor. Todo sobre
pagos sin corroborar. Detalle y opciones: `IMPACTO-FEE-ENTRADA-FUENTE-UNICA.md`.

## 5 · Ajustes · notas de crédito y anulaciones

| Punto | Estado |
|---|---|
| Capacidades `osiris.ajuste.registrar` / `osiris.ajuste.aprobar` | PROBADO EN STAGING · 14/14 |
| Quien registra no aprueba, tampoco con ambas capacidades | probado |
| Append-only, anulación visible, nota de crédito con respaldo | probado |
| Concedida a personas | **no** · 0 asignaciones tras revertir |
| Producción y permisos productivos | sin cambios |

## 6 · Diseño

| Punto | Estado |
|---|---|
| Harness de revisión, datos de staging | se conserva en `runtime/staging-respaldo` |
| Integración en la aplicación real | rama local `osiris/integracion-ux-app`, montaje detrás de bandera, 261/261, compila |
| **Prueba integrada** (navegación, permisos, carga, guardado, alertas, concurrencia) | **PENDIENTE** · requiere que la app apunte a staging sin escribir en producción |
| URL de revisión | NO OBSERVADO · depende del proyecto de Vercel |

Las ramas que montan la aplicación **no se empujan**: Vercel crearía un Preview
vivo contra producción.

## 7 · Correo

| Punto | Estado |
|---|---|
| Composición, conflicto excluido, sin duplicados, destinatarios sintéticos | PROBADO EN STAGING · 13/13 |
| Entrega real | NO OBSERVADO |
| Envíos reales | BLOQUEADO hasta: cobertura conciliada, responsables asignados, destinatarios aprobados, buzón de prueba designado |
