/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════════════
// conflictoFila.js — cableado de las DOS salidas del conflicto pendiente para
// una fila cualquiera (`main`, `pins`, `allegria`, …).
//
// POR QUÉ EXISTE
// El contrato (persistContract.js) ya hace lo correcto: ante un conflicto de
// fila-blob la fila queda en CONFLICTO PENDIENTE, no se escribe nada y los
// cambios locales se conservan. Pero las dos únicas salidas —
// `recuperarDelServidor(id)` y `reconciliarConservandoLocal(id)` — las tiene que
// invocar el caller a pedido de la persona, y hasta oct-2026 solo estaban
// conectadas en FinanzasModule. En `App.jsx` (fila `main`, Tareas) y en
// `AllegriaModule.jsx` (fila `allegria`) el aviso llegaba y nada se pisaba, pero
// la fila quedaba BLOQUEADA para escritura hasta recargar la página, y recargar
// es justo lo que pierde el trabajo local.
//
// EXTRACCIÓN, NO REESCRITURA (mismo criterio que permisos/usuariosGlue.js)
// Acá vive SOLO el cableado pantalla↔contrato: detectar que la fila quedó
// bloqueada, ofrecer las dos salidas y aplicar/reintentar. La política de
// concurrencia (OCC, conflicto pendiente, confirmación por el servidor) sigue
// entera en persistContract.js, y el aplicador de pantalla sigue siendo el del
// módulo (`aplicarCamposMain` en App.jsx, `setData` en AllegriaModule). Vive
// fuera de los componentes para poder ejercerlo con `fetch` inyectado, sin
// montar React.
//
// INVARIANTES QUE ESTE MÓDULO NO PUEDE ROMPER
//   · ningún auto-save resuelve un conflicto: las dos salidas se llaman a mano;
//   · nada local se descarta sin que la persona elija;
//   · si la salida falla (red/HTTP), el conflicto SIGUE puesto y se avisa;
//   · "guardado" solo cuando el servidor confirmó (lo garantiza el contrato).
// ══════════════════════════════════════════════════════════════════════════════
import { construirAvisoDesde, MOTIVOS } from "./persistContract.js";

// ¿Este resultado dice que la fila quedó bloqueada esperando una decisión?
// Cubre las dos formas en que el contrato lo informa:
//   · saveConfirmed:      {ok:false, motivo:CONFLICTO|CONFLICTO_ITEM, conflictoPendiente:true}
//                         y, en los intentos siguientes, {motivo:CONFLICTO_PENDIENTE}
//   · reconcileIncoming:  {apply:false, dirty:true, motivo:CONFLICTO, conflictoPendiente:true}
export function esConflictoPendiente(resultado) {
  const r = resultado || {};
  if (r.ok === true || r.apply === true) return false;
  return !!r.conflictoPendiente || r.motivo === MOTIVOS.CONFLICTO_PENDIENTE;
}

// deps:
//   persist        instancia del contrato (inyectable en tests)
//   rowId          id de la fila en `calendario_data` ("main" / "allegria" / "pins")
//   etiqueta       cómo se llama la fila en pantalla ("las Tareas", "Allegria Foods")
//   aplicarValor   (value) => void   · el aplicador DEL MÓDULO, no uno nuevo
//   guardarLocal   () => Promise<res>· el guardado DEL MÓDULO, tal cual
//   setConflicto   (info|null) => void · pinta/retira el panel de decisión
//   setEstado      (clave) => void   · vocabulario de estado del módulo (opcional)
//   setAviso       (aviso|null) => void · AvisoPersistencia (opcional)
export function crearResolucionConflicto(deps) {
  const {
    persist, rowId, etiqueta,
    aplicarValor, guardarLocal,
    setConflicto, setEstado, setAviso,
  } = deps || {};
  if (!persist || !rowId) throw new Error("crearResolucionConflicto: faltan persist/rowId");

  const est = (v) => { if (setEstado) setEstado(v); };
  const marcar = (info) => { if (setConflicto) setConflicto(info); };
  const avisar = (res) => { if (setAviso) setAviso(construirAvisoDesde(rowId, res, etiqueta)); };
  const limpiarAviso = () => { if (setAviso) setAviso(null); };

  const pendiente = () => (persist.conflictoPendiente ? persist.conflictoPendiente(rowId) : null);

  function infoActual(resultado) {
    const c = pendiente() || null;
    const r = resultado || {};
    return {
      rowId, etiqueta,
      version: r.version !== undefined ? r.version : (c ? c.version : null),
      versionLocal: r.versionLocal,
      valorServidor: r.valorServidor !== undefined ? r.valorServidor : (c ? c.valorServidor : undefined),
      motivoOrigen: r.motivoOrigen || (c && c.motivoOrigen) || r.motivo || MOTIVOS.CONFLICTO,
      ts: (c && c.ts) || Date.now(),
    };
  }

  // Se llama con el resultado de CUALQUIER ruta de guardado o de reconcileIncoming.
  // Devuelve true solo si la fila quedó bloqueada: entonces pinta el panel con las
  // dos salidas y deja el estado visible en "conflicto". No escribe nada.
  function detectar(resultado) {
    if (!esConflictoPendiente(resultado) && !pendiente()) return false;
    if (resultado && (resultado.ok === true || resultado.apply === true)) return false;
    marcar(infoActual(resultado));
    est("conflicto");
    // El texto de MOTIVOS.CONFLICTO (primer choque) dice "recarga la página", y
    // recargar acá PERDERÍA lo local. El estado real de la fila es "bloqueada
    // esperando decisión", así que el aviso se construye con ese motivo: su texto
    // es el que explica las dos salidas que el panel ofrece.
    avisar({ ...(resultado || {}), ok: false, motivo: MOTIVOS.CONFLICTO_PENDIENTE });
    return true;
  }

  // (a) RECUPERAR LA VERSIÓN DEL SERVIDOR — descarta lo local.
  // Si falla (red/HTTP), el contrato NO limpia el conflicto: el panel sigue puesto
  // y la fila sigue sin escribirse.
  async function recuperarDelServidor() {
    est("guardando");
    const r = await persist.recuperarDelServidor(rowId);
    if (!r || r.ok === false) {
      est("error");
      avisar(r || { ok: false, motivo: MOTIVOS.RED });
      marcar(infoActual(null)); // sigue bloqueada: el panel no se retira
      return r;
    }
    if (aplicarValor) aplicarValor(r.value === undefined ? null : r.value);
    marcar(null);
    limpiarAviso();
    est("ok");
    return r;
  }

  // (b) CONSERVAR LO LOCAL — reemplaza lo del servidor.
  // Primero se desbloquea contra la versión VIGENTE (relectura) y después el
  // módulo guarda su estado local como siempre. Si el servidor se movió otra vez
  // en el medio, el guardado vuelve a quedar en conflicto pendiente (se vuelve a
  // pintar el panel) en vez de pisar.
  async function conservarLocal() {
    est("guardando");
    const d = await persist.reconciliarConservandoLocal(rowId);
    if (!d || d.ok === false) {
      est("error");
      avisar(d || { ok: false, motivo: MOTIVOS.RED });
      marcar(infoActual(null));
      return d;
    }
    marcar(null);
    limpiarAviso();
    if (!guardarLocal) { est("ok"); return d; }
    const r = await guardarLocal();
    if (r && r.ok === false) {
      if (!detectar(r)) { est("error"); avisar(r); }
      return r;
    }
    est("ok");
    return r;
  }

  return { rowId, etiqueta, detectar, recuperarDelServidor, conservarLocal,
    hayConflicto: () => !!pendiente() };
}

export default crearResolucionConflicto;
