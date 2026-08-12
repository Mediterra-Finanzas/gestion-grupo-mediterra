# Visits Module Assessment — Osiris (Fase 0)

Evaluación del actual módulo **Operación Técnica** y su evolución objetivo a **Informes de Visitas**. **No se renombra, no se cambia UI, no se crean tablas, no se toca en Fase 0.**

## 1. Inventario actual (`OperacionTecnica`, L5070)
- **Persistencia:** `osirisData.opTecnica` (dentro de la fila `osiris`). Estado productivo: **visitas 0, informes 0** (construido, sin uso).
- **4 tabs reales:** Visitas 📋, Informes 📝, Equipo Técnico 👨‍🔬, Entregables 📦. (El header anuncia "Test Blocks · Medidas Correctivas" pero no son tabs.)
- **Visita** (`VACIO_VISITA` L5111): `tipo, fecha, cliente, ctId, viveroId, lugar, objetivo, resultado, estado, responsable, fotos, observaciones` + extras Test Block (`testBlockNombre/Especie/Variedad/Ubicacion/Resultados`).
  - `TIPOS_VISITA` (L4650): Técnica, Comercial, Recepción, Vivero, Día de campo, Otra.
  - `ESTADOS_VISITA` (L4687): Programada, Realizada, Cancelada, Reprogramada.
- **Informe** (1:1 desde visita, `crearInformeDesdeVisita` L5161): cabecera + 13 secciones agronómicas.
  - `SECCIONES_INFORME_ALL` (L4696): encabezado, resumen, fenología, riego, nutrición, fitosanitario, labores, sanidad, suelo, desarrollo, recomendaciones, fotos, conclusión.
  - `SECCIONES_POR_TIPO` (L4711): mapea tipo de visita → secciones visibles (Técnica=13; Vivero/Comercial/Recepción/Día de campo/Otra = subconjuntos).
  - `ESTADOS_INFORME` (L5116): Borrador, En revisión, Aprobado, Rechazado, Enviado. Workflow con aprobación por `gerente_tecnico`/`admin`.
  - Genera **HTML** (`generarHTMLInforme` L5206) + **PDF**; sube HTML a `osiris-fotos/informes-html/`; envía por **email** (Edge/Vercel `/api/informe`).
- **Equipo técnico** (`VACIO_TECNICO` L5114): `nombre, rol, especie, email, telefono, modalidad, observaciones`. Rol incluye "Asesor por especie" (asesor-por-especie = rol + campo especie).
- **Entregables a sublicenciados** (`VACIO_ENTREGABLE` L5115): checklist por `ENTREGABLES_SUBLICENCIADO` con progreso.
- **Fotos:** `uploadFoto` (L4665) → `osiris-fotos/informes/<informeId>/`; fallback base64; opción pegar URL. Metadata foto: `{url, descripcion, categoria, sector}`.

## 2. Qué conservar (activo)
- La **estructura técnica de 13 secciones** y `SECCIONES_POR_TIPO` (base común + secciones por tipo — ya es el patrón correcto).
- El **workflow de aprobación** (Borrador→En revisión→Aprobado/Rechazado→Enviado) con rol gerente técnico.
- La **generación PDF/HTML + email** y el sistema de **fotos** con fallback.
- El modelo **1 visita → 1 informe** con tipo heredado.

## 3. Qué está incompleto / no conectado
- **0 registros productivos**: construido pero sin adopción → riesgo de abandono.
- Test Blocks y Medidas Correctivas **no son entidades** (solo campos planos / texto libre).
- `TIPOS_INFORME` (L4690) definido pero efectivamente **no usado** (el dropdown usa el tipo de la visita).
- Informe no vinculado a campo/bloque/variedad/OC/Trial como relaciones navegables (solo `ctId`/`viveroId`).

## 4. Código muerto (NO eliminar en Fase 0)
- `ESTADOS_MEDIDA` (L4688) — sin referencias.
- `ESTADOS_TEST_BLOCK` (L4689) — sin referencias.
- Tipo de visita `"Test Block"` — sub-form L6048 **inalcanzable** (no está en `TIPOS_VISITA`).
- `TIPOS_INFORME` (L4690), `royaltiesObtentor`/`TIPOS_ROYALTY_OBTENTOR` (L4597) — legacy.

## 5. Modelo objetivo: Operación Técnica → **Informes de Visitas** (NO implementar aún)
- **Renombrar conceptualmente** el dominio (en fase posterior, no ahora).
- **Tipos de visita configurables** (catálogo extensible), no enum rígido. Mínimo: Técnica, Comercial, Vivero, + futuras (contractual, auditoría, genetista, día de campo, seguimiento, recepción, prospección, investigación, otro).
- **Informe = objeto central** con **cabecera común** (id, correlativo, fecha, tipo, responsable/participantes Osiris, contraparte, empresa, cliente/productor/vivero, país, ubicación, campo/predio, bloque/cuartel, genetista, especie, variedad, contrato, OC, Trial, objetivo, resumen, estado, próxima visita, documentos, fotos, observaciones) + **secciones específicas por tipo** (técnica profunda se conserva; comercial y vivero con sus propias estructuras).
- **Informe Comercial** debe capturar oportunidad → variedad → ha potenciales → Trial → fecha estimada → vivero potencial → próximos pasos/compromisos, para **alimentar el Future Royalty Pipeline** (sin forecasting todavía).
- **Informe Vivero** debe relacionar vivero/OC/cliente/variedad/plantas solicitadas-disponibles-producidas-pendientes/estado/despacho/diferencias, para contrastar OC cliente vs producción vivero vs vendidas vs despachadas.
- **Hallazgo / Recomendación / Compromiso / Medida Correctiva / Seguimiento** como conceptos estructurados (descripción, responsable, fecha compromiso, prioridad, estado, evidencia, cierre) — diseñar para no bloquearlos, no implementar en Fase 0.
- **Workflow flexible por tipo** (técnico formal con aprobación; minuta comercial más simple) sin perder trazabilidad.

## 6. Extensibilidad (cómo permitir nuevos tipos sin deuda)
- Catálogo de tipos de visita/informe como **data configurable** (no arrays hardcodeados permanentes).
- Secciones de informe como **registro configurable por tipo** (evolución de `SECCIONES_POR_TIPO`).
- Fotos/evidencia asociables a niveles múltiples (visita, informe, sección, hallazgo, recomendación, campo, bloque, variedad, vivero, OC).

## 7. Integraciones futuras del Informe de Visita
Cliente · productor · genetista · variedad · contrato · **campo · bloque** · Trial · vivero · OC · **oportunidad** · tareas · alertas · **Future Royalty Pipeline** · Ficha 360° (historial/timeline de visitas por entidad).

## Restricción Fase 0 (§23Q)
NO renombrar el módulo en producción · NO modificar UI · NO crear tablas · NO cambiar informes existentes · NO borrar Operación Técnica. Solo **auditar + documentar + proponer** (hecho aquí).
