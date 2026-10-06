/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// Manejador de errores de pantalla (hub y módulos).
//
// Antes había uno solo y envolvía el hub: un error dentro de Finanzas,
// Osiris, Frisku, etc. dejaba la página en blanco. Además decía siempre
// "Nueva versión disponible… tu trabajo está guardado", sin comprobarlo.
//
// Ahora:
//   · App.jsx envuelve cada módulo; un error deja la sesión abierta y
//     ofrece volver al inicio, reintentar el módulo o recargar.
//   · El mensaje de guardado sale del contrato de persistencia (`persist`):
//     se espera a que terminen los guardados en curso y se informa qué filas
//     siguen SIN confirmación del servidor. Lo que el contrato no registra
//     (cambios aún no enviados, módulos con persistencia propia) se declara
//     como no comprobable; nunca se afirma que está guardado.
//   · "Nueva versión disponible" solo aparece cuando el error es de carga
//     de archivos tras un deploy (ChunkLoadError).
// ═══════════════════════════════════════════════════════════════════
import React from "react";
import { theme as C } from "./theme";
import { persist } from "./persistencia/instancia.js";

export function esErrorDeVersion(error) {
  const msg = String(error?.message || "");
  return error?.name === "ChunkLoadError" || /Loading (CSS )?chunk/i.test(msg);
}

// Espera los guardados en curso y devuelve las filas que siguen sin confirmar.
export async function comprobarGuardados(p = persist) {
  const ids = typeof p?.idsSucios === "function" ? p.idsSucios() : [];
  if (!ids.length) return { pendientes: [] };
  await Promise.all(ids.map(id => p.flush(id).catch(() => null)));
  return { pendientes: p.idsSucios() };
}

export class ErrorBoundaryModulo extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, guardado: null, verDetalle: false };
    this.volver = this.volver.bind(this);
    this.reintentar = this.reintentar.bind(this);
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary:${this.props.ambito || "app"}]`, error, info?.componentStack);
    this.setState({ guardado: { comprobando: true } });
    comprobarGuardados()
      .then(r => { if (this.state.error) this.setState({ guardado: r }); })
      .catch(() => { if (this.state.error) this.setState({ guardado: { fallo: true } }); });
  }
  componentDidUpdate(prev) {
    // Cambiar de módulo limpia el error (resetKey = módulo activo).
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, guardado: null, verDetalle: false });
    }
  }
  reintentar() { this.setState({ error: null, guardado: null, verDetalle: false }); }
  volver() {
    this.setState({ error: null, guardado: null, verDetalle: false });
    if (this.props.onVolver) this.props.onVolver();
  }

  render() {
    const { error, guardado, verDetalle } = this.state;
    if (!error) return this.props.children;
    const version = esErrorDeVersion(error);
    const ambito = this.props.ambito || "la aplicación";
    const pend = guardado?.pendientes || [];

    const btn = (primario) => ({
      padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
      border: `1px solid ${primario ? C.primary : C.border2}`,
      background: primario ? C.primary : C.card, color: primario ? C.primaryText : C.text,
    });

    let estadoGuardado;
    if (!guardado || guardado.comprobando) {
      estadoGuardado = <p style={{ margin: 0, color: C.muted }}>Comprobando si quedaron guardados sin confirmar…</p>;
    } else if (guardado.fallo) {
      estadoGuardado = <p style={{ margin: 0, color: C.danger }}>No se pudo comprobar el estado de los guardados. No recargues hasta revisar tus últimos cambios.</p>;
    } else if (pend.length) {
      estadoGuardado = (
        <p style={{ margin: 0, color: C.danger }}>
          El servidor no confirmó el guardado de: <strong>{pend.join(", ")}</strong>.
          Si recargas la página, esos cambios se pierden. Vuelve al inicio y entra de nuevo al módulo para revisarlos.
        </p>
      );
    } else {
      estadoGuardado = (
        <p style={{ margin: 0, color: C.muted }}>
          No hay guardados pendientes registrados. Lo que estabas escribiendo y aún no se había enviado
          (por ejemplo, un campo en edición o un guardado automático en espera) puede no haberse guardado.
          Revisa tus últimos cambios al volver.
        </p>
      );
    }

    return (
      <div role="alert" style={{ minHeight: this.props.alto || "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: C.font, padding: 16, boxSizing: "border-box" }}>
        <div style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow, maxWidth: 520, width: "100%", padding: 28, display: "flex", flexDirection: "column", gap: 14, fontSize: 14, lineHeight: 1.55 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {version ? "Hay una versión nueva de la aplicación" : `Ocurrió un error en ${ambito}`}
          </h2>
          <p style={{ margin: 0 }}>
            {version
              ? "Algunos archivos de esta pantalla cambiaron con la última actualización. Recarga la página para cargar la versión nueva."
              : "La pantalla se detuvo para no mostrar información incompleta. Tu sesión sigue abierta."}
          </p>
          {estadoGuardado}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {version ? (
              <button type="button" style={btn(true)} onClick={() => window.location.reload()}>Recargar la página</button>
            ) : (
              <>
                {this.props.onVolver && <button type="button" style={btn(true)} onClick={this.volver}>Volver al inicio</button>}
                <button type="button" style={btn(!this.props.onVolver)} onClick={this.reintentar}>Reintentar</button>
                <button type="button" style={btn(false)} onClick={() => window.location.reload()}>Recargar la página</button>
              </>
            )}
          </div>
          <div>
            <button type="button" onClick={() => this.setState({ verDetalle: !verDetalle })} aria-expanded={verDetalle}
              style={{ background: "none", border: "none", padding: 0, color: C.info, cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>
              {verDetalle ? "Ocultar detalle técnico" : "Ver detalle técnico"}
            </button>
            {verDetalle && (
              <pre style={{ marginTop: 8, padding: 10, background: C.bg2, borderRadius: 6, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 160, overflow: "auto" }}>
                {`${error?.name || "Error"}: ${error?.message || String(error)}`}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundaryModulo;
