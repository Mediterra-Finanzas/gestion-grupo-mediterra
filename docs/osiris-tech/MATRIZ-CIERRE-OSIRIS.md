# Matriz de cierre · Osiris

Corte 2026-09-10, tercera actualización. Sin porcentajes: hay tramos sin ejercer.
Las cifras de **producción** se leyeron en solo lectura; las de **staging** van rotuladas
aparte. Ninguna operación de esta etapa eliminó ni sobrescribió datos de producción.

Estados: **OBSERVADO** · **NO OBSERVADO** · **PROBADO EN STAGING** · **PROBADO LOCAL** ·
**FALLÓ** · **DETENIDO** (listo, esperando decisión) · **DECISIÓN** (requiere a una persona) ·
**PREPARADO, NO EJECUTADO** · **BLOQUEADO** · **NO EJERCIDO** · **NO DECLARABLE**.

---

## 1 · Respaldo automático

| Tramo | Estado |
|---|---|
| snapshot → cifrado A/B → subida → READY → verificación en memoria | PROBADO EN STAGING · 14/14 |
| credencial sin identidad → evidencia incompleta → reintento con el mismo snapshot | PROBADO EN STAGING · 22/22 |
| registro append-only de cada invocación, sin direcciones de correo | PROBADO EN STAGING · 9/9 |
| registro del commit, la rama y el entorno de cada invocación | columnas aplicadas en staging; handler actualizado, sin desplegar |
| snapshot consistente con modo de identidad declarado (`sql/respaldo/snapshot-consistente.sql`) | PROBADO EN STAGING · aplicado con captura previa y preflight; misma ACL; publicable 401, token autenticado 403, servicio 200; 40 snapshots con 0 inconsistencias, contraprueba 12/40 |
| lote con la cobertura nueva (Tareas, `fecha`/`pol`, `_hist`/`_tel`, `credencial-v3`, clase por recurso) | PROBADO EN STAGING · `prueba-mtvqdtg2-c-2026-09-10` READY_VERIFICADO |
| **B1 · Run manual desde el panel** | **NO OBSERVADO** |
| **B2 · Disparo automático por horario** | **NO OBSERVADO** |
| **B3 · Descarga, descifrado y reconstrucción en memoria del lote remoto** | **NO OBSERVADO** |
| **B4 · Correo de prueba: aceptado por SMTP / recibido** | **NO OBSERVADO / NO OBSERVADO** |

**AUTOMATIZACIÓN COMPLETA = NO EJERCIDA** hasta observar B2 y B3. B1 no cierra B2.

**RESPALDO COMPLETO = NO-GO.** La restauración aplicada pasó, pero faltan la verificación
positiva de credencial, el login real, el caso desactivado, IAM/bóveda/Auth fuera del lote y
B1–B4. Inventario completo en `COBERTURA-RESPALDO.md`.

**Guía del panel** (`GUIA-PANEL-VERCEL.md`):
- El proyecto se crea vacío con `vercel project add`, sin desplegar `main`.
- Un Ignored Build Step cancela todo build que no sea `runtime/staging-respaldo`, y queda
  activo antes de conectar Git.
- El primer deployment se crea desde el SHA exacto.
- El SHA se confirma en el panel y en la página publicada antes de ejecutar funciones; el
  cron queda desactivado hasta entonces.
- El correo sale por `SMTP_OSIRIS_*`. `RESPALDO_MODO_IDENTIDAD` queda en su defecto
  (`boveda`) en staging.
- El runtime no abre conexiones PostgreSQL: reserva y snapshot van por RPC de PostgREST.

## 2 · Recuperabilidad

