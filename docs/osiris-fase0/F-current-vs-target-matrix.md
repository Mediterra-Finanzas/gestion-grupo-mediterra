# F. Current vs Target Matrix — Osiris (Fase 0)

Reglas de negocio objetivo entregadas por Angelo (secciones 9–17 del brief). **Documentadas, NO implementadas en Fase 0.** El comportamiento CURRENT está congelado por la suite de regresión.

| Área | CURRENT (congelado) | TARGET (Fase 3+) | Impacto | Riesgo migración | Fase |
|---|---|---|---|---|---|
| **Hecho generador RP** | RP nace por rama: despacho / factura / cuotas. No hay "OC confirmada" como hito económico. | Hecho generador = **OC confirmada por cliente**. Base = N° plantas confirmadas × US$/planta. Despacho/factura/pago son hitos posteriores. | Alto | Medio | 3 |
| **Estados de ingreso** | 2: `nFact` presente + `pagado` bool. | **Devengado → Facturado → Parcialmente cobrado → Cobrado**, con montos y fechas. | Alto | Medio | 3 |
| **RC hectáreas** | `haTotal` = Σ ha plantadas (excl. Prueba). No hay "ha cobrables". | Distinguir **ha plantadas / ha cobrables / ajuste** (temporada, cantidad, motivo, obs, usuario, fecha). Ajuste NO altera ha físicas; puede variar por temporada. | Alto | Medio | 2–3 |
| **RC mes de cobro** | `ct.rcMesCobro || default país`. | Jerarquía **Contrato > Cliente > País/default**. | Bajo | Bajo | 3 |
| **RC inflación** | `(1+infl)^idx` por cohorte, desde 2° año. | Conservar; parametrizable; validar 1er año sin indexar. | Bajo | Bajo | 3 |
| **Fee Entrada 70/30** | Deriva monto; participación vía `participacionIngresos` (o IQ hardcode). | 70% genetista / 30% Osiris parametrizable. | Medio | Bajo | 3 |
| **Fee Entrada imputable a RP** | **No existe.** Fee y RP son independientes. | En algunos contratos el Fee Entrada **se descuenta del Royalty Planta**. Conservar: RP bruto, Fee Entrada, **Fee imputado**, saldo RP a cobrar. | Alto | Medio | 3 |
| **Doble participación genetista** | No hay imputación, así que no se dobla; pero tampoco se controla. | 70% sobre el **mismo valor económico una sola vez**. Ej.: total = 70%×RP bruto (75.000)=52.500, **no** 21.000 + 70%×75.000. Tests específicos en Fase 3. | Crítico | Medio | 3 |
| **Fee Vivero** | Modelado en OC vivero; tabla vacía; no consolida a Ingresos; genetista de facto no participa (pero no está declarado). | Vivero→Cliente→OC→Variedad→plantas vendidas→US$/planta→Fee→Factura→Cobranza. **Genetista NO participa (100% Osiris)**, declarado explícito. Reconciliar plantas OC vs vendidas vs despachadas. | Alto | Medio | 3 |
| **Regla 70/30** | Hardcode `PCT_IQ=0.70`,`PCT_WHT=0.10` solo para "IQ" + `participacionIngresos` data-driven en paralelo. | Parametrizable **Genetista → Contrato → Variedad → Tipo ingreso**, 70/30 general. **Fee Vivero excluido.** Deprecar hardcode IQ tras congelarlo. | Crítico | Bajo | 3 |
| **Devengo vs facturación vs cobranza** | Solo facturado/pagado. "devengado" no existe en el código. | Cliente: devengado→facturado→parcial→cobrado. Genetista: **obligación devengada→parcial→pagada**. No asumir cobranza=pago simultáneos. | Crítico | Medio | 3 |
| **Match especie obtentor** | Compara contra `ct.especie` inexistente → solo reglas comodín funcionan. | Match contra especie del ingreso/plantación. | Alto | Bajo | 3 |
| **Trial/Prueba** | Excluido de RC; incluido en RP. | Conservar; además pipeline Trial→Comercial. | Bajo | Bajo | 2–5 |
| **temporadaDeFecha TZ** | Sensible a timezone en bordes de mes. | Normalizar parsing de fecha (local, sin hora UTC). | Medio | Bajo | 3 |

## Reglas objetivo textuales (para no perderlas)

**RP — hecho generador (§9):** OC confirmada por cliente. `plantas confirmadas × US$/planta`. Estados separados devengado→facturado→parcialmente cobrado→cobrado.

**RC — hectáreas (§10):** ha plantadas (física) vs ha cobrables (temporada) vs ajuste (con temporada/cantidad/motivo/obs/usuario/fecha; no modifica histórico físico). Ej.: 50 plantadas − 5 ajuste = 45 cobrables × US$1.200 = US$54.000.

**Fee Entrada (§12–13):** una vez; participa 70/30; **imputable a RP** en algunos contratos. Conservar RP bruto / Fee / Fee imputado / saldo RP. Evitar doble 70%: total genetista = 70% × RP bruto (incluye el fee imputado), una sola vez.

**Fee Vivero (§14):** lo paga el vivero; `plantas vendidas × US$/planta`; **genetista NO participa (100% Osiris)**.

**70/30 (§15):** general para Fee Entrada, RP y RC; parametrizable Genetista→Contrato→Variedad→Tipo; **no** hardcode IQ. Fee Vivero excluido.

**Devengo (§16–17):** separar **hecho generador** (evento contractual, ej. OC confirmada), **facturación** (documento), **cobranza** (dinero). Nunca usar factura como sustituto de devengo ni `pagado=true` como sustituto de cobranza estructurada.
