# H. Recommendation for Phase 1 — Osiris

## Qué abordar primero y por qué

Con la red de seguridad de Fase 0 en pie (snapshot + hash + 32 tests que congelan el motor económico), **Fase 1 debe ser el Modelo Maestro + Migración segura a relacional**, en este orden:

1. **Resolver enlaces por string → FK, en seco (dry-run).**
   Escribir un migrador que lea el blob y produzca un **reporte** de mapeo variedad↔especie↔obtentor y OC↔contrato, listando nombres no resueltos. **No escribe nada todavía.** Esto ataca R6 (el mayor riesgo de la migración) antes de mover un solo registro.

2. **Definir el esquema relacional núcleo** (genetistas, especies, variedades, clientes, contratos, plantaciones, campos, bloques, viveros, OC, despachos, ingresos, obligaciones_obtentor, documentos) y **migrar idempotente** una entidad a la vez, validando cada paso contra los conteos del Data Integrity Manifest. El blob se conserva como respaldo hasta validar.

3. **Extraer el `economic-engine/` a módulos puros** (RP/RC/CF/FV/WHT/obtentor/temporadas/inflación), moviendo la lógica **sin cambiarla**, con los 32 tests actuales como red. Recién ahí se pueden implementar las reglas TARGET (devengo, imputación Fee→RP, 70/30 parametrizable, ha cobrables) con tests nuevos.

## Por qué en ese orden
- La migración por strings (R6) y el punto único de falla (R2) son los riesgos que pueden **destruir información**; se neutralizan primero.
- El devengo (R4), el 70/30 unificado (R3) y la imputación Fee→RP (R8) son **cambios de lógica**: requieren primero el motor extraído y testeado, para no romper el cuadre.
- Informes de Visitas (R9) y biblioteca documental (R10) son de **alto valor pero bajo riesgo de data**; van en Fase 4, después del modelo.

## Secuencia sugerida (ajustable)
- **Fase 1** — Modelo maestro + migración segura (dry-run FK, esquema, migración validada).
- **Fase 2** — Campos/bloques/plantaciones + ficha de contrato (base del 360°).
- **Fase 3** — Motor económico extraído + devengo/facturación/cobranza + 70/30 parametrizable + imputación Fee→RP + ha cobrables. **Aquí se implementan las reglas TARGET.**
- **Fase 4** — Informes de Visitas + biblioteca documental.
- **Fase 5** — Dashboard ejecutivo + Future Royalty Pipeline + alertas.
- **Fase 6** — QA + RLS/auth + deprecación del blob.
- **Fase 7** — Integración Mediterra One.

## Gate para pasar a Fase 1
No avanzar hasta que Angelo **apruebe la arquitectura objetivo** (secciones G/H del diagnóstico + esta matriz Current/Target). Fase 0 entrega la evidencia; la decisión de arquitectura es suya.
