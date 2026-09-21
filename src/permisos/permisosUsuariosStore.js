/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════
// permisosUsuariosStore — unidad autoritativa DEDICADA para `usuarios`, que
// EXTIENDE el contrato F0 (persistContract), no lo reemplaza ni lo degrada.
//
// POR QUÉ UNA FILA PROPIA EN 27b423b (justificación específica del baseline,
// distinta a la de a599f47; ver INCIDENT_RCA_27b423b.md §A/§C/§D):
//   1) ACOPLAMIENTO: hoy `usuarios` viaja dentro del blob `main` junto a Tareas
//      (App.jsx:2668/2681). Al sacarlo, un auto-save de Tareas ya NO puede
//      arrastrar un `usuarios` viejo, y editar Tareas deja de colisionar con
//      editar permisos (fin del toast espurio).
//   2) BRECHA DE REHIDRATACIÓN: el sync entrante de `main` adelanta la
//      versión/base del contrato pero NO re-aplica `usuarios` a React
//      (App.jsx:2310-2320/2363-2374) → el OCC de blob se defrauda. Una fila
//      propia con rehidratación por-merge cierra esa brecha.
//   3) GRANULARIDAD: el OCC de blob solo ofrece "conflicto o pisar" a nivel de
//      blob; el `fusionarPorId` genérico de F0 fusiona por ÍTEM (usuario
//      completo). Ninguno da merge por-usuario/por-CAMPO/por-PESTAÑA, que es lo
//      que exige P17 (mismo usuario, campos distintos → ambos sobreviven).
//
// CÓMO EXTIENDE F0: toda la escritura pasa por `persist.saveConfirmed(id, fn)`
// del MISMO objeto `persist` compartido. Se usa la forma FUNCIÓN de computeNext
// (persistContract.js:216, 279-283): ante conflicto, F0 relee la fila fresca y
// re-invoca `fn(fresh)`; ahí corre el merge de 3 vías. Los conflictos reales
// mismo-campo se capturan por clausura y se reportan como {ok:false}; nunca LWW.
// ══════════════════════════════════════════════════════════════════════
import { mergeUsuariosThreeWay, antiLossGuard } from "./permisosCore.js";

const _clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

export const ID_USUARIOS = "usuarios";

// `persist` = la instancia F0 compartida (src/persistencia/instancia.js).
export function crearUsuariosStore(persist, opts = {}) {
  const id = opts.id || ID_USUARIOS;
  const MOTIVOS = persist.MOTIVOS || { CONFLICTO: "conflicto" };
  let baseSesion = [];       // ancestro común de 3 vías (lo último cargado/guardado por MÍ)
  let prevCount = opts.minUsers || 6;

  // Registra en el contrato la lectura inicial (de la fila `usuarios` o del seed
  // migrado desde `main`) y fija el ancestro de sesión. Habilita el guardado
  // (Regla 9: solo tras carga exitosa).
  function registrarCarga(lista, version, encoding) {
    const v = Array.isArray(lista) ? lista : [];
    persist.registrarCarga(id, v, version == null ? null : version, encoding);
    baseSesion = _clone(v);
    prevCount = Math.max(prevCount, v.length);
  }

  function getBaseSesion() { return _clone(baseSesion); }

  // Guardado dirigido con merge de 3 vías, sobre el OCC de F0.
  // Devuelve {ok, value?, fusionado?, motivo?, conflicts?}.
  async function guardar(local) {
    if (!persist.estado(id).cargaOk) return { ok: false, motivo: MOTIVOS.SIN_CARGA || "sin_carga" };
    let conflicts = [];
    let guardBlock = null;
    const fn = (fresh) => {
      const f = Array.isArray(fresh) ? fresh : [];
      const m = mergeUsuariosThreeWay(baseSesion, local, f);
      conflicts = m.conflicts;
      if (m.conflicts.length) return f;            // no cambiar el server; se reporta conflicto
      const g = antiLossGuard(m.merged, prevCount);
      if (!g.ok) { guardBlock = g.reason; return f; } // no reducir usuarios/quedar sin admin
      return m.merged;
    };
    const res = await persist.saveConfirmed(id, fn, {});
    // Coalescencia (req 9): una edición posterior superó a ésta. NO escribió con MI
    // valor, pero tampoco se perdió (el último valor la contiene). No es conflicto ni
    // error, y NO debe tocar el ancestro de sesión (aún no se confirmó nada mío).
    if (res.superseded) return { ok: true, superseded: true, id };
    if (guardBlock) return { ok: false, motivo: "anti_loss", reason: guardBlock, res };
    if (conflicts.length) {
      // F0 pudo haber reescrito el valor del servidor tal cual (no-op) devolviendo
      // ok:true; da igual: hubo conflicto real mismo-campo → NO es un guardado válido.
      return { ok: false, motivo: MOTIVOS.CONFLICTO || "conflicto", conflicts, valorServidor: res.value };
    }
    if (res.ok) {
      // Solo adopto nuevo ancestro si el backend confirmó un valor real (evita clobber
      // a undefined en caminos superseded/sinCambios sin representación).
      if (Array.isArray(res.value)) { baseSesion = _clone(res.value); prevCount = res.value.length; }
      return { ok: true, value: res.value, fusionado: !!res.fusionado, version: res.version, sinCambios: res.sinCambios };
    }
    return { ok: false, motivo: res.motivo, res };
  }

  // Rehidratación entrante (realtime/poll de la fila `usuarios`): fusiona la
  // verdad del servidor con la edición local por-merge (nunca overwrite ciego
  // que revierta lo local, nunca drop silencioso que adelante la versión sin
  // absorber el dato). Devuelve {apply, value, version, conflicts?}.
  function reconciliar(freshList, version, localActual) {
    const f = Array.isArray(freshList) ? freshList : [];
    const dirty = persist.isDirty(id);
    if (!dirty) {
      // Sin edición local sin confirmar: adopto el servidor como verdad y ancestro.
      persist.registrarCarga(id, f, version == null ? null : version);
      baseSesion = _clone(f);
      prevCount = Math.max(prevCount, f.length);
      return { apply: true, value: f, version };
    }
    // Con edición local: merge de 3 vías (base ancestro, local, fresh servidor).
    const m = mergeUsuariosThreeWay(baseSesion, localActual || [], f);
    if (m.conflicts.length === 0) {
      persist.registrarCarga(id, f, version == null ? null : version); // base = servidor
      baseSesion = _clone(f);
      prevCount = Math.max(prevCount, m.merged.length);
      return { apply: true, value: m.merged, version, fusionado: true };
    }
    // Conflicto real: no piso lo local, pero adelanto SOLO la versión conocida
    // para que el próximo guardar detecte y re-merje contra la verdad real.
    persist.marcarSucio(id);
    return { apply: false, dirty: true, motivo: MOTIVOS.CONFLICTO || "conflicto", conflicts: m.conflicts, valorServidor: f, version };
  }

  return { id, registrarCarga, getBaseSesion, guardar, reconciliar,
    _estado: () => ({ baseSesion: _clone(baseSesion), prevCount }) };
}

export default crearUsuariosStore;
