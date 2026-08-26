# SEC-HF1 — ACTA · retirar los PIN literales del frontend

**Base**: `50994c8`, el commit productivo confirmado en el panel de Vercel (branch `main`,
entorno Production, estado Ready).
**Branch**: `osiris-sec-hf1`, worktree aislado. **No se despliega. No se mergea.**

Ningún PIN, hash, sal, correo, nombre ni token aparece en este documento.

---

## 1. Qué cierra, y qué no

Los seis PIN literales de `WORKERS_BASE` viajaban en el bundle publicado **y en su
sourcemap**. Se descargaban del sitio **sin necesidad de ninguna clave**: era la única vía
de la exposición que no requería siquiera la clave anónima, que de por sí es pública.

**No cierra**: los bundles ya publicados y el historial de git siguen conteniendo esos
valores. Quien los haya descargado los conserva. Eso solo lo invalida la rotación de
credenciales, que sigue siendo obligatoria y no es parte de este hotfix.

---

## 2. El cambio, en tres piezas

1. **`WORKERS_BASE` deja de declarar `pin`.** La clave se elimina; no se deja en `""`.
2. **El merge preserva la credencial guardada**, vía `credencialPreservada(saved)`.
3. **Un detector** falla si alguien repone un literal.

### Por qué eliminar y no vaciar

Un `pin: ""` en la lista estática habría sido peor que el literal. El merge hace `...wb` y
el autosave escribe `usuarios` en la fila `main`: ese vacío se habría propagado al estado y
**borrado el PIN almacenado de las seis personas** en el primer guardado.

Un hotfix de frontend no puede modificar datos productivos. Retirar credenciales de `main`
es trabajo de la migración SEC, con respaldo, validación y rollback.

Al corregirlo salió a la luz algo que ya ocurría: **antes de este hotfix el código pisaba lo
guardado con su propio literal.** Si el valor en base y el del código divergían, ganaba el
código. No era inocuo tampoco.

### Por qué una función de tres líneas

`credencialPreservada` podría ser una línea dentro del merge. Se extrajo porque inline la
única forma de probar el invariante sería **replicar el merge dentro del test**, y un test
que replica el código no prueba el código. La costura es el precio de que la garantía sea
comprobable.

---

## 3. Gates

| Gate | Resultado |
|---|---|
| Commit productivo identificado | `50994c8` · confirmado en el panel |
| Hotfix aislado de la base productiva | sí · branch propio desde `50994c8` |
| Diff allowlist | 4 archivos, todos previstos |
| Archivos inesperados | 0 |
| Literales de PIN en `src/` | 0 |
| Literales en build y sourcemaps | 0 |
| Login cifrado | **6/6 PASS** |
| Merge · diff canónico | 0 |
| Autosave · Δ credenciales | 0 |
| Suite | 478 / 478 |
| Build `CI=true` | Compiled successfully |
| Artefacto | 15 archivos · sin zip, dump ni `.env` |
| Rollback sanitizado | ensayado, ver §5 |
| Escrituras en producción | 0 |
| Deploy | NO EJECUTADO |

**13 pruebas propias**, con dos contrapruebas que reproducen el daño —con `pin: ""` la
credencial se pierde, sin preservación desaparece— y dos de anti-vacuidad del detector. Sin
ellas, los otros nueve podrían estar pasando porque el merge no hace nada.

---

## 4. Alcance del gate de login

`login cifrado = 6/6 PASS` significa que las seis personas tienen una credencial cifrada
**existente y operable por el verificador**: formato válido, PBKDF2-HMAC-SHA256, 100.000
iteraciones, sal propia, y la derivación se ejecuta y produce un valor de la forma correcta.
Se comprueba además que **el PIN en claro no es lo que autentica**; si lo fuera, retirar el
literal sería irrelevante.

**No significa que cada persona recuerde su PIN.** Eso exigiría conocerlo, y este gate está
construido para no conocerlo. Nada puede probarlo sin la persona.

---

## 5. Rollback sanitizado

**No existe rollback por reversión.** Revertir el commit, o redesplegar el build anterior,
**restauraría los seis literales** y volvería a publicar un bundle vulnerable. Eso está
descartado por la regla del CFO y por sentido común.

La recuperación es **hacia adelante**, y quedó **ensayada**:

- **Variante de recuperación**: reemplazar `...credencialPreservada(saved)` por su
  equivalente inline y retirar el import. Misma semántica, sin la costura.
- **Ensayada**: compila (`Compiled successfully`) y su bundle tiene **0 literales**.
- Sirve si el problema fuera el módulo nuevo o su importación.

Si el problema fuera de acceso de una persona, la recuperación es **restablecer su
credencial por la vía administrativa existente**, que escribe en la fila `pins`. Nunca
reponer el literal.

**Lo que NO tiene recuperación**: nada en este hotfix borra datos, así que no hay pérdida
que revertir. Esa es justamente la propiedad que §2 vino a asegurar.

---

## 6. Lo que sigue prohibido

Deploy, modificar `main` o `pins`, RLS, Realtime, rotación, login nuevo, cambios
funcionales, y merge a la rama `main`.
