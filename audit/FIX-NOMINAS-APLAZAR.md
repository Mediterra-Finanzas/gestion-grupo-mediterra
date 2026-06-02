# FIX — Nóminas / "Aplazar" verificado + flush de guardado en recarga

**Branch:** `fix/bug-nominas-aplazar-semana` (desde `main`)
**Archivo:** `src/FinanzasModule.jsx`
**Fecha:** 2026-06-02
**Alcance aprobado:** Opción A — mínimo y quirúrgico.
**Estado:** Implementado + build CI=true OK. **NO mergeado, NO desplegado.**

---

## 1. Causa raíz (resumen)

El "Aplazar" de Nóminas guardaba con un debounce de 800 ms (`saveNominas` → `dbSaveNominas`) **fire-and-forget**: sin `await`, sin verificar `res.ok`, y mostrando el `alert("✅ aplazado")` **de inmediato y optimista**, antes de que el guardado siquiera se intentara. Si el usuario recargaba durante el congelamiento percibido del `prompt()` (focusout de 9230 ms) o dentro de los 800 ms del debounce, el `setTimeout` nunca disparaba y el cambio se perdía silenciosamente. No había flush en `beforeunload`/unmount. (Detalle completo en `BUG-NOMINAS-APLAZAR.md`.)

---

## 2. Cambios aplicados

### Cambio A — Aplazar verificado (await + chequeo res.ok + revertir si falla)

**`dbSaveNominas`** ahora devuelve boolean y acepta `keepalive`:

```diff
-async function dbSaveNominas(nominas) {
+async function dbSaveNominas(nominas, opts={}) {
+  const keepalive = !!opts.keepalive;
   try {
     const migrado = await dbNominasMigrado();
     if (!migrado) {
-      await fetch(`${SUPA_URL}/rest/v1/calendario_data`,{
-        method:"POST",
+      const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data`,{
+        method:"POST", keepalive,
         ...
       });
-      return;
+      return res.ok;
     }
     ...
-    await Promise.all(Object.entries(grupos).map(([emp, noms]) => {
+    const resultados = await Promise.all(Object.entries(grupos).map(([emp, noms]) => {
       ...
       return fetch(`${SUPA_URL}/rest/v1/calendario_data`,{
-        method:"POST",
+        method:"POST", keepalive,
         ...
       });
     }));
-  } catch(e){console.error(e);}
+    return resultados.every(r=>r.ok);
+  } catch(e){console.error(e);return false;}
 }
```

**Interceptor `upd` en `NominaDetalle`** — el alert de éxito ahora depende del guardado real:

```diff
         const itemsSinAplazado = val.filter(it=>it.id !== aplazado.id);
-        onUpdate({...nom, items: itemsSinAplazado});
-        // Crear/agregar a la nómina de la semana destino
-        if(onCrearYAbrir) {
-          onCrearYAbrir(nom.empresa, semDest, nom.año, itemNuevo);
-        }
-        alert(`✅ Item "${aplazado.proveedor||aplazado.tipoDoc}" aplazado a la semana ${semDest}.\nSe eliminó de esta nómina.`);
+        const nombreItem = aplazado.proveedor||aplazado.tipoDoc||"sin nombre";
+        if(onAplazar) {
+          Promise.resolve(
+            onAplazar({nomOrigen: nom, itemsSinAplazado, empresa: nom.empresa, semDest, añoDest: nom.año, itemNuevo})
+          ).then(ok=>{
+            if(ok) alert(`✅ Item "${nombreItem}" aplazado a la semana ${semDest}.\nSe eliminó de esta nómina.`);
+            else   alert(`⚠️ No se pudo aplazar "${nombreItem}" a la semana ${semDest}.\nEl cambio NO se guardó. Revisa tu conexión y reintenta.`);
+          });
+        } else {
+          onUpdate({...nom, items: itemsSinAplazado});
+          if(onCrearYAbrir) onCrearYAbrir(nom.empresa, semDest, nom.año, itemNuevo);
+        }
         return;
```

**Nuevo prop `onAplazar`** en el render de `NominaDetalle` (padre `NominasModule`): mueve el item (quita de origen + agrega/crea destino) usando `nominasRef.current` (estado fresco), persiste con `await dbSaveNominas(...)`, y **revierte el estado local si el guardado no se confirma**:

```js
onAplazar={async ({nomOrigen, itemsSinAplazado, empresa, semDest, añoDest, itemNuevo})=>{
  const prevList = nominasRef.current;
  let base = prevList.map(n=> n.id===nomOrigen.id ? {...n, items: itemsSinAplazado} : n);
  const dest = base.find(n=>n.empresa===empresa && n.semana===semDest && n.año===añoDest);
  if(!dest) { const nd = nominaVacia(empresa, semDest, añoDest); nd.items.push(itemNuevo); base=[...base,nd]; }
  else      { base = base.map(n=> n.id===dest.id ? {...n, items:[...(n.items||[]), itemNuevo]} : n); }
  clearTimeout(saveTimer.current); saveTimer.current=null; pendingSaveRef.current=null;
  setNominas(base);
  const ok = await dbSaveNominas(base);
  if(!ok) { setNominas(prevList); return false; }
  window.auditLog&&window.auditLog("editar", {...});
  return true;
}}
```

> `onCrearYAbrir` se mantiene intacto (lo usa también el botón de crear nómina de empresa hermana, línea ~12060). Solo el camino de aplazar pasa ahora por `onAplazar`.

### Cambio B — Flush del debounce en beforeunload / unmount

```diff
   const saveTimer = useRef(null);
