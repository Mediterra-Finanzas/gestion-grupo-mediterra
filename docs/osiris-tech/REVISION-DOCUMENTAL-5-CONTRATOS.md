# Revisión documental · 5 contratos de Osiris (2026-09-23)

Lectura de los archivos entregados por el CFO. Solo lectura y comparación contra la
configuración de producción (fila `osiris`, leída con la clave pública el 2026-09-22 18:39 UTC).
No autoriza ni incluye cambios de reglas, importes, contratos ni datos.

Las condiciones de cada documento valen **solo para ese contrato**. No se trasladan a los demás.

## Identificación de los archivos

| Documento | Tipo | Páginas | SHA-256 (16) | Fecha en el documento |
|---|---|---|---|---|
| `Contrato_OSIRIS_CAO.pdf` | Grower License Agreement | 25 | `dbcfc8793231c57c` | sin fecha escrita en portada; Docusign 008F6E54…, PDF creado 2025-11-05 |
| `GROWER LICENSE AGREEMENT Osiris-Huarmey Signed.pdf` | Grower License Agreement | 35 | `9935b78ff3cbe248` | 04 de septiembre de 2025 (p.1 y p.2); sello Docusign 08/09/2025 |
| `Osiris Plant Managment SpA-Giddings Berries Peru SAC_Trial Grower Agreement.pdf` | Trial Grower Agreement | 12 | `33b1ec6196f08265` | 24 de marzo de 2022 (p.1) |
| `Grower License Agreement Dole Peru.pdf` | Grower License Agreement | 22 | `ac16b752426e1571` | Docusign 4/25/2025 (licenciatario) y 5/19/2025 (licenciante) |
| `Agroberries Limited - Osiris Plant Trial Grower Agreement.pdf` | Trial Grower Agreement | 16 | `b19b712562b1b20e` | 17.01.24, Santiago (p.1) |

Giddings y Agroberries son PDF escaneados sin capa de texto: se leyeron como imagen, página a página.

---

## 1 · Corporación Agrícola Olmos S.A (`ct_1778851991375`)

**Partes.** Osiris Plant Management SpA por IQ Berries (pty) Ltd. El licenciatario de la carátula
(p.2) figura con RUC **20563196387**, domicilio Jirón Diego de Almagro 537, Trujillo, contacto
`administracion@hassperu.com`, firmantes Gonzalo Ganoza / Roy Lozano. El nombre de fantasía
"Corporación Agrícola Olmos" no aparece en la carátula; el Annexure A (p.22) reparte las plantas
entre dos ubicaciones: **Hass Perú** (75.835 plantas) y **CAO** (190.950 plantas).

| Tema | Cláusula y página | Condición | Diferencia con lo configurado | Decisión pendiente |
|---|---|---|---|---|
| Contract fee | Annexure D 1.1.1, **p.23** | "non-refundable contract fee of USD 30,000" | El sistema lo tiene como **Con Devolución**. El documento dice no reembolsable | ¿De dónde viene "Con Devolución"? ¿Existe otro documento que lo module? |
| Exención del fee | Annexure D 1.1.3, **p.23** | Exento si ya se pagó uno equivalente en un Trial Grower Agreement previo entre las mismas partes | No hay campo que registre esa exención | ¿Hubo Trial previo con estas partes? |
| Royalty planta | Annexure D 1.2.1-1.2.2, **p.23** | USD 1 por planta, pagadero al menos 72 h antes de la entrega | Coincide (`valorRoyaltyPlanta` = 1) | — |
| Royalty comercial | Annexure D 1.2.3, **p.24** | USD 3.000 por hectárea por año | Coincide (3.000) | — |
| Reajuste | Annexure D 1.2.5, **p.24** | **Tasa fija de 2 % anual**, desde un año después del primer pago de royalty comercial | El sistema tiene la casilla marcada y el porcentaje **sin cargar** | Confirmar 2 % y la fecha del primer pago |
| Mes de facturación | Cláusula 11.2, **p.11** | Reporte al 1 de abril; pago hasta el **15 de abril** | `mesFacuracionRC` vacío | Confirmar abril |
| Mora | Cláusula 11.3, **p.11** | 1,5 % mensual sobre lo impago después del 15 de abril | No existe en el sistema | Fuera de alcance por ahora |
| Impuestos | Cláusula 11.6, **p.11** | Los montos son netos de IVA y de cualquier retención | El sistema aplica 15 % a todo país distinto de Chile | Materia tributaria, no contractual |
| Mínimo plantado | Cláusula 4.1.6, **p.8** | 100 ha o 700.000 plantas en 4 años; densidad de referencia 7.000 pl/ha | `haMinContrato` = 100, `llevaMulta` = true | Observación aparte |

