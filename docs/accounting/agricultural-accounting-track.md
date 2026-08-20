# Agricultural Accounting — Architecture Track

## Estado
**Pre-design — no bloqueante para OA-024-09**
Implementar después del primer batch ALF POSTED + read model básico funcionando.

---

## Objetivo

Extender el modelo contable financiero con dimensiones agrícolas para producir:

- P&L por campo / cuartel / bloque
- Costo/ha, Costo/kg, Kg/ha, EBITDA/ha
- Real vs Budget vs Forecast vs Año Anterior
- Drivers operacionales (labor, insumos, maquinaria, mano de obra, producción)

Sin crear una segunda contabilidad paralela.

---

## Principio de diseño: extensión, no duplicación

```
acc_account_balance          ← fuente de verdad financiera (no cambia)
       +
acc_agri_dimension           ← dimensiones agrícolas (nueva tabla)
       +
acc_agri_allocation          ← reglas de distribución de costos
       ↓
vw_agri_pl                   ← vista materializada P&L agrícola
```

Los saldos contables financieros no cambian. Las dimensiones agrícolas son una capa de atribución.

---

## Dimensiones candidatas

| Dimensión | Granularidad | Fuente de datos |
|---|---|---|
| Campo / Fundo | entidad productora | Allegria, Allpa |
| Cuartel / Bloque | sub-campo | mapa productivo |
| Especie | cerezas, arándanos, ciruelas | acc_reporting_account / FriskuMaestros |
| Variedad | Regina, Santina, etc. | FriskuMaestros |
| Temporada | Julio–Junio | períodos agrícolas (≠ fiscal year) |
| Labor | poda, raleo, cosecha, etc. | presupuesto operativo |
| Insumo | fertilizantes, pesticidas | compras |
| Mano de obra | permanente, temporera | nóminas |
| Maquinaria | propia, contratada | activos / arriendo |
| Producción (kg/cajas) | harvest | datos producción |

---

## Relación temporada agrícola vs año fiscal

- **Año fiscal Mediterra**: enero–diciembre (acc_period actual)
- **Temporada agrícola**: julio–junio (no coincide con fiscal year)

El modelo acc_period puede extenderse con `period_type = 'seasonal'` para cubrir temporadas sin modificar la estructura existente. Los reportes agrícolas se calcularán sumando períodos monthly dentro del rango julio–junio.

---

## Dependencias del critical path

Para implementar agri-accounting se necesita primero:
1. Al menos 2 meses de Balance + EERR ALF posteados (para validar el pipeline)
2. Definición del plan de cuentas agrícola (qué cuentas mapean a qué dimensiones)
3. Datos de producción (kg/ha) por cuartel — fuente a definir
4. Budget operativo por campo en formato importable

**No bloquea OA-024-09 en absoluto.**

---

## Siguiente acción cuando sea momento

STEP FOR ANGELO: compartir mapa de campos/cuarteles de Allegria Foods y el Excel de presupuesto operativo 2026 por campo.