| Punto | Estado |
|---|---|
| Reconstrucción aislada desde la bitácora | **FALLÓ** · no sirve como sustituto del respaldo |
| Descifrado y reconstrucción **en memoria** del lote de staging | PROBADO EN STAGING |
| Restauración **aplicada** en un destino aislado (`restauracion_<lote>`, sin permisos de API) | PROBADO EN STAGING · `restauracion_prueba_mtvqdtg2_c_2026_09_10`, 0 fallas. El primer intento (`prueba-mtvq2x92-c`) **FALLÓ**: `audit_log` y `backup_*` se reponían vacíos; corregido y conservado como evidencia |
| Tareas, usuarios, autorización, UUID, `ctId` y `_h`/`_hist`/`_tel` desde lo restaurado | PROBADO EN STAGING · 7/7 usuarios, UUID 2 de 2, `ctId` 5/5 |
| Código provisorio: vuelve como marca vencida y obliga a reemitir | PROBADO LOCAL · staging no tiene códigos provisorios: NO EJERCIDO en la restauración aplicada |
| Huérfanas: preservadas, nunca asignadas, impiden declarar la recuperación completa | PROBADO LOCAL y en memoria sobre el snapshot real de staging · staging no tiene huérfanas reales |
| Verificación positiva de credencial restaurada | **BLOQUEADO** · el sintético existente no sirve; enrolar un fixture requiere al dueño de identidad (DECISIÓN) |
| Usuario desactivado que no entra desde lo restaurado | NO EJERCIDO · staging no tiene desactivados y el caso depende del fixture |
| Login real por la app contra lo restaurado | **NO EJERCIDO** · la app lee el origen |
| **Recuperación completa** | **NO DECLARABLE** |
| Respaldo nativo de producción | NO VERIFICADO · requiere captura del panel |
| Respaldo de adjuntos | NO RESPALDADO por este paquete · PLATFORM SECURITY |

**Brechas que siguen abiertas**, confirmadas en la restauración aplicada:
- En staging, 5 de 7 usuarios activos no tienen `_h` y entran con PIN en claro, que el lote
  no copia por diseño. Tras restaurar quedan sin credencial y necesitan código provisorio.
- No están en el lote: IAM (`iam_usuario` 11, membresías 6, capacidades 155), la bóveda
  `sec_*` (`sec_identidad` 50, `sec_credencial` 18) y `auth.users` (24).
- 29 filas de `calendario_data` están fuera de la allowlist (sondas y pruebas) y no viajan.

Cerradas: las 9 claves de Tareas, `fecha`/`pol`, `_hist` y `_tel` viajan y vuelven idénticas.
Los dos lotes diarios anteriores (`credencial-v1`) no las traen; se conservan.

## 3 · Cartera de los 23 contratos — producción

| Clasificación | Contratos |
|---|---|
| Conflicto | 1 |
| Pendiente confirmado | 4 |
| Información pendiente | 14 |
| Marcado pagado en el sistema | 4 |
| Pago corroborado | 0 |
| No aplicable | 0 |

**Contract fee, importes contractuales.** Ninguno es deuda confirmada.

| Rótulo | USD |
|---|---|
| Pendiente de conciliación | 240.000 |
| Con factura, sin pago registrado | 30.000 |
| En conflicto | 30.000 |
| Marcado pagado en el sistema, sin corroborar | 390.000 |
| Pago corroborado | 0 |
| **Cuadre** | **690.000** |

Cuadre: 240.000 + 30.000 + 30.000 + 390.000 + 0 = 690.000. Contratos: 1 + 4 + 14 + 4 = 23.

**Qué sostiene los USD 390.000.**
- 13 contratos tienen número de factura y estado pagado registrados en el contrato.
- 10 tienen fecha de pago y 3 no.
- **Ninguno tiene comprobante ni referencia de conciliación.**
- 10 muestran cambios de esos campos en la bitácora. Los otros 3 se fijaron antes del
  2026-07-10 y no hay registro de quién ni cuándo.

**Planilla única, regenerada el 2026-09-10:**
`conciliacion-osiris/Osiris-conciliacion-23-contratos-2026-09-10-r2.xlsx`, local y fuera de
git. La versión anterior se conserva. Leída de producción solo por GET con el código de
Pago Obtentores de `origin/main` (`27b423b`): 69 filas, 46 cuotas, 14 con evidencia, 6
movimientos que mencionan al obtentor. Cuadres de la obligación en 0. Correos reales
bloqueados.

