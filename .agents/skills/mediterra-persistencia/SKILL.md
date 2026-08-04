---
name: mediterra-persistencia
description: >
  Patrón OBLIGATORIO de persistencia anti-borrado para la app Gestión Grupo
  Mediterra (Supabase tabla calendario_data). Úsalo SIEMPRE que agregues o
  modifiques carga/guardado/auto-save de cualquier módulo: dbLoad/dbSave,
  dbLoadGeneric/dbSaveGeneric, useEffect de carga inicial, o auto-save con
  debounce. Evita el incidente del 2026-06-16 que borró la fila `main` cuando
  un parpadeo de red hizo que el auto-save escribiera defaults vacíos encima.
  Triggers: persistencia, auto-save, dbLoad, dbSave, guardar, cargar, Supabase,
  calendario_data, cargaOkRef, se borró data, nueva fila/módulo, gate de carga.
---

# Persistencia anti-borrado (regla 9 de CLAUDE.md)

Regla dura del proyecto. Todo módulo que persista en `calendario_data` debe
respetar este patrón, sin excepciones. Un fallo aquí ya borró toda la fila
`main` una vez.

## Las 3 invariantes

1. **La carga NUNCA devuelve defaults en `catch`.** Si la red falla, la función
   de carga propaga la excepción (o el componente la captura y NO habilita
   guardado). Prohibido `return {}` / `return []` / `return null` en el `catch`
   de una función de carga: eso hace parecer que "no hay datos" cuando en
   realidad la red falló.

2. **Gate `cargaOkRef`.** El componente marca `cargaOkRef.current = true` solo
   tras una carga EXITOSA. Se inicializa en `false`.

3. **Todo guardado se bloquea si `cargaOkRef.current` es false.** Auto-save,
   guardado manual, config aparte — todos chequean el gate antes de escribir.

## Patrón de referencia (copiado de RendicionesModule.jsx)

```javascript
// GUARD anti-borrado: solo se guarda tras una carga EXITOSA.
const cargaOkRef = useRef(false);

// ── Carga inicial ──
useEffect(() => {
  let alive = true;
  (async () => {
    try {
      const data = await dbLoadGeneric("mi_id");
      if (alive) {
        setData(Array.isArray(data) ? data : []);
        cargaOkRef.current = true; // ✅ solo aquí se habilita el auto-save
      }
    } catch (e) {
      console.error("[MiModulo] Carga falló — GUARDADO DESHABILITADO esta sesión:", e);
      // ❌ NO poner setData([]) ni return de defaults aquí
    }
    if (alive) setCargando(false);
  })();
  return () => { alive = false; };
}, []);

// ── Auto-save (debounce 1s) ──
const timer = useRef(null);
const primero = useRef(true);
useEffect(() => {
  if (cargando) return;
  if (!cargaOkRef.current) return;          // ✅ gate: no guardar sin carga OK
  if (primero.current) { primero.current = false; return; }
  if (timer.current) clearTimeout(timer.current);
  timer.current = setTimeout(async () => {
    await dbSaveGeneric("mi_id", data);
  }, 1000);
}, [data]); // eslint-disable-line

// ── Guardados manuales / config aparte: mismo gate ──
const guardarConfig = useCallback(async (next) => {
  if (!cargaOkRef.current) { console.warn("[MiModulo] no guardado — carga falló."); return; }
  await dbSaveGeneric("mi_id_config", next);
}, []);
```

## Checklist antes de dar por lista cualquier persistencia

- [ ] `cargaOkRef = useRef(false)` declarado.
- [ ] `cargaOkRef.current = true` SOLO dentro del `try` de carga, tras `setData` con datos reales.
- [ ] El `catch` de carga NO setea defaults ni deja `cargaOkRef` en true.
- [ ] Auto-save chequea `if (!cargaOkRef.current) return;`.
- [ ] Cada guardado manual / config aparte chequea el gate también.
- [ ] Si es un `id` nuevo en `calendario_data`: recuérdale a Angelo que el backup
      diario es genérico y ya lo cubre, pero verifica que el `id` no colisione.

## No tocar

- Las constantes `SUPA_URL` y `SUPA_KEY` (rompería el deploy — avisar a Angelo).
- El backup diario genérico (cubre cualquier fila/módulo, con retención 30d + mensual).