---

## 2 · Agrícola Huarmey SAC (`ct_1778851418779`)

**Partes.** Agrícola Huarmey S.A.C., RUC **20109930751**, Callao, representada por Eric Farah Bote.
Firmado el **04 de septiembre de 2025** (p.1 y p.2).

| Tema | Cláusula y página | Condición | Diferencia con lo configurado | Decisión pendiente |
|---|---|---|---|---|
| Contract fee | Annexure D 1.1.1, **p.34** | "non-refundable contract fee of USD 30,000" | El sistema lo tiene como **Con Devolución** | Igual que Olmos: origen de esa marca |
| Exención del fee | Annexure D 1.1.3, **p.34** | Exento si ya se pagó uno equivalente en un Trial previo entre las mismas partes | Sin registro | ¿Hubo Trial previo? |
| Royalty planta | Annexure D 1.2.1-1.2.2, **p.34** | USD 1 por planta; no se entregan plantas sin pago previo | Coincide | — |
| Royalty comercial | Annexure D 1.2.3, **p.34** | USD 3.000 por hectárea licenciada plantada por año, **comenzando un año después de la firma** (→ 04-09-2026) | El sistema tiene `rcInicioTemporada` **2028/2029** | Confirmar cuál rige |
| Reajuste | Annexure D 1.2.4, **p.34** | Ajustable **según la inflación del territorio de plantación**, desde un año después del primer pago, "según las fluctuaciones de la unidad de cuenta del país del licenciatario" | Casilla marcada, porcentaje sin cargar. El documento **no fija un porcentaje**: es un índice | Definir el índice (¿UIT peruana? ¿IPC?), su fuente y la fecha base |
| Mes de facturación | Cláusula 11.2, **p.15** | Reporte al 1 de abril; pago hasta el **30 de abril** | `mesFacuracionRC` vacío | Confirmar |
| Impuestos | Cláusula 11.x, **p.16** | Montos netos de IVA y retenciones | Igual que arriba | Materia tributaria |
| Anexo inactivo | ficha, anexo 2 | "Extensión período de prueba", marcado **no activo** | No se revisa como vigente | Pendiente de recibir el archivo |

---

## 3 · Giddings Berries Perú SAC (`ct_1778851570483`)

**Partes.** Giddings Berries Perú S.A.C., domiciliada en San Isidro, Lima, Perú (p.1).
**Trial Grower Agreement**, Santiago, **24 de marzo de 2022**. Firmado por ambas partes (p.10).

