# Auditoría de seguridad — App Gestión Grupo Mediterra
Fecha: 2026-06-18 · Alcance: acceso, datos confidenciales, extracción de información.

## Resumen ejecutivo (en simple)

Hoy, **cualquier persona que tenga la "llave pública"** (que viaja dentro del código de la página y se puede extraer con conocimientos básicos) puede, **sin iniciar sesión**:
- **Leer toda la base de datos** (finanzas, nóminas, contabilidad, usuarios).
- **Descargar los archivos confidenciales** (respaldos de nóminas, boletas de rendiciones). ← *verificado: se pudo bajar un archivo del bucket privado.*

El login (mejorado en Fases 2 y 3) protege la **pantalla de entrada**, pero **no impide** estos accesos directos "por la ventana de atrás". El salto de seguridad real es cerrar esas dos ventanas: **base de datos** y **archivos**.

> Nota honesta: ningún sistema es "100% inhackeable". El objetivo realista es llevar el riesgo de **crítico** a **bajo/profesional**. Para datos financieros, además, vale considerar a futuro una **auditoría externa (pentest)** por un tercero especializado.

## Hallazgos por criticidad

### 🔴 CRÍTICO
1. **Toda la base de datos es legible con la llave pública**, sin login. Verificado en ~20 tablas (calendario_data + todo el esquema contable). RLS desactivado en todas.
2. **Los archivos confidenciales (Storage) son descargables con la llave pública.** Verificado: se listó y descargó contenido de `nominas-docs`. También `frisku-docs` (boletas).
3. **Escritura abierta:** la misma llave permite escribir/borrar datos (no solo leer) → riesgo de fraude/manipulación, no solo de fuga.
4. **Permisos solo en el frontend:** los roles ocultan botones, pero no impiden el acceso directo. Sin la base cerrada, son cosméticos.

### 🟠 ALTO
5. **Auth dual / Edge Function** lee la base con la llave pública (acople a resolver al cerrar).
6. **PINs**: ya cifrados (Fase 2b) ✅ — pero de 6 dígitos, vulnerables a fuerza bruta *offline* si alguien copia los hashes mientras la base esté abierta. Se mitiga al cerrar.

### 🟡 RESUELTO / EN BUEN ESTADO (Fases 1-3)
- PINs cifrados (no en texto plano). ✅
- Mensajes de login neutros (no revelan usuarios). ✅
- Validación de campos, bloqueo de desactivados. ✅
- Auto-logout por inactividad, vencimiento 60 días, no repetir últimas 3, clave alfanumérica. ✅
- Llave de servicio (service_role) NO expuesta en el navegador. ✅
- `.env` correctamente ignorados por git. ✅

## Las opciones para llegar a "seguridad completa"

Hay que cerrar **base de datos** Y **archivos**. Dos caminos principales:

### Opción A — Guardia intermedio (proxy server-side) — *lo ya construido*
Cerrar la llave pública; todo pasa por un servidor con sesión.
- ✅ Ya construido y probado para la base (90% listo). Rápido de terminar.
- ✅ Conserva el login por PIN actual.
- ⚠️ Es una capa propia que hay que mantener.
- ⚠️ **NO cubre Storage** nativamente → los archivos hay que protegerlos aparte (políticas de Storage / URLs firmadas).
- ⚠️ Tuvimos un incidente con su activación (resuelto con plan en 2 fases).

### Opción B — Supabase Auth + RLS (estándar de la industria)
Cada usuario con cuenta real; reglas de acceso (RLS) por usuario/empresa en la base, y políticas equivalentes en Storage.
- ✅ Es la forma **canónica y robusta**; cubre base **y** archivos de forma nativa.
- ✅ Permisos por rol/empresa **reales** (no cosméticos).
- ✅ Menos capa propia que mantener.
- ⚠️ Es una **migración más grande**: crear cuentas, cambiar cómo entra cada módulo, escribir las reglas por tabla. Más trabajo y se hace por etapas.

### Opción C — Híbrido (pragmático)
1. **Ahora:** cerrar el hoyo urgente con el guardia (rápido) + asegurar Storage (políticas privadas + URLs firmadas).
2. **Después:** migrar a Supabase Auth + RLS como solución durable, sin prisa.

## Recomendación

Para tu objetivo (evitar hackeos y extracción de datos) **siendo no experto y necesitando algo robusto y mantenible**, la solución *más completa y estándar* es la **Opción B (Supabase Auth + RLS)**. Pero dado que el guardia ya está casi listo y el riesgo es **hoy**, lo más sensato es el **Híbrido (C)**:

1. **Urgente — Storage:** cerrar la descarga pública de archivos (es la fuga más grave y está activa ahora).
2. **Corto plazo — Guardia (Fase A rodaje → Fase B cierre):** cerrar la base, con el plan en 2 fases ya definido.
3. **Mediano plazo — migrar a Supabase Auth + RLS:** la base durable, con permisos por rol reales.

## Sobre una auditoría externa
Lo de arriba es una auditoría **interna** (yo, sobre el código y la exposición real). Para un sistema financiero, una **auditoría externa / pentest** por una empresa especializada da un sello independiente y suele encontrar cosas que una interna no. Recomendable una vez cerradas estas brechas. Puedo dejar documentada la arquitectura y los hallazgos para entregársela.
