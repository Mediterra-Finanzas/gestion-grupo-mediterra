# Recuperación administrativa de accesos ante pérdida total (propuesta, no implementada)

**Cuándo aplica:** la fila `usuarios` o la fila `pins` de `calendario_data` desaparecen o quedan
dañadas, por cualquier causa.

**Qué NO hace la restauración normal.** Desde esta rama, «Restaurar respaldo» nunca escribe
`usuarios`, `pins` ni `permisos_facultades`, aunque falten, y tampoco cambia responsables ni
supervisores de Tareas (`src/restaurarRespaldo.js`). Así un respaldo no reactiva personas ni
devuelve permisos o PIN antiguos. La contracara: ante una pérdida total, el respaldo no repone los
accesos solo. Para eso es este procedimiento, separado y revisado.

## Principios

1. **Accesos de hoy, no los del respaldo.** El respaldo sirve como referencia de quién existía y
   con qué perfil. Cada persona se revisa antes de reponerla.
2. **Nunca se reponen PIN antiguos.** Los hashes del respaldo no se restauran: pueden estar
   comprometidos, como en el caso de `files.zip`. Cada persona recibe un código provisorio de 45
   minutos y crea un PIN nuevo de 6 dígitos.
3. **Una persona desactivada sigue desactivada**, salvo una decisión explícita y registrada.
4. **Cuatro ojos:** prepara una persona (administración) y aprueba otra (tú).
5. **Producción en solo lectura** hasta el paso 5. Todo lo demás es local.

## Pasos

| # | Qué | Quién | Herramienta |
|---|---|---|---|
| 0 | Detectar y congelar: la app ya no escribe ante una carga fallida (regla 9). Se avisa al equipo que no ingrese. | Administración | Aviso interno |
| 1 | Confirmar la pérdida en solo lectura: la fila no existe o su contenido no es una lista válida. | Administración | `supabase/consulta_metadatos_solo_lectura.sql` más una consulta `BEGIN READ ONLY` de existencia de la fila |
| 2 | Del último respaldo descargado (local, nunca subido), extraer solo la lista de personas: nombre, correo, perfil, módulos, permisos por pestaña y desactivado. Sin `pins`. | Administración | Herramienta local sin red, como `scripts/datos/extraer-creditos-minimo.html` (por construir) |
| 3 | Revisar persona por persona: quién se repone, con qué perfil y permisos, y quién queda desactivado. Contrastar con el registro de auditoría por cambios posteriores al respaldo. | **Tú** | Planilla de revisión generada en el paso 2 |
| 4 | Generar el SQL de reposición: una transacción que inserta la fila `usuarios` revisada **solo si no existe** (`ON CONFLICT DO NOTHING`) y verifica el «antes». Para `pins`, una fila vacía (`{}`). | Administración | Script local que produce el SQL para revisar |
| 5 | Aplicar en el SQL Editor con tu aprobación explícita. | Tú o quien designes | SQL Editor |
| 6 | Emitir un código provisorio a cada persona repuesta, desde «Permisos» del administrador, y entregarlo por canal interno. | Administración | Flujo existente de código provisorio |
| 7 | Verificar el ingreso de cada persona y registrar la recuperación en el registro de auditoría. Descongelar. | Administración y tú | App |

## Decisiones pendientes

1. **El primer administrador.** Sin `pins` nadie puede ingresar a emitir códigos. Hay dos
   opciones:
   - en el paso 4, crear tu credencial con un código provisorio generado localmente y entregado
     en persona;
   - mantener una credencial de emergencia sellada.
2. **La herramienta local de los pasos 2 y 4.** No existe todavía. Se construye solo si apruebas
   este procedimiento.
3. **Facultades** (`permisos_facultades`, rama de permisos): se reponen igual que `usuarios`, con
   revisión, o se dejan vacías y se asignan de nuevo.
