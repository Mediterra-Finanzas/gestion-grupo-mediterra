---
name: mediterra-consolidacion-ifrs
description: >
  Modelo de consolidación IFRS de Grupo Mediterra: qué empresa consolida línea a
  línea vs método patrimonio (IAS 28), participación no controladora (NCI),
  moneda funcional USD, y eliminaciones intercompany (fee admin, comisiones,
  royalties). Úsalo cuando construyas o analices cifras consolidadas, el
  Consolidado del flujo, el Dashboard de grupo, EEFF, o cualquier KPI a nivel
  grupo. Triggers: consolidación, consolidado, IAS 28, método patrimonio, NCI,
  interés minoritario, eliminación intercompany, moneda funcional, IFRS, grupo,
  Allpa, Allegria Service, Frisku.
---

# Consolidación IFRS — Grupo Mediterra

8 entidades. Moneda funcional del grupo: **USD**.

## Método de consolidación por empresa

| Empresa | % Controladora | Método | Nota |
|---|---|---|---|
| Mediterra Holding | 100% | Línea a línea | Holding pura, fee admin intercompany |
| Allegria Foods | 100% | Línea a línea | |
| Allegria Service | 80% | Línea a línea | **+ NCI 20%** |
| Frisku Foods | 90% | Línea a línea | **+ NCI 10%** |
| Osiris Plant Mgmt | 100% | Línea a línea | Royalties genéticos |
| Integrity Farms | 100% | Línea a línea | Fee admin por hectárea |
| Allpa Farms Chile | 50% | **Método patrimonio (IAS 28)** | JV; NO consolida línea a línea |
| Allpa Farms Perú | 26% | **Método patrimonio (IAS 28)** | JV; PEN/USD; NO consolida línea a línea |

## Reglas al consolidar

1. **Las 6 primeras suman línea a línea.** Allpa Chile y Perú entran solo por su
   participación en resultado/patrimonio (una línea de "resultado en asociadas"),
   NO se agregan sus ingresos/gastos individuales al consolidado.
2. **NCI**: en Allegria Service (20%) y Frisku (10%) el resultado y patrimonio se
   parten entre controladora y no controladora. No olvidar la porción NCI.
3. **Eliminaciones intercompany**: fee admin del Holding, comisiones y royalties
   entre empresas del grupo se eliminan en el consolidado (no inflar ingresos/gastos
   con transacciones internas).
4. **Conversión a USD**: cifras en CLP/PEN se convierten a la moneda funcional USD
   (ver `mediterra-tesoreria` para el mecanismo de TC vía triangulación).

## Coherencia con el código

- El Consolidado del flujo (`empresasConOverrides`, ~línea 3099 de FinanzasModule)
  respeta la lógica mensual-vs-semanal (ver `mediterra-flujo-caja`).
- Allpa Perú tiene su propio flujo de costos aparte del consolidado
  (`allpaPeruPpto.js`, +5%/año), no se mezcla.

## Antes de cerrar

- [ ] Allpa Chile/Perú entran por patrimonio, no línea a línea.
- [ ] NCI aplicado en Allegria Service y Frisku.
- [ ] Transacciones intercompany eliminadas.
- [ ] Todo convertido a USD funcional.
- [ ] Mostrar a Angelo el cuadre del consolidado antes de aceptar.
