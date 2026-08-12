# B. Data Integrity Manifest — Osiris (Fase 0)

Comparación **BEFORE vs AFTER** de la fila productiva `osiris`. Fuente: `snapshots/manifest-before.json` y `manifest-after.json` (sha256 canónico).

## Resultado
| | BEFORE | AFTER |
|---|---|---|
| sha256 | `2e8218b5…6dcd4c2` | `2e8218b5…6dcd4c2` |
| bytes | 225.807 | 225.807 |
| **Diferencias** | — | **0** |

✅ **Hash idéntico, cero diferencias de conteo. Fase 0 no alteró la data productiva.**

## Conteos (BEFORE = AFTER)

### Maestros
| Colección | N |
|---|---|
| clientes | 25 |
| especies | 6 |
| variedades | 26 |
| obtentores | 5 |
| viveros | 2 |
| viveristas | 0 |

### Operación
| Colección | N |
|---|---|
| contratos | 23 |
| plantaciones | 142 |
| OC cliente | 2 |
| facturasRP (en OC) | 0 |
| despachos (vivero) | 66 |
| OC vivero | 71 |
| variedades autorizadas (vivero) | 32 |

### Económico
| Colección | N |
|---|---|
| royaltyPlanta (overrides) | 3 |
| royaltyComercial (overrides) | 1 |
| feeEntrada (overrides) | 1 |
| feeViveros | 0 |
| totalPedidos (overrides) | 2 |
| rpPlantaCuotas (en contratos) | 47 |
| rcCohortes (en contratos) | 2 |
| participacionIngresos (obtentores) | 3 |

### Técnico / documental
| Colección | N |
|---|---|
| visitas (opTecnica) | 0 |
| informes (opTecnica) | 0 |
| PBR (obtentores) | 37 |
| DHE (obtentores) | 25 |
| anexos obtentor | 2 |
| anexos vivero | 3 |
| sublicenciatarios | 1 |

## Comparación con la baseline de auditoría
Todos los números coinciden con la baseline del diagnóstico previo. Detalle nuevo respecto de la baseline (no discrepancia, solo mayor granularidad): `rpPlantaCuotas`=47, `rcCohortes`=2, `obt_dhe`=25, `sublicenciatarios`=1, `viv_anexos`=3. **Ningún registro nuevo se perdió ni se revirtió.**

## Re-verificación
`node scripts/osiris-fase0-snapshot.mjs after` regenera `manifest-after.json`. Comparar `sha256` con `manifest-before.json`. Si difieren en cualquier momento por una acción de Fase 0 → **detenerse e investigar** (no auto-corregir).