| Tema | Cláusula y página | Condición | Diferencia con lo configurado | Decisión pendiente |
|---|---|---|---|---|
| Naturaleza | encabezado, **p.1** | Acuerdo **de prueba**, no licencia comercial | El sistema lo tiene como `tipoContrato` = "Licencia" | ¿Existe una licencia posterior? |
| Territorio | definiciones, **p.1** | "Territory shall mean Perú" | El sistema tiene **país = México** | Corregir el país tras confirmación |
| Plazo | definiciones, **p.1** | 3 años **no renovables** desde la firma → venció el 24-03-2025 | El sistema no registra vencimiento (`fechaTermino` vacío) | Confirmar si sigue vigente por otro documento |
| Fecha | encabezado, **p.1** | 24-03-2022 | El sistema tiene 2023-05-24 | Confirmar |
| Contract fee | — | **El documento no contiene cláusula de fee ni de royalty.** Revisadas las 12 páginas: cláusulas 1 a 15 y anexos 1 a 4 | El sistema tiene "Con Devolución" USD 30.000, factura 5, pagado el 2022-05-06 | ¿Con qué documento se pactó ese fee? |
| Plantas de prueba | Annex 3, **p.11** | 1.500 plantas T11-319 (MegaEarly) y 1.500 T111-519 (MegaCrisp) = 3.000 | El sistema tiene 1.450 y 1.420 = **2.870**, ambas en estado "Anulado" | Conciliar contratado vs entregado |
| Baja de plantas | Cláusula 11 "Effect of termination", **p.7** | Al terminar, el productor debe **destruir todas las plantas de prueba**, salvo las que pasen a plantación comercial con autorización de Osiris. Si no lo hace en 30 días, Osiris puede entrar y destruirlas | El sistema no distingue destrucción contractual de anulación administrativa | Es la referencia para diseñar el anexo de baja **de este contrato** |
| Derechos devengados | Cláusula 11 final, **p.7** | La terminación no afecta derechos ya devengados | Relevante para no borrar histórico | — |
| Ley aplicable | Cláusula 15, **p.9** | Ley chilena; arbitraje en Santiago | — | — |

**Sobre las 2.870 plantas anuladas incluidas en el cálculo:** este contrato no tiene modelo de
órdenes de compra, así que el cálculo antiguo suma todas sus plantaciones sin mirar el estado. El
documento respalda que las plantas de prueba se destruyen al término. No se afirma cobro: el
contrato no registra facturas de royalty planta, ni cuotas, ni pagos, y su única orden de vivero
(IQP2022-004, 3.000 plantas, USD 0,45 por planta, USD 1.350, "Pagada total") no tiene facturas
asociadas.

---

## 4 · Dole Perú SRL (`ct_1781884258765`)

**Partes.** DOLE PERU SRL, RUC **20602431178**, Piura, representada por Francisco Moraga Fuentes.
Docusign: licenciatario 25-04-2025, licenciante 19-05-2025.

| Tema | Cláusula y página | Condición | Diferencia con lo configurado | Decisión pendiente |
|---|---|---|---|---|
| Fecha | carátula, **p.1-2** | 19-05-2025 (última firma) | Coincide con `fechaContrato` 2025-05-19 | — |
| Contract fee | Annexure D 1.1.1, **p.20** | "non-refundable contract fee of USD 30,000" | Coincide: el sistema lo tiene **Sin Devolución** | — |
| Año de prueba | Cláusulas 12.1 **p.10** y 13.1 **p.11** | El **primer año de vigencia es período de prueba**; al vencer debe empezar a plantar comercialmente | El sistema tiene `tieneAnioPrueba` = sí, 1 año | Coincide |
| Qué se cobra en la prueba | Annexure D 1.2.7, **p.21** | Durante el primer año **no se paga el royalty comercial**, pero **sí todos los demás royalties** | El sistema no implementa ese efecto; `tipoContrato` no interviene en ningún cálculo | Confirmar la regla antes de implementarla |
| Royalty comercial | Annexure D 1.2.3, **p.21** | USD 3.000 por hectárea por año, comenzando un año después de la firma | Coincide en monto; el inicio no está cargado | Confirmar inicio (19-05-2026) |
| Reajuste | Annexure D 1.2.5, **p.21** | Ajustable **según la inflación del territorio de plantación**, "unidad de cuenta del país del licenciatario" | El sistema tiene la casilla marcada con **0 %** | Definir índice y fecha base; el 0 % no refleja el contrato |
| Mes de facturación | Cláusula 11.2, **p.10** | Reporte al 1 de abril, pago hasta el **15 de abril** | `mesFacuracionRC` vacío | Confirmar |
| Mínimo y multa | Cláusulas 13.2-13.5, **p.11** | 160 ha o 1.120.000 plantas en 4 años tras la prueba; multa de USD 200.000, prorrateada a USD 1.250 por hectárea no plantada; exenciones por fuerza mayor y bajo rendimiento | `haMinContrato` = 160, `llevaMulta` = true, sin monto ni prorrateo | Observación aparte |
| Auditoría | Cláusula 11.4, **p.10** | Subdeclaración mayor al 5 %: reembolso de la auditoría más USD 6.000 por incidencia | No existe | Fuera de alcance |

