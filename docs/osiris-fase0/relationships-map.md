# Relationships & Identifiers Map — Osiris (Fase 0)

Preparación para una futura migración relacional. **No se ejecuta migración en Fase 0.**

## IDs y claves naturales

| Entidad | Colección | Prefijo id | Clave natural (de facto) |
|---|---|---|---|
| Cliente | `clientes` | `cli_` | `razonSocial` / `taxID` |
| Contrato exp-prod | `contratos` | `c_`/id libre | `razonSocial` + `id` |
| Plantación | `contratos[].plantaciones` | `plt_` | `id` (dentro del contrato) |
| OC cliente | `contratos[].ordenesCompra` | `oc_` | `n_oc` |
| Factura RP | `contratos[].facturasRP` | `frp_` | `n_factura` |
| Obtentor | `obtentores` | `obt_` | `obtentor` (nombre) |
| Especie (maestro) | `especies` | `esp_` | `nombre` |
| Variedad (maestro) | `variedades` | `var_` | `(especie, variedad)` |
| Vivero (contrato) | `viveros` | `v_`/id | `viverista` |
| OC vivero | `viveros[].ordenesCompra` | `voc_` | `n_oc` |
| Despacho | `viveros[].ordenesCompra[].despachos` | `d_` | `id` |
| Regla participación | `obtentores[].participacionIngresos` | `pi_` | `(tipoIngreso, especie, variedad)` |

## Relaciones (⚠ = enlace por string, riesgo de migración)

| Relación | Mecanismo actual | Solidez |
|---|---|---|
| Contrato → Cliente | `ct.clienteId` (id) | ✅ FK |
| Contrato → Plantación | anidado en `ct.plantaciones[]` | ✅ contención |
| Plantación → Variedad | `p.variedad_id` (id) + `p.especie`/`p.variedad` (string) | ⚠ mixto |
| Variedad → Especie | `variedad.especie === especie.nombre` | ⚠ string |
| Variedad → Obtentor | `variedad.obtentor === obtentor.obtentor` | ⚠ string |
| Plantación → Vivero | `p.vivero_id` | ✅ id (parcial) |
| Plantación → Sublicenciatario | `p.sublicenciatario_id` | ✅ id |
| Vivero → OC | anidado `v.ordenesCompra[]` | ✅ contención |
| OC vivero → Contrato | `oc.contrato_id` → `oc.cliente_id` → nombre (3 niveles) | ⚠ fallback string |
| OC vivero → Cliente | `oc.cliente_id` | ✅/⚠ |
| OC vivero → Despacho | anidado `oc.despachos[]` | ✅ contención |
| Despacho → Plantación | `d.plantacion_id` | ✅ id (cuando existe) |
| Ingreso (RP/RC/CF) → Contrato | `row.ctId` (derivado) | ✅ id derivado |
| Ingreso → Override | por `id` en `royaltyPlanta`/`royaltyComercial`/`feeEntrada`/`totalPedidos` | ✅ id |
| Obtentor → participación → Ingreso | `regla.tipoIngreso` + match especie/variedad contra **`ct.especie`** | ❌ roto (ver R5) |
| Contrato → Especie (para match obtentor) | **`ct.especie` no existe** (especie vive en plantaciones) | ❌ |

## Campos legacy / obsoletos / opcionales
- `royaltiesObtentor[]`, `TIPOS_ROYALTY_OBTENTOR` — legacy, reemplazados por `participacionIngresos`.
- `rpPlantaCuotas[]` — modelo legacy de cuotas %; coexiste con `facturasRP`.
- `modeloIngresos` = `"oc"` (nuevo) vs `"legacy"` — switch de rama.
- `dhe_estado/dhe_fecha_*` (single) migrados a `especie.dhe[]`.
- Formato plano viejo de viveros migrado a jerárquico al vuelo (sin escribir hasta editar).

## Recomendación para la migración (Fase 1)
Resolver **una sola vez** los enlaces por string (especie/variedad/obtentor) a FK por id, con un reporte de nombres no resueltos para revisión manual antes de escribir nada. Conservar el blob como respaldo hasta validar el modelo relacional contra los conteos del Data Integrity Manifest.
