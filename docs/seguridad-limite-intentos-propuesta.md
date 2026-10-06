# Límite de intentos por cuenta y origen (D4)

> **Estado (2026-10-06):** implementado y probado **solo en local**, en la rama `claude/seguridad-main-pins`.
> - La tabla y las funciones de `api/sql/seg_intentos.sql` **no** están aplicadas en staging ni en producción. Aplicarlas requiere autorización.
> - Prueba: `POSTGREST_BIN=… node scripts/seguridad-main-pins/prueba-intentos.mjs` (47/47). Corre sobre dos instancias del servidor, IP de origen distintas, peticiones concurrentes y tiempo real acortado.

## Por qué cambió la propuesta anterior

**El 8,8% estaba bien calculado, pero la propuesta no lo bajaba.** Un umbral de 10 fallos por hora que se reinicia solo permite unos 10 intentos por hora, de forma sostenida:

10 × 24 × 365 = 87.600 intentos al año → 87.600 / 10⁶ ≈ **8,76%**.

**Para cumplir tu condición, el umbral por cuenta tiene que ser acumulado y no reiniciarse solo.** La condición: que, alcanzado el umbral, ningún origen nuevo siga probando PIN sin verificación adicional. Además, la verificación adicional (el código por correo) no puede volverse el punto débil. Con 6 dígitos, cualquier tope por código sirve para bloquear a la persona; sin tope, el código se puede adivinar. Por eso el código pasó a tener **60 bits**.

## Contadores

Todos los contadores viven en Postgres:
- se comparten entre instancias;
- son atómicos: el intento se reserva antes de evaluar la credencial (`FOR UPDATE`);
- todo bloqueo tiene tope y vence.

| Contador | Clave | Regla | A quién afecta |
|---|---|---|---|
| K1 | cuenta + origen. El origen es el equipo reconocido o la IP (IPv6 por /64; IPv4 en formato IPv6 se trata como IPv4) | 5 fallos libres; después, demoras de 1, 2, 4, 8, 16, 32 y 60 min (tope). Vuelve a cero tras 24 h sin fallos. Un ingreso correcto lo libera | Solo ese origen con esa cuenta |
| K2 | IP (todas las cuentas) | 30 fallos → demoras de 5 a 60 min. Un ingreso correcto descuenta su intento, sin borrar los fallos previos (una oficina detrás de una misma IP no se bloquea). No aplica a equipos reconocidos | Solo esa IP |
| K3 | cuenta, desde orígenes **no reconocidos** | 10 fallos acumulados → desde cualquier origen nuevo, **el PIN deja de evaluarse**: solo entra el código enviado al correo. Dura 30 días. Un PIN correcto solo descuenta su intento; el umbral se libera entero únicamente con el código del correo o el desbloqueo del administrador | Orígenes nuevos de esa cuenta; nunca a un equipo reconocido |
| KD | equipo reconocido + cuenta | 10 fallos acumulados en 30 días → el equipo deja de contar como reconocido (pasa a K3) | Solo ese equipo |
| KC | código + origen | 5 intentos por código desde un mismo origen; después, desde ese origen el código no se evalúa. Sin tope global por cuenta: un tercero no puede agotarlo para todos | Solo ese origen |

**Mismas reglas en todos los lugares donde se prueba un PIN:**
- login de la app;
- cambio de PIN con el PIN actual (una cookie robada no da intentos aparte);
- osiris-auth (`/api/auth/verificar`, con la IP del cliente reenviada junto al secreto);
- Frisku SharePoint (`/api/frisku-sp`).

## Verificación adicional: el código por correo

- **Formato:** 12 caracteres, `XXXX-XXXX-XXXX` (Crockford base32 = 60 bits; tolera minúsculas, espacios, O/0 e I/1). Se escribe en el campo de la clave. Vence en 45 minutos.
- **"¿Olvidaste tu PIN?" pedido por la propia persona:**
  - **no invalida** su PIN vigente; el correo lo dice;
  - mientras haya un código vigente, un nuevo pedido **no lo reemplaza** ni envía otro correo. Así un tercero no puede invalidar el código que ya está en la casilla de la persona, ni inundarla.