---

## 5 · Agroberries Limited (`ct_1781879832071`)

**Partes.** Osiris Plant Management SpA y **Agroberries Limited, sociedad constituida en Inglaterra
y Gales, company number 13571937**, domicilio social en Berryworld Turnford Place, Great Cambridge
Road, Turnford, Broxbourne, Hertfordshire, Reino Unido, representada por Jorge Andrés Varela Peddar
(pasaporte chileno F53415407). Firmado en Santiago el **17-01-2024** (p.1).

| Tema | Cláusula y página | Condición | Diferencia con lo configurado | Decisión pendiente |
|---|---|---|---|---|
| Identificación | encabezado, **p.1** | Sociedad inglesa, company number 13571937 | El sistema tiene `taxID` 13571937 (correcto: es el número de sociedad británico) y **país = Perú** | Definir si el campo país describe la constitución o el territorio de plantación |
| Territorio | definiciones, **p.2** | "Territory shall mean the territory of Peru" | Explica el "Perú" cargado | — |
| Naturaleza y plazo | encabezado **p.1**, definiciones **p.2** | Trial Grower Agreement; plazo de **3 años no renovables** desde la firma → hasta el 17-01-2027 | El sistema lo tiene como "Licencia", sin fecha de término | Confirmar |
| Continuidad | Cláusula 1, **p.1** | La relación comercial comenzó el **7 de junio de 2022** con **Agroberries Perú S.A.C.**; este acuerdo la continúa y su único fin es "establecer claramente las partes correctas que debieron firmarlo" | Explica la fecha de pago del fee (2022-07-11) anterior a la fecha del contrato (2024-01-17): **no es un error de carga** | — |
| Contract fee | Annex 1 a), **p.12** | El fee de USD 30.000 **ya fue pagado** por medio de la relacionada Agroberries Perú S.A.C.; la obligación está cumplida | El sistema lo tiene pagado, factura 12 | — |
| Imputación del fee | Annex 1 b), **p.12** | "the amount of USD 30,000 of the Contract Fee entitles the Grower to 30,000 plants without paying the royalty per plant" | El sistema lo tiene como **Sin Devolución** y cobraría USD 1 por planta desde la primera. Sus dos OC suman 12.000 plantas, bajo el tope de 30.000 | **Decisión económica**: el fee se imputa contra el royalty planta hasta 30.000 plantas. Solo para este contrato |
| Royalty comercial | Annex 1 b), **p.12** | "Other royalties, per hectare, will be subsequently specified in a document named Commercial Agreement" | El sistema tiene USD 3.000 por hectárea | ¿Existe ese Commercial Agreement? |
| Subsidiarias | definiciones, **p.2** | Agroberries Perú S.A.C., Pura Berries S.A.C. y otras del grupo aprobadas por Osiris | **Pura Berries S.A.C. tiene contrato propio en el sistema** | Definir a qué contrato se imputan las plantas de cada ubicación |
| Ubicaciones | Annex 2, **p.13-14** | Pura Berries SAC (RUC 20609310252): 250 plantas. Agroberries Perú SAC (RUC 20600807685): 10.000 plantas | Las plantaciones de este contrato están en cero en el sistema | Conciliar |
| Retención | — | El documento **no contiene cláusula de retención** | El sistema aplicaría 15 % por no ser Chile | Materia tributaria, fuera del paquete técnico |

---

## Decisiones que requieren confirmación del CFO

