# Entrega A · El reajuste que no se aplica deja de ser silencioso

Un aviso. **No cambia ningún importe, no activa nada y no toca la configuración de nadie.**

- **Rama:** `osiris/aviso-reajuste`
- **Base:** `9ddd063e4f8af6e4ec40b22fbfe841c5738970dd` (= `main` publicado)
- **Candidato:** la punta de la rama; el SHA va en el mensaje al pedir la ventana
- **Incluye**, por indicación expresa: el recorrido de País de constitución y el cierre documental
  de la ventana 7, que quedaron sin publicar para no gastar una ventana en documentación sola

---

## 1 · El problema, medido

| | |
|---|---|
| Contratos con la casilla **"📈 Sujeto a Inflación"** marcada | **18 de 23** |
| De esos, con porcentaje cargado | **1** — `TEST PERU`, al 5 % |
| Contratos reales a los que se les aplica algún reajuste | **cero** |

El motor compone `(1 + rcInflacionPct/100)^idx` por cohorte. En 17 contratos ese porcentaje está
vacío, así que el factor es **1** y no se reajusta nada. Hasta acá, correcto: sin definición no
hay nada que aplicar.

Lo que no estaba bien es que **no se dijera**. La pantalla mostraba:

- una etiqueta ámbar **"📈 Sujeto a Inflación"** en la ficha,
- **"+IPC"** en el listado, **al lado del importe por hectárea**,
- y un campo "% inflación anual" con un guion.

De ahí cualquiera concluye que el ajuste se está aplicando. Busqué si existía algún aviso en
alguna pantalla: **no había ninguno**.

## 2 · Qué cambia

Cinco lugares pasan a decir lo que ocurre:

| Dónde | Antes | Ahora |
|---|---|---|
| Listado de contratos | `+IPC` junto al importe | **`sin ajustar`** cuando no se aplica; **`+5%/año`** cuando sí |
| Arriba del listado | nada | *"17 contratos están marcados como sujetos a inflación y no se les está aplicando ningún reajuste, por falta de definición…"* |
| Ficha → Facturación | casilla ámbar y un guion | Aviso bajo la casilla con el motivo y lo que falta |
| Cobros derivados → Royalty Comercial | `📈 Royalty Comercial` | `… · sin reajuste aplicado`, y sobre los montos: **"Estos montos no llevan reajuste."** |
| Export Excel | columna `Sujeto Inflación`: Sí/No | columna **`Reajuste (efecto real)`**: *Aplicando 5 %/año* · *Marcado sin definición — NO se aplica* · *Registrado — todavía NO se aplica* · *Sin reajuste* |

Y en el alta de un contrato nuevo, marcar la casilla avisa que por sí sola no aplica nada, para
no seguir fabricando casos silenciosos.

## 3 · Lo que ya opera, sigue operando

Condición explícita de esta entrega. Un contrato con porcentaje cargado:

- **se declara aplicando**, con su porcentaje, y **no** recibe ningún aviso ámbar;
- su factor compuesto no se toca.

Comprobado en el contrato que hoy tiene 5 %: la ficha muestra el 5 y ningún aviso; el listado
muestra `+5%/año`.

## 4 · Antecedente y efecto son dos cosas

El modelo ya distinguía qué **se declaró** (`estadoReajuste`). Esto agrega qué **hace el motor**
(`reajusteOperativo`). Pueden discrepar, y hoy discrepan:

| Estado | Qué significa |
|---|---|
| `aplicando` | El motor compone ese porcentaje. Es la configuración antigua operando |
| `registradoSinAplicar` | El antecedente está confirmado en el bloque nuevo, **pero el motor no lo lee**. Conectarlo es la entrega B y requiere activación explícita |
| `marcadoSinDefinicion` | La casilla puesta y nada cargado. El caso de los 17 |
| `sinMarca` | Ni lo uno ni lo otro |

El tercer estado es el que importa de cara a B: **confirmar un antecedente no enciende nada**, y
la pantalla lo dice con todas las letras.

## 5 · Pruebas

`avisoReajuste.test.js`, **25 pruebas**:

| Grupo | Qué fija |
|---|---|
| El caso de los 17 | Se avisa y el aviso dice el motivo; cero, vacío y nulo son lo mismo que ninguno; enumera lo que falta; sin marca no avisa nada |
| Lo que opera sigue operando | 5 % se declara aplicando y sin aviso; el porcentaje informado es **exactamente** el que usa el motor; la marca apagada ignora el porcentaje, igual que el motor |
| Registrado sin aplicar | Se dice que no se aplica; confirmar el antecedente deja el motor en factor 1; si además hay configuración antigua operando, manda la que opera |
| **Ningún importe cambia** | Para los cuatro casos, el monto por temporada es idéntico antes y después de preguntar, y preguntar no muta el contrato |
| La etiqueta del listado | Ya no dice `+IPC` sin porcentaje; dice el que compone cuando compone |

Más `impactoAvisoReajuste.test.js`, **6 pruebas sobre la copia de los 23 contratos reales**:

```
porEstado: { marcadoSinDefinicion: 17, aplicando: 1, sinMarca: 5 }
```

y, medido: todos los factores idénticos antes y después; los 17 con factor 1 en todas las
temporadas —que es exactamente lo que el aviso afirma—; el que opera conserva su factor
compuesto; mirar la cartera entera no muta ningún contrato.

## 6 · Comprobado en navegador aislado

Contra la copia de los 23 contratos reales, nunca producción.

| | |
|---|---|
| Listado | 17 etiquetas `sin ajustar`, **0** `+IPC`, una `+5%/año`. El aviso de cabecera dice 17 |
| Ficha de un contrato de los 17 | *"Sujeto a inflación, sin definir. … no se está aplicando ningún reajuste por falta de definición… Falta: tipo de reajuste."* |
| Ficha del que opera | Muestra el 5 y **ningún aviso** |
| Royalty Comercial | Encabezado `· sin reajuste aplicado` y, sobre US$3.646.500 / US$3.099.525: *"Estos montos no llevan reajuste."* |
| **Los importes** | Idénticos: hub *Por cobrar $5.578.534 · 142 pedidos · 53 filas*, y los 41 importes de Reportes/BI uno a uno |

No se modificó ningún contrato: la revisión solo navegó.

## 7 · Recuperación

Revertir el commit. No hay datos nuevos que preservar —el aviso no guarda nada— y ningún importe
cambia al volver, porque ninguno cambió al publicar. Lo que vuelve es el silencio.

## 8 · Qué NO hace

| | |
|---|---|
| Activar un reajuste | No. Ningún contrato empieza a ajustar |
| Conectar el bloque nuevo al motor | No. Eso es la entrega B, con activación explícita por contrato |
| Tocar configuraciones existentes | No. La que opera queda igual, y las 17 marcas se conservan tal cual |
| Decidir porcentajes o índices | No. Son decisiones contractuales |

**Suite completa: 1.411 pasan, 30 saltadas, 1 falla** — `paramsFrutaAnticipos`, atada a la fecha
del carril de anticipos, que falla igual en `main` sin este cambio. Las saltadas son las cinco
suites de impacto que solo corren con una copia de datos reales; la quinta es la que agrega esta
entrega, y se ejecutó (§5). Build `CI=true`: `Compiled successfully`.

## 9 · Estado

Local, sin push ni despliegue, a la espera de autorización.