- **Reseteo del administrador:**
  - inhabilita el PIN anterior y cierra las sesiones;
  - deja de reconocer los equipos de esa persona y libera su umbral K3 (desbloqueo controlado);
  - un pedido propio posterior hereda esa inhabilitación.
- **Entrar con el código** obliga a crear un PIN nuevo y libera el umbral de la cuenta.

## Cómo se reconoce un equipo y por qué no se puede falsificar

Al ingresar correctamente, el servidor entrega una cookie aparte, `mediterra_disp`:

- **Atributos:** `HttpOnly` (el JavaScript de la página no la lee), `Secure`, `SameSite=Strict` (otro sitio no la usa), `Path=/api`, 90 días.
- **Contenido:** tipo `disp`, correo, identificador aleatorio de 128 bits, **época de equipos** de la persona y vencimiento.
- **Firma:** HMAC-SHA256 con una llave **derivada** de `SESSION_SECRET`, solo para este uso. Esa llave vive únicamente en el servidor.
  - Sin ella no se puede fabricar ni alterar la cookie.
  - Una cookie de sesión no sirve como cookie de equipo: la llave y el tipo son distintos.
- **Validación:** firma, tipo, vencimiento, que el correo coincida con la cuenta que intenta ingresar y que la época sea la vigente.
  - El cambio de PIN y el reseteo del administrador suben la época, y los equipos anteriores dejan de valer.
  - "Salir" no la sube: cierra las sesiones, pero el equipo sigue siendo reconocido.
- **La IP no forma parte del reconocimiento.** Un celular cambia de IP todo el tiempo.
- **Qué permite:** **no da acceso**. Solo permite intentar el PIN desde ese equipo sin quedar sujeto a K3, con sus propios límites (K1 y KD).
- **Si la roban** (requiere malware o acceso físico al navegador): el ladrón obtiene como máximo los intentos de K1 y KD de ese equipo, y aún necesita el PIN.

**Comprobado en local:**
- cookie de otra persona;
- contenido alterado con la firma original;
- firma inventada;
- cookie de sesión usada como cookie de equipo;
- cookie de época anterior.

Ninguna se reconoce.

## Riesgo residual verificado

Supuestos: atacante sin acceso al correo ni a un equipo reconocido de la persona; PIN de 6 dígitos al azar. Hay 999.980 PIN permitidos (se excluyen 20 repetidos o en secuencia).

| Vía | Máximo por año | Probabilidad anual |
|---|---|---|
| PIN desde orígenes nuevos (K3) | 10 por ciclo. El bloqueo dura 30 días y el contador se reinicia 30 días después del último fallo: ≤ 13 ciclos → **130**. Más 10 por cada vez que la persona verifica con el código (V veces al año) | (130 + 10·V) / 999.980 → con V = 12: **0,025%** |
| Código por correo | 5 por código y por origen; códigos de 60 bits (1,15·10¹⁸). Con 1.000.000 de orígenes: 5·10⁶ / 1,15·10¹⁸ ≈ 4·10⁻¹² por código; ≤ 11.680 códigos al año → **5·10⁻⁸** | despreciable |
| Equipo reconocido robado | KD: 10 por 30 días → ~130, además de K1 | 0,013% (requiere robar la cookie del navegador de la persona) |

**Total sin robo de equipo: ~0,025% al año por cuenta** (antes 8,76%). Un PIN elegido por la persona (fechas, patrones) baja esa seguridad. La política solo rechaza dígitos repetidos y secuencias.

## Lo que un tercero todavía puede hacer (sin bloqueos indefinidos)

- **Exigir el código desde equipos nuevos** de una persona durante 30 días, renovable con 10 intentos. Los equipos reconocidos no se ven afectados. Desde un equipo nuevo la persona entra con el código de su correo, y el tercero no puede agotarlo ni reemplazarlo.
- **Demorar hasta 60 minutos un origen** que comparta con la persona, por ejemplo la misma IP pública, solo para orígenes no reconocidos.
- **Enviar como máximo un código cada 45 minutos** al correo de la persona.
- **Osiris (sesión dual, `REACT_APP_AUTH_DUAL`, hoy no activa en producción según P8):** con el umbral activo no evalúa el PIN y no tiene camino de código ni de equipo reconocido. Antes de activarla en producción necesita una de dos cosas, y queda como requisito:
  - reconocer el equipo;
  - aceptar la sesión vigente de la app.