1. **Fee "Con Devolución" en Olmos, Huarmey y Giddings.** Los dos primeros dicen expresamente
   "non-refundable" y el tercero no tiene cláusula de fee. Falta el documento que sustente la marca.
2. **Imputación del fee de Agroberries** contra el royalty planta hasta 30.000 plantas.
3. **Reajuste**: 2 % fijo en Olmos; índice de inflación del territorio en Huarmey y Dole, sin
   porcentaje. Hay que definir índice, fuente y fecha base para los dos últimos.
4. **Inicio del royalty comercial de Huarmey**: contrato dice un año después de la firma
   (04-09-2026); el sistema tiene la temporada 2028/2029.
5. **Efecto del año de prueba de Dole**: no se cobra royalty comercial el primer año, sí el resto.
6. **País de Giddings** (México en el sistema, Perú en el contrato) y **plazo vencido** el 24-03-2025.
7. **País de Agroberries**: sociedad británica con territorio peruano. La retención sigue siendo
   materia tributaria, no contractual.
8. **Atribución de plantas entre Agroberries y Pura Berries**, que son contratos distintos en el
   sistema y ubicaciones del mismo acuerdo en el documento.

Nada de lo anterior se implementa ni se carga. El anexo inactivo de Huarmey no se revisó como
vigente: está pendiente de entrega.

---

# Ajuste de la revisión (2026-09-23)

Cinco distinciones pedidas por el CFO. Reemplazan las conclusiones anteriores donde se indica.

## 1 · Tres cosas distintas que no son lo mismo

| Concepto | Qué significa | Dónde aparece |
|---|---|---|
| **Devolución monetaria** del fee | Osiris restituye dinero al productor | En ninguno de los cinco documentos |
| **Imputación a royalties** | El fee pagado se descuenta de royalties futuros | En ninguno de los cinco, salvo el caso de Agroberries de abajo |
| **Derecho a plantas sin royalty** | El fee da derecho a recibir N plantas sin pagar el royalty por planta | Agroberries, Annex 1 b), p.12 |

**Qué representa hoy "Con Devolución" en el sistema.** Revisado el código: el campo
`tipoContractFee` admite "Con Devolución", "Sin Devolución" y "Sin Contract Fee". El único valor con
efecto es **"Sin Contract Fee"**, que excluye el contrato de la tabla de contract fee y lo muestra
como "Sin fee". Entre "Con Devolución" y "Sin Devolución" **no hay ninguna diferencia de cálculo**:
el valor se copia al campo `detalle` de la fila de fee, pinta un distintivo verde o ámbar y se
exporta en los informes. Ninguna rama de cálculo lo consulta.

Conclusión corregida: que un contrato diga "non-refundable" **no prueba que la configuración esté
mal**, porque la marca del sistema hoy no representa una devolución de dinero ni una imputación:
es una etiqueta descriptiva sin consecuencia económica. Lo que queda abierto es qué se quiso decir
con ella.

## 2 · País de constitución, territorio contractual y ubicación de las plantas

| Contrato | Constitución o domicilio | Territorio del contrato | Ubicación de las plantas | Campo `pais` hoy |
|---|---|---|---|---|
| Olmos | RUC peruano 20563196387, Trujillo | Perú | Hass Perú y CAO (Annexure A, p.22) | Perú |
| Huarmey | RUC 20109930751, Callao | Perú | según anexos | Perú |
| Giddings | San Isidro, Lima, Perú (p.1) | "Territory shall mean Perú" (p.1) | Perú | **México** |
| Dole | RUC 20602431178, Piura | Perú | Perú | Perú |
| Agroberries | Inglaterra y Gales, company number 13571937, Hertfordshire (p.1) | "the territory of Peru" (p.2) | Pura Berries SAC y Agroberries Perú SAC, ambas en Perú (Annex 2, p.13) | Perú |

El sistema tiene **un solo campo** para las tres cosas y de él deduce la retención. No se cambia
ningún país ni se deduce ninguna retención desde ese campo. La única discrepancia dura es Giddings,
donde documento y sistema dicen países distintos, y aun así no se modifica.