## 4 · Fee Entrada con fuente única

| Punto | Estado |
|---|---|
| Implementación en la rama aislada `osiris/fee-entrada-fuente-unica` | hecha, local |
| Ambas fuentes históricas y sus discrepancias | conservadas con procedencia |
| Preservación A · lectura y derivación | PASS · 0 diferencias por hoja (staging y producción) |
| Preservación B · edición sintética | PASS · 1 diferencia, la esperada; al revertirla vuelve la huella original |
| Preservación C · escritura concurrente | PASS · 4 de 4 hojas concurrentes conservadas; la contraprueba detecta la pérdida |
| **Despliegue a producción** | **DETENIDO por decisión del CFO** · primero se concilian los 13 cobros |
| Regla de Pago Obtentores | sin cambios (no se aplica "solo corroborados") |

**USD 245.700 = impacto calculado pendiente de conciliación**, no deuda nueva confirmada.
Cálculo: 390.000 × 70 % = 273.000, menos 10 % de retención (27.300) = 245.700. La planilla
regenerada da el mismo resultado.

Hallazgos que condicionan el monto (detalle en `IMPACTO-FEE-ENTRADA-FUENTE-UNICA.md`):
- El cálculo asigna el fee por regla, sin mirar las variedades plantadas. En 10 de los 23
  contratos no hay datos para validar el obtentor por concepto.
- `pagosObtentor` no existe en producción.
- El mayor 2026 registra la factura 121 de IQ, USD 1.081.903, pagada el 2026-04-02 con
  10,0 % de retención. La glosa dice que se pagaron USD 100 más que el neto esperado. No
  se sabe qué contratos cubre; si incluye contract fees, habría doble conteo.

## 5 · Ajustes · notas de crédito y anulaciones

| Punto | Estado |
|---|---|
| Capacidades `osiris.ajuste.registrar` / `osiris.ajuste.aprobar` | PROBADO EN STAGING · 14/14 |
| Quien registra no aprueba, tampoco con ambas capacidades | probado |
| Append-only, anulación visible, nota de crédito con respaldo | probado |
| Concedida a personas | **no** · 0 asignaciones tras revertir |
| Producción y permisos productivos | sin cambios |

## 6 · Diseño y runtime

| Punto | Estado |
|---|---|
| Harness de revisión con datos de staging | se conserva en `runtime/staging-respaldo` |
| Integración del respaldo corregido en `runtime/staging-respaldo` | ver `TRASPASO-RESPALDO-2026-09-10.md` §7 |
| Integración en la aplicación real | rama local `osiris/integracion-ux-app`, montaje detrás de bandera, 261/261, compila |
| **Prueba integrada** (navegación, permisos, carga, guardado, alertas, concurrencia) | **PENDIENTE** · requiere que la app apunte a staging sin escribir en producción |
| URL de revisión | NO OBSERVADO · depende del proyecto de Vercel |

El diseño avanza con los cálculos vigentes y muestra las discrepancias por separado. Las
ramas que montan la aplicación **no se empujan**, porque Vercel crearía un Preview vivo
contra producción. `respaldo/candidato-produccion` y `runtime/staging-respaldo` no montan
`App` (verificado en `src/index.js`).

## 7 · Correo

| Punto | Estado |
|---|---|
| Composición, conflicto excluido, sin duplicados, destinatarios sintéticos | PROBADO EN STAGING · 13/13 |
| Cuenta de envío del runtime | `SMTP_OSIRIS_*` (corregido en la guía) |
| Entrega real | NO OBSERVADO |
| Envíos reales | BLOQUEADO hasta que haya cobertura conciliada, responsables asignados, destinatarios aprobados y buzón de prueba designado |
