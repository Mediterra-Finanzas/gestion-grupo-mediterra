# Recorrido en el navegador · paquete A

Hecho el **2026-10-20**, sobre el **bundle final compilado**, no sobre el servidor de desarrollo.

---

## Cómo se aisló, y por qué así

Se reutilizó el método de aislamiento que ya existe en este carril
(`src/config/entornoPrueba.js` + `src/config/instalarCortafuegos.js`), en una **copia aparte**:

| | |
|---|---|
| Rama de la copia | `prueba/paquete-a-visual` (desechable) |
| Base de la copia | el candidato, commit a commit |
| El candidato | **intacto**: el cableado del aislamiento NO entra en `fix/osiris-paquete-a` |
| `main` local y los otros carriles | **sin tocar** |

### Por qué los datos no fueron a la base aislada de la UAT

El recorrido tenía que mostrar **las mismas cifras que sostiene la evidencia**, y esas están en el
corte de producción, que tiene datos de clientes. La base aislada de la UAT la comparten Nicolás,
Milagros y Lorena hasta el 26 y fue autorizada como sintética: cargarle el corte habría cambiado lo
que ellos ven y habría puesto datos de clientes en un servicio compartido.

Así que el corte se sirvió desde **un servidor local de sólo lectura en esta máquina**
(`127.0.0.1:54321`), que imita la interfaz de la base. El corte no salió del equipo.

| Capa | Qué |
|---|---|
| Bandera | `REACT_APP_ENTORNO_PRUEBA=1` — enciende el cortafuegos y el desvío de base |
| Base | `REACT_APP_SUPA_URL=http://127.0.0.1:54321` — pasa el guarda *fail-closed* |
| Datos de Osiris | el corte real: `sha256 48085f5b…`, 23 contratos, 2 viveros |
| Identidad | **sintética**: un usuario `verificacion@ejemplo.invalid`. Ninguna credencial real |
| Cortafuegos | instalado y verificado en vivo: `window.__cortafuegosPrueba === true` |
| Servidor del bundle | estático, sirviendo `build/` desde disco |

## El bundle que se recorrió

| | |
|---|---|
| Candidato | `4b43d940d06f035a5965aecb8e6470c5dfc07069` |
| Bundle final | `/static/js/main.09df34a5.js` |
| Compilación | `Compiled successfully`, exit 0 |

---

## Destinos efectivos de las solicitudes

Medido en vivo con `performance.getEntriesByType('resource')`, no inferido.

| Host | Solicitudes | Qué es |
|---|---:|---|
| `127.0.0.1:54321` | 6 | el servidor local con el corte |
| `localhost:4179` | 6 | el bundle y las imágenes |
| `gestion-grupo-mediterra.vercel.app` | 3 | **ver abajo** |
| `fonts.googleapis.com` | 1 | tipografía |
| `cdnjs.cloudflare.com` | 1 | librería |
| **`*.supabase.co`** | **0** | — |
| **la base productiva `bywovqayuzodbzwsriet`** | **0** | — |

### Escrituras

El servidor local registra cada escritura. En todo el recorrido:

```
lecturas  : 13
escrituras: 3
  POST  ids=[audit_log]   454 bytes
  POST  ids=[audit_log]   795 bytes
  POST  ids=[audit_log]  1171 bytes
```

**Tres escrituras, todas a la bitácora de auditoría, ninguna a la fila `osiris`.** Nada se persistió
fuera del proceso local. **Cero escrituras a producción, a cualquier base.**

### Las 3 solicitudes al dominio productivo, dichas con precisión

Son `GET` a la raíz `https://gestion-grupo-mediterra.vercel.app/`, del **detector de versión nueva**
(`App.jsx`, `checkNewDeploy`): compara el hash del paquete publicado para avisar de un despliegue.

- Es una **lectura** de una página pública. No lleva credenciales, no envía datos y no escribe.
- **Ya existe en el SHA que sirve producción**: no lo introduce el paquete A.
- No es la base de datos. Las solicitudes a la base productiva fueron **cero**.
- El cortafuegos bloquea la base, no este dominio. Dejarlo así fue deliberado: tocar el detector no
  es parte del paquete A.

---

## Lo verificado, pantalla por pantalla

### A1 · El año

| | Antes | En el bundle |
|---|---:|---:|
| 2023 | 414.840 | **255.190** |
| 2024 | 235.174 | **394.824** |

El gráfico muestra 255K / 395K / 2.0M / 2.7M / 86K / 118K "?", y el detalle por año y país totaliza
5,5M. La fila que se movía es una sola: 159.650 plantas con fecha `2024-01-01`.

### A2 · Los tres indicadores y la conciliación

