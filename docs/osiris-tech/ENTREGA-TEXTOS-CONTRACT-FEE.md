# Entrega · Los textos del contract fee dicen lo que el código hace

Paquete de **solo texto**: no cambia ningún cálculo. Independiente del modelo de retención y del
resto del paquete tributario.

- **Rama:** `osiris/textos-contract-fee`
- **Base:** `3c490b5` (`origin/main` al 2026-10-01)
- **Archivo:** `src/OsirisModule.jsx`, 12 líneas agregadas, 3 modificadas

---

## 1 · Aclaración de alcance: esto es solo una parte de T1

El T1 que describí antes tenía tres piezas. **Dos de ellas no son independientes** y no entran acá:

| Pieza | ¿Independiente de T2? |
|---|---|
| Las siete leyendas "WHT 15 %" pasan a mostrar la tasa real con su procedencia | **No.** Dependen de `retencion.js`, que no está en `main`. Van con T2 |
| El aviso "los netos no están validados" mal ubicado en Fee de Entrada y Fee Viveros | **No aplica.** Ese aviso no existe en `main`: lo introduce T2 |
| El contract fee se describe como lo que el código hace | **Sí.** Es lo único de T1 que se puede publicar hoy |

## 2 · Qué cambia para el usuario

Una sola frase visible, en el panel de cobros derivados de cada contrato:

- **Antes:** "Contract Fee: **100% sin WHT**"
- **Ahora:** "Contract Fee: **se factura y se cobra en bruto** (el sistema no le calcula retención;
  si corresponde o no es una definición pendiente)"

"100 % sin WHT" es una afirmación tributaria: dice que ese cobro no está afecto a retención. No hay
documento que la respalde, y el propio código la contradice: `derivarContractFeeDesdeContratos`
calcula un `montoNeto` con retención que **ninguna pantalla lee**, mientras el tablero suma el
bruto. Cuál de los dos rige es la decisión A7, que sigue abierta. Mientras tanto la pantalla
describe lo que el código hace y no afirma lo que no está acreditado.

Los otros dos cambios son comentarios de código, invisibles para el usuario: dejan anotado que esas
dos sumas toman el bruto y que ese `montoNeto` no lo lee nadie.

## 3 · Qué NO cambia

**Ningún cálculo.** Comprobado comparando las expresiones sin sus comentarios contra `origin/main`:

```
const cfNeto    -> IDENTICA
const cfPagado  -> IDENTICA
montoNeto:      -> IDENTICA
```

El importe que se muestra, el que se suma y el que se exporta son exactamente los de hoy. El
`montoNeto` que nadie lee se deja tal cual: quitarlo sería decidir que el fee no lleva retención,
y eso es precisamente lo que no está decidido.

## 4 · Pruebas

Al no cambiar ningún cálculo, la cobertura relevante es la de no-regresión: suite completa sobre
esta rama, con la misma única falla que `origin/main` ya tiene (`paramsFrutaAnticipos`, dependiente
de la fecha, del carril de anticipos). Build `CI=true`: `Compiled successfully`.

## 5 · Recuperación

Un archivo, tres líneas modificadas, todas de texto. Revertir el commit devuelve la frase anterior.
No hay datos involucrados: volver atrás no pierde nada y no reintroduce ningún defecto de cálculo,
solo vuelve a afirmar en pantalla algo que no está acreditado.

## 6 · Autorización que se necesita

> `AUTORIZO MERGE osiris/textos-contract-fee → main`, push y despliegue del paquete exacto
> <SHA de la punta de la rama, indicado al pedir la ventana> sobre la base exacta `3c490b5`.

Es la entrega de menor riesgo de todas las que hay en curso. Si preferís no gastar una ventana en
un cambio de texto, puede esperar y publicarse junto a T2, donde el resto de las leyendas se
corrige de todos modos.
