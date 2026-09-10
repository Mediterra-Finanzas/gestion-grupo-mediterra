# Producción · cobertura de recuperación con la evidencia accesible

Medido en solo lectura el 2026-09-10. No se activó ningún servicio con costo, no
se ejecutó ninguna restauración y no se escribió nada.

---

## Lo que existe, verificado

### Bitácora de cambios — el único mecanismo de recuperación comprobado

Fila `audit_log` de `calendario_data`:

| | |
|---|---|
| Eventos | **8.164** |
| Rango | 2026-07-10 18:43 → 2026-09-10 02:20 |
| Con `valorAnterior` | **8.164 de 8.164** |
| Campos por evento | `id, rol, campo, email, accion, modulo, seccion, usuario, timestamp, registroId, valorNuevo, descripcion, valorAnterior` |
| Por módulo | finanzas 5.846 · osiris 1.418 · sistema 814 · tareas 86 |
| Por acción | editar 6.937 · login 384 · logout 354 · crear 344 · cambio_permiso 53 |

**Todos** los eventos guardan el valor anterior. Eso permite revertir campo a
campo dos meses de cambios, y es exactamente lo que se usó en la recuperación
del padrón del 2026-09-07.

Tres límites que hay que decir:

1. Cubre lo que la aplicación instrumenta con `window.auditLog`. Un cambio hecho
   por fuera de la app no queda registrado.
2. Vive en la misma tabla que serviría para reparar. Si se pierde
   `calendario_data`, se pierde la bitácora con ella.
3. No cubre Storage: los 1.657 adjuntos no tienen bitácora.

### Superficie a recuperar

107 filas en `calendario_data`. Antigüedad mediana 91 días, la más vieja 141.
Cuatro filas escritas hoy.

## Lo que NO existe

**Respaldos en tabla: 0 filas `backup_*`.** El generador `auto-v3` está
suspendido desde el hotfix, y antes tampoco dejaba filas visibles. El mecanismo
de respaldo de la aplicación no está entregando nada hoy.

## Lo que no se puede ver con la clave que tengo

| Dato | Por qué |
|---|---|
| `archive_mode`, `wal_level`, `archive_command` | requieren una conexión de base; PostgREST no los expone |
| Última corrida del respaldo nativo | solo el panel o la API de gestión |
| Frecuencia y retención | idem |
| PITR contratado sí/no, y su ventana | idem |
| Logs de acceso a Storage | idem |

En staging sí los medí: `archive_mode=on`, `archive_command` de wal-g,
`archive_timeout=120`, `wal_level=logical`. **No extrapolo eso a producción**:
son proyectos y planes distintos.

Corrijo lo que dije antes: un DSN de solo lectura daría `pg_settings`, es decir
si el archivado de WAL está activo. **No daría** frecuencia, retención ni si
PITR está contratado. Eso solo lo expone el panel o la API de gestión.

## Lo que se necesita para cerrar esto

Una captura de **Database → Backups** del proyecto productivo. Ahí figuran la
última corrida, la frecuencia, la retención y si PITR está habilitado con su
ventana. Es lectura, no activa nada.

## Una restauración productiva no se hace con esto

Aunque el respaldo nativo esté sano, restaurar el proyecto a un punto en el
tiempo **pisa todo lo que el equipo escribió después**. Hoy hay escritura
diaria: cuatro filas en lo que va del día, nóminas y finanzas movidas anoche.

El procedimiento que preserva esas escrituras ya está construido y medido en
staging (13/13): ensayo aislado en una tabla aparte, clasificación por fila, y
escritura solo de lo que falta. Nunca `UPSERT` masivo — la contraprueba mostró
que el upsert sí habría pisado el trabajo posterior.

**Una restauración en producción requiere su propio plan aprobado.** No la
propongo ni la preparo hasta que haya un motivo concreto y una autorización que
la nombre.