Rótulos en pantalla: **Plantas registradas** (5.5M, "142 plantaciones") · **Facturado y marcado
pagado** (313K, "tandas y despachos") · **Facturable no marcado pagado** (5.4M, "tandas y
despachos"). Los rótulos viejos no aparecen.

Aviso: *"Los dos recuentos no miden lo mismo: 5.524.192 plantas registradas en 142 plantaciones,
contra 5.750.193 en 51 tandas o despachos. Diferencia +226.001 en 12 contratos. No se resta de
ningún total."*

El detalle desplegable trae **16 filas** con el total `5.524.192 / 5.750.193 / +226.001` y el
control *"la suma de las filas cuadra con el total"*, más los 3 contratos que facturan por OC sin
plantación registrada.

**TEST PERU aparece**, en cero, y la pantalla lo nombra: *"1 contrato(s) con filas cargadas y sin
cantidades, que aparecen en cero en el detalle: TEST PERU."*

### A3 · El cobro de las órdenes de compra

| Tarjeta | Valor en pantalla |
|---|---|
| 🏷 Declarado por estado | `$1.569.847,95` |
| 📄 Documento registrado | `$50.600` |
| 🔎 Pago verificado | **`sin conciliación registrada`** — no un cero |
| ⏳ Fee sin declarar pagado | `$450` |

Y el texto: *"63 OC están en estado «Pagada total» y aportan $1.569.847,95. Cuotas de pago cargadas
en el sistema: **0 en 0 OC**. Facturas registradas con importe: $50.600 ($50.600 con fecha de pago
escrita en la propia factura, pendiente de conciliar). **Sin factura registrada en el sistema:
$1.519.247,95 — lo que no está cargado puede existir en papel; esto no afirma que no exista.** El
sistema no guarda conciliación de pago, por eso pago verificado dice sin conciliación registrada y
no un importe: **un cero se leería como prueba de que no se cobró, y eso no está demostrado**."*

Más el aviso de las 2 OC declaradas pagadas con su factura en "Por cobrar": `AGROEX-2024-02`,
`FSFNDO-2023-01`.

### A4 · Factura, pago y proyección, separados

| Tarjeta | Valor | Qué acredita, en pantalla |
|---|---:|---|
| Con factura registrada | `$2.719.243` | *un número de factura cargado en el sistema; no acredita cobro ni conciliación* |
| Calculado pendiente | `$4.769.799` | *un cálculo del sistema sin factura registrada* |
| Proyección futura | `$11.188.950` | *temporadas que no han empezado; no es deuda exigible* |

*"Los tres suman $18.677.992, que no es el total de la cabecera ni el bruto de las tres líneas."*
Base declarada en pantalla. Y la advertencia:

> ⚠ Ninguna de las tres cifras acredita cobro. De los $2.719.243 con factura registrada,
> **$2.541.992 en 19 filas** provienen de registros que se contradicen.

El puente, visible: `cabecera $5.311.342 + comercial omitido $13.366.650 = $18.677.992`, más la
retención, `= $19.493.523`. Cabecera: `Royalty planta + fee $5.311.342,05`. Y el aviso de los 14
contratos que declaran el fee pagado ($420.000).

### A5 · Total Pedidos, filtros y exportación

| | Antes | En el bundle |
|---|---:|---:|
| Σ hectáreas | 0,00 | **407,05 há** |
| Columna Entrega | "undefined Tundefined" | el año |
| Filtro Año | un solo valor vacío | 2023 · 2024 · 2025 · 2026 · 2027 · **Sin fecha** |

El filtro **filtra**, y lo filtrado coincide con la evidencia:

| Filtro | Plantas |
|---|---:|
| 2023 | **255.190** |
| 2024 | **394.824** |
| Sin fecha | **118.325** |

**Exportación Excel**, capturada en memoria y descomprimida para leerla:

| | |
|---|---|
| Archivo | `TotalPedidos_2026-10-20.xlsx`, 445.307 bytes, OOXML válido |
| Filas de datos | **142** |
| Cabeceras | `Fecha pedido o plantación`, `Año`, `Há` … |
| **Σ Há exportada** | **407,05** — idéntica a la pantalla |
| Celdas con "undefined" | **0** |

---

## Dos defectos que encontró el recorrido

Ninguno lo vieron las 53 pruebas ni el build. Los dos están corregidos y reverificados.

### 1 · El aviso decía 141 y el indicador 142

`conciliarUniversos` descartaba los contratos cuya suma de plantas fuera cero en los dos universos.
TEST PERU tiene una plantación y dos tandas, todas con 0 plantas, así que desaparecía sin decirlo.
Dos números para la misma cosa en la misma pantalla — el defecto que este paquete viene a corregir.

**Corregido:** el filtro cuenta filas, no plantas. TEST PERU aparece en cero y la pantalla lo nombra.
El aviso de filas excluidas se muestra siempre, no sólo al desplegar el detalle, y declara las dos
cifras ("141 de 142" cuando corresponde).

### 2 · "Tundefined undefined" en el Excel

La última columna del export (`Trim. Pago Vivero`) escribía eso en las 142 filas derivadas de
contrato. Es el mismo defecto que A5 corrige en la columna Entrega, en un lugar que no había
mirado. **Corregido:** queda vacía.

---

## Lo que el recorrido NO cubre

- **Las cifras de la UAT no sirven para acreditar totales reales**, y no se usaron: todos los
  números de arriba salen del corte de producción.
- La copia de recorrido cablea **base y cortafuegos**, no el bloqueo de módulos ni el de correo del
  entorno de la UAT. Por eso el hub muestra todos los módulos y hubo un `POST` de correo que fue a
  parar al servidor estático local (devolvió la página, no llegó a ningún servicio de correo).
- El aviso "No se guardó" del módulo Tareas al entrar es un artefacto del servidor local, que no
  implementa el contrato de persistencia completo. No es del candidato.
- No se probó guardar y recargar datos de Osiris: el recorrido es de **lectura y presentación**, que
  es lo que cambia el paquete A.
