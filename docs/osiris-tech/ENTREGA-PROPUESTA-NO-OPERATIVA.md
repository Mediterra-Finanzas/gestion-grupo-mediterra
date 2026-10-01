# Entrega · Las propuestas se marcan como no operativas

Corrige una diferencia entre lo que declaré y lo que se publicó en `2a3af93`. **Solo texto**: tres
cadenas visibles y una corrección del acta anterior. Ningún cálculo, ninguna regla, ningún permiso.

- **Rama:** `osiris/propuesta-no-operativa`
- **Base:** `2a3af93`
- **Archivos:** `src/OsirisModule.jsx` (3 cambios de texto) y dos archivos de documentación

---

## 1 · Por qué existe este paquete

En la entrega anterior acordamos que las propuestas de tasa debían mostrarse **claramente como no
operativas**. Escribí ese cambio y lo verifiqué en aislamiento, pero no llegó a producción: al
restaurar las URLs del bundle de revisión con `git checkout -- src/`, antes de commitear, se
revirtió esa edición. El acta y el mensaje del commit afirmaban que estaba incluida. No lo estaba.

## 2 · Qué cambia para el usuario

| | Publicado hoy | Con este paquete |
|---|---|---|
| Etiqueta | — | **NO OPERATIVA**, destacada antes del texto |
| Encabezado | "Propuesta sin validar: 10 %" | "Propuesta registrada: 10 %" |
| Explicación | "No entra al cálculo mientras no la valide un usuario autorizado" | "Es un antecedente guardado: **no se aplica a ningún importe** y el motor sigue usando 15 % (sin validar, heredado del país)" |
| Formulario de carga | — | "Registrar una tasa acá **no la aplica**: queda como antecedente con su respaldo, autor y fecha" |

La diferencia práctica: ahora dice **con qué tasa sigue calculando el motor**, y lo avisa **antes**
de cargar, no solo después.

## 3 · Qué NO cambia

Ningún cálculo, ninguna regla y ningún permiso. Validar sigue bloqueado por la compuerta, no hay
control de transición, y A6 sigue pendiente: el texto de administrador/CFO sigue siendo una regla
propuesta que no autoriza a nadie.

## 4 · Comprobación

El texto exacto de este paquete ya se verificó funcionando en el entorno aislado durante la
revisión de la entrega anterior, con el bundle que lo contenía:

> **NO OPERATIVA** Propuesta registrada: 10 % · propuesta por OT Editar el 2026-10-01. Respaldo:
> CDI Peru-Reino Unido, art. 12. Es un antecedente guardado: no se aplica a ningún importe y el
> motor sigue usando 15 % (sin validar (heredado del país)).

Es la misma edición, reaplicada sobre `2a3af93`. Build `CI=true`: `Compiled successfully`.

## 5 · Cómo se evita que vuelva a pasar

No alcanza con "commitear antes": basta una edición posterior para perderla igual. **No se vuelve
a usar `git checkout -- src/` para retirar los ajustes de aislamiento.** El bundle de revisión se
arma en una copia aparte del commit exacto, que se descarta después, así que el árbol del
candidato nunca se ensucia y no hay nada que revertir. Si alguna vez hiciera falta retirar un
ajuste dentro del árbol, se hace con un cambio específico y revisado, mirando el diff, nunca con
un descarte masivo.

Este paquete ya se verificó con ese método.

## 6 · Recuperación

Tres cadenas de texto en un archivo. Revertir el commit devuelve el texto actual, que tampoco es
incorrecto: dice que la propuesta no entra al cálculo. No hay datos involucrados.

## 7 · Autorización que se necesita

> `AUTORIZO MERGE osiris/propuesta-no-operativa → main`, push y despliegue del paquete exacto
> <SHA de la punta de la rama, indicado al pedir la ventana> sobre la base exacta `2a3af93`.