+  const pendingSaveRef = useRef(null);
   function saveNominas(list) {
     clearTimeout(saveTimer.current);
+    pendingSaveRef.current = list;
     saveTimer.current = setTimeout(()=>{
+      saveTimer.current = null;
+      pendingSaveRef.current = null;
       dbSaveNominas(list);
     }, 800);
   }
+  function flushNominas(keepalive=false) {
+    if(saveTimer.current) {
+      clearTimeout(saveTimer.current);
+      saveTimer.current = null;
+      const list = pendingSaveRef.current;
+      pendingSaveRef.current = null;
+      if(list) dbSaveNominas(list, {keepalive});
+    }
+  }
+  useEffect(()=>{
+    const onBeforeUnload = ()=>flushNominas(true);
+    window.addEventListener("beforeunload", onBeforeUnload);
+    return ()=>{ window.removeEventListener("beforeunload", onBeforeUnload); flushNominas(false); };
+  },[]);
```

`keepalive:true` permite que el POST sobreviva a la recarga/cierre de pestaña. Se usa `fetch` con keepalive (no `sendBeacon`) porque Supabase REST requiere headers `apikey`/`Authorization`, que `sendBeacon` no permite enviar.

---

## 3. Cómo se mitiga el bug

- **Feedback honesto:** el alert "✅ aplazado a semana X" solo aparece tras un `res.ok` real de Supabase. Si falla, alert de error con instrucción de reintentar, y el item NO desaparece de S23 (revertido).
- **Sin pérdida por recarga durante el debounce:** cualquier guardado de nóminas pendiente (no solo aplazar) se fuerza en `beforeunload` (keepalive) y al desmontar el módulo.
- **Sin condición de carrera en la lista:** `onAplazar` lee `nominasRef.current` (fresco) y cancela el debounce pendiente antes de su propio guardado awaited, evitando que un save viejo pise al nuevo.

---

## 4. Plan de testing manual

Probar en local (`npm start`) con un usuario con permiso de edición de nóminas:

1. **Aplazar feliz (semana existente):** Allegria S23 con un item; en Obs. escribir "aplazar", elegir S24 (que ya exista). Verificar alert ✅, item desaparece de S23 y aparece en S24. **Recargar** → debe persistir (item en S24, no en S23).
2. **Aplazar a semana inexistente:** elegir una semana destino sin nómina previa. Debe crear la nómina destino con el item. Recargar → persiste.
3. **Aplazar con fallo de red:** cortar conexión (DevTools → Offline) antes de confirmar la semana. Verificar alert ⚠️ de error, y que el item **siga** en S23 (revertido). Reconectar y reintentar → ✅.
4. **Recarga inmediata (flush):** hacer una edición normal de un item (monto/comentario) y **recargar la página dentro de ~1 s**. Verificar que el cambio quedó guardado (flush beforeunload).
5. **Cerrar pestaña con edición pendiente:** editar item y cerrar la pestaña antes de 800 ms; reabrir → cambio guardado.
6. **No regresión empresa hermana:** botón de crear nómina de otra empresa (camino `onCrearYAbrir`) sigue funcionando igual.
7. **Auditoría:** el aplazar exitoso deja registro en el log de Auditoría ("Aplazó item …").
8. **Verificación de cuadre:** confirmar que los totales de S23 (sin el item) y S24 (con el item) son aritméticamente correctos tras el movimiento.

---

## 5. Deuda técnica explícita (FUERA de alcance — para futuras sesiones)

1. **Reemplazar `prompt()`/`alert()` por modal no bloqueante** en el flujo de aplazar (Obs. onBlur, ~11425). Es la causa del congelamiento de 9 s (`focusout took 9230ms`).
2. **Refactor del patrón fire-and-forget** en el resto de `saveNominas`/otros handlers de Finanzas (las ediciones normales siguen sin verificación visual; ahora mitigadas solo por el flush).
3. **Riesgo de closure obsoleto en `onCrearYAbrir`** (usa `nominas` del closure en `.find`, no `nominasRef`/`prev`). El camino de aplazar ya lo evita vía `onAplazar`, pero `onCrearYAbrir` sigue igual.
4. **Patrón de `persistAll` (FlujoModule) que devuelve `true` cuando se bloquea** durante la ventana de carga (`window._finLoadTime`, ~10452): debería encolar/reintentar y no simular éxito. No tocado.
5. **Límite de payload con `keepalive`** (~64 KB por request inflight): si una empresa acumula muchísimas nóminas, el flush en beforeunload podría truncarse. Aceptable hoy; revisar si crece el volumen.

---

### Referencias de código (post-fix)
- `dbSaveNominas` (boolean + keepalive): `src/FinanzasModule.jsx` ~11162
- Interceptor `upd` (alert condicionado): ~11600
- `saveNominas` + `flushNominas` + effect beforeunload: ~12786
- Prop `onAplazar` (move verificado): ~12996