## 3 · Agroberries: la regla de las 30.000 plantas, con sus condiciones

Texto exacto (Annex 1, p.12): *"the amount of USD 30,000 of the Contract Fee entitles the Grower to
30,000 plants without paying the royalty per plant"*, precedido de *"the Grower already paid OSIRIS
through its related company Agroberries Perú S.A.C., the amount of USD 30,000"*.

Alcance tal como está escrito, sin extenderlo:
- El titular del derecho es **el Grower**, Agroberries Limited.
- El acuerdo permite ejercer los derechos **directamente o a través de sus Subsidiarias** (p.2), que
  el propio documento define como Agroberries Perú S.A.C., **Pura Berries S.A.C.** y otras del grupo
  aprobadas por Osiris.
- El acuerdo es de prueba, con plazo de 3 años no renovables desde el 17-01-2024.
- Las ubicaciones del Annex 2 suman 10.250 plantas, repartidas entre dos subsidiarias.

Lo que **no** se puede afirmar todavía:
- **Cuánto cupo queda.** Las 12.000 plantas de las dos órdenes registradas no lo prueban: la
  relación empezó el 07-06-2022 y puede haber entregas anteriores facturadas a Agroberries Perú
  S.A.C. que consuman parte del derecho. Falta el historial completo de entregas y facturación.
- **Si el derecho es compartido.** Pura Berries S.A.C. aparece como subsidiaria y ubicación de este
  acuerdo, y al mismo tiempo tiene contrato propio en el sistema. Si las plantas de Pura Berries
  consumen el cupo de Agroberries, el beneficio no puede contarse dos veces. Mientras no esté
  definido, el cupo no se aplica en ningún contrato.

## 4 · Giddings: tres hechos separados

| Hecho | Respaldo | Estado |
|---|---|---|
| **Vencimiento contractual** | Plazo de 3 años no renovables desde el 24-03-2022 (definición de "Term", p.1) | El acuerdo de prueba venció el 24-03-2025, salvo que exista un documento posterior |
| **Obligación de destrucción** | Cláusula 11, p.7: al terminar, destruir todas las plantas de prueba salvo las que pasen a plantación comercial con autorización de Osiris | Es una obligación del productor. No consta que se haya ejecutado |
| **Baja efectivamente documentada** | — | **No hay ninguna.** Las dos filas figuran en estado "Anulado" sin anexo, sin fecha de baja, sin motivo y sin autor |

No se cambia ningún estado ni cantidad por inferencia. La diferencia entre 3.000 plantas contratadas
(Annex 3, p.11) y 2.870 registradas queda como diferencia observada, no como corrección.

## 5 · Huarmey: conclusión en suspenso

El inicio del royalty comercial y el reajuste **quedan sin conclusión** hasta revisar el anexo de
extensión del período de prueba que falta. No se toca la temporada 2028/2029 ni se asigna ningún
índice. Lo único establecido por el documento entregado, y que se conserva, es la redacción de las
cláusulas: Annexure D 1.2.3 (comercial desde un año después de la firma) y 1.2.4 (ajustable según
la inflación del territorio, sin porcentaje). Un anexo de extensión del período de prueba puede
desplazar ambas fechas; por eso la conclusión espera.

## Lo que depende de algo más

| Conclusión | De qué depende |
|---|---|
| Sentido económico de "Con Devolución" | De la intención con que se cargó; hoy no tiene efecto |
| Fee de Giddings (US$30.000 configurado sin cláusula en el documento) | De un acuerdo posterior no entregado |
| Cupo disponible de Agroberries | Del historial de entregas desde 2022 y de si el derecho se comparte con Pura Berries |
| Royalty comercial y reajuste de Huarmey | Del anexo de extensión faltante |
| Reajuste de Dole (índice sin porcentaje) | De definir índice, fuente y fecha base |
| Vigencia de Giddings y de Agroberries | De documentos posteriores al vencimiento del plazo de prueba |
| Retenciones | De validación tributaria, no de estas cláusulas |
