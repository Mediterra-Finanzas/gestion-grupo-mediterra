/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════
// usuariosGlue.js — glue de cliente EXTRAÍDA de App.jsx (PROD-INCIDENT-01 FIX).
//
// POR QUÉ EXISTE (extracción, no reescritura)
// El RCA del incidente vive en el GLUE del cliente: el sync entrante (poll/WS)
// adelantaba la versión/base del contrato pero NUNCA re-aplicaba `usuarios` a
// React → un save posterior de Tareas escribía un `usuarios` viejo (pérdida
// silenciosa de permisos). El fix mueve `usuarios` a su fila dedicada y hace que
// el sync entrante SÍ re-aplique la lista por merge de 3 vías (setUsuarios).
//
// Esa pieza — `aplicarUsuarios` — estaba inline en App.jsx (2384-2389). Se saca
// a esta fábrica para (1) que App.jsx la use tal cual (mismo comportamiento) y
// (2) poder EJERCERLA en un harness headless contra un PostgREST REAL, sin montar
// React. La lógica de merge/OCC sigue en persistContract + permisosUsuariosStore;
// aquí solo vive el cableado poll/WS → store.reconciliar → setUsuarios.
//
// FIDELIDAD: el cuerpo devuelto es idéntico línea-a-línea al de App.jsx
// (App.jsx:2384-2389 antes de la extracción); `getUsuariosActual()` sustituye a
// `usuariosRef.current` y `setAviso` a `setAvisoPersist`.
// ══════════════════════════════════════════════════════════════════════
import { construirAvisoDesde } from "../persistencia/persistContract.js";

// deps: { store, setUsuarios, getUsuariosActual, setAviso? }
//   store            = usuariosStore (crearUsuariosStore(persist,...))
//   setUsuarios      = React setState de la lista de usuarios
//   getUsuariosActual= () => usuariosRef.current  (local sin confirmar, para el merge)
//   setAviso         = setAvisoPersist  (opcional; aviso en pantalla en conflicto)
export function crearAplicadorUsuarios({ store, setUsuarios, getUsuariosActual, setAviso }) {
  return function aplicarUsuarios(lista, version) {
    if (!Array.isArray(lista)) return;
    const dec = store.reconciliar(lista, version === undefined ? null : version, getUsuariosActual());
    if (dec.apply) setUsuarios(dec.value);
    else if (dec.motivo && setAviso) setAviso(construirAvisoDesde("usuarios", dec, "los permisos"));
    return dec;
  };
}

export default crearAplicadorUsuarios;
