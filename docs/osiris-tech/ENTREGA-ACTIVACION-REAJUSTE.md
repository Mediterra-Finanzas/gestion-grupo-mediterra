# Entrega B · Activación del reajuste

Permite **activar explícitamente** el reajuste de un contrato, con fecha de referencia
respaldada y vista previa fila por fila. Ningún contrato queda activado por esta entrega.

| | |
|---|---|
| **Candidato** | `osiris/activacion-reajuste` |
| **Versión de recuperación** | `osiris/recuperacion-compatible` |
| **Base de ambas** | `9d90ed2c4efcba953957ab324717754d5d267ad7` (= `main` publicado) |
| Diferencia entre las dos | **una línea**: `ACTIVACIONES_NUEVAS_HABILITADAS` |

---

## 1 · Las reglas que el paquete sostiene

| | |
|---|---|
| **Confirmar ≠ activar** | Un antecedente confirmado no aplica nada. La activación es una acción aparte, por contrato |
| **La activación exige** | Fecha de referencia + respaldo + regla de fecha declarada + respaldo de esa regla. Falta una, no aplica |
| **Cuatro fechas distintas** | Aniversario contractual, período del servicio, emisión y pago. Cuál determina la tasa **hay que declararlo y respaldarlo**: el sistema no lo supone |
| **Sello de términos** | Al activar se sella porcentaje, fecha y regla. Editarlos después **no recalcula**: manda lo sellado, queda "modificación pendiente" y la edición se bloquea |
| **Filas protegidas** | Cualquier antecedente de factura o pago (`nFact`, `pagado`, `fechaPago`, `montoFacturado`, parcialidades) protege la fila. No se recalcula |
| **Aniversario dentro del período** | **Bloquea** la aplicación. Se muestran tres escenarios marcados como no confirmados, que **no** alimentan totales ni exportaciones |
| **Configuración antigua** | Si opera, la nueva **no** se declara activa: estado de conflicto, importes intactos, sin sustitución silenciosa |
| **Desactivar** | Operación económica propia: permiso + vista previa del impacto + confirmación explícita + motivo. Guarda rastro |

## 2 · El caso sintético y sus números

41,97 ha × US$3.000. Activación al 2 %, anclada el 2026-07-01 por inicio del período del
servicio. Todas las fechas son sintéticas.

| Temporada | Base | Con reajuste | Diferencia |
|---|---|---|---|
| 2026/2027 | 125.910,00 | 125.910,00 | 0,00 |
| 2027/2028 | 125.910,00 | 128.428,20 | 2.518,20 |
| 2028/2029 | 125.910,00 | **130.996,76** | 5.086,76 |
| 2029/2030 | 125.910,00 | 133.616,70 | 7.706,70 |
| 2030/2031 | 125.910,00 | 136.289,03 | 10.379,03 |
| **Total** | **629.550,00** | **655.240,69** | **25.690,69** |

**La cifra de 2028/2029 es 130.996,76.** Reemplaza al 131.000,96 que informé antes, que era
una estimación hecha a mano y estaba mal. El valor correcto es el que mide el motor.

## 3 · Recuperación

**Estado: compatible y probada en local; pendiente de despliegue y certificación.** No está
resuelta.

**Lo que se descubrió primero.** Volver a `9d90ed2` devuelve 125.910 en las cinco temporadas:
eso no es recuperación segura, es **incompatibilidad económica**. Un rollback borraría los
US$ 25.690,69 aplicados, y desactivar un reajuste es una operación económica propia, no el
efecto silencioso de volver atrás. Esa prueba se conserva **invertida, como contraprueba**:
detecta que una versión sin soporte cambia los importes y falla si alguien reintroduce la
incompatibilidad.

**La versión compatible**, verificada:

| | |
|---|---|
| Importes idénticos al candidato | Las cinco temporadas al centavo, total 655.240,69 |
| Conserva activación, respaldo y cambios posteriores | Sí, y el sello gobierna igual que en el candidato |
| Editar allá y volver al candidato | 125.910 / 128.428,20 / 162.208,76 / 165.452,94 / 168.762, reproducidos al centavo, sin pérdida y con el reajuste aplicado |
| Bloquea nuevas **en la acción** | `activar()` devuelve `ok:false` y **no escribe nada**; no es un botón oculto |
| No atrapa las existentes | Se pueden desactivar, con las mismas exigencias |

La comparación usa `fixturesReajuste.js`, **idéntico en las dos ramas**: una diferencia de
importes solo puede venir del código.

## 4 · Orden de despliegue propuesto

Ninguno de estos pasos está autorizado todavía.

| Paso | Qué se despliega | Qué habilita | Recuperación de ESE paso |
|---|---|---|---|
| **1** | **Versión de recuperación** (`osiris/recuperacion-compatible`) | Nada nuevo: el motor sabe leer activaciones, pero no se puede crear ninguna. Los importes no cambian, porque no hay activaciones en los datos | Volver al deployment de `9d90ed2`. Es seguro **solo mientras no exista ninguna activación**, y en este paso no puede existir |
| **2** | **Certificar** ese deployment en vivo: que calcula igual y que rechaza crear activaciones | — | Igual que el paso 1 |
| **3** | **Candidato** (`osiris/activacion-reajuste`) | Se pueden crear activaciones | Volver al deployment del paso 1, **ya certificado**: conserva el cálculo de lo activado |
| **4** | Activar un contrato concreto, con autorización propia | Ese contrato reajusta | Desactivar, que es una operación económica con su propia vista previa y confirmación |

**La regla que ordena todo esto:** no se habilitan activaciones productivas (paso 3) hasta que
el paso 2 esté hecho y autorizado. Sin un deployment de recuperación compatible y certificado,
cualquier rollback sería una pérdida económica silenciosa.

## 5 · Pendientes para activar Olmos

No se activa y no se declara listo. Lo que falta, en orden:

1. **La fecha del primer pago de royalty comercial, con su respaldo.** Es lo único que fija el
   aniversario según Annexure D 1.2.5, p.24 (2 % anual desde un año después de ese pago).
2. **La regla que relaciona las fechas**, declarada y respaldada: cuál de las cuatro determina
   la tasa aplicable. Es independiente del punto 1.
3. **La decisión sobre el aniversario dentro del período del servicio.** Con un ancla a mitad
   de año, el aniversario cae dentro de **todas** las temporadas, no de una. Mientras no se
   decida, la aplicación queda bloqueada para ese contrato.
4. **Revisar períodos y filas afectadas** antes de autorizar, como pediste.
5. **El deployment de recuperación certificado** (paso 2 de arriba).

Los puntos 1 y 3 son distintos y no se mezclan: el primer pago **establece** el aniversario;
cómo se aplica al período correspondiente es la regla pendiente.
