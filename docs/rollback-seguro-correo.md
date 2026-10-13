# Rama `claude/rollback-seguro-correo` — qué es y qué no es

**Es** un destino de contención: la app de `main` 778a397 con el endpoint de correo protegido. Al
volver a ella, el servidor de correo propio no reabre el relé (`verificar-correo-protegido.mjs`
da PROTEGIDO).

**No es** una recuperación completa de seguridad:
- La app antigua sigue usando **EmailJS** cuando el servidor rechaza su formato. Mientras exista,
  el relé de EmailJS sigue abierto.
- **No es compatible con la retirada de EmailJS** (paso F del plan). Comprobado en
  `scripts/e2e/rollback-sin-emailjs.mjs` (Chromium emulado, correo simulado):
  - con EmailJS activo, la notificación sale por EmailJS;
  - con EmailJS retirado, **la notificación se pierde y la pantalla no avisa nada**.
  - El código provisorio usa el mismo camino en esta app: al leer el código se ve que muestra el
    mensaje de envío aunque EmailJS lo rechace. [Probable]: no lo ejecuté en el navegador.

**Uso permitido:** solo entre el despliegue protegido y el paso F. Después de F, el único destino de
vuelta atrás válido es un despliegue que ya tenga el cliente de correo nuevo
(`claude/auditoria-funcional` o posterior), comprobado con
`verificar-correo-protegido.mjs --commit/--url`.
