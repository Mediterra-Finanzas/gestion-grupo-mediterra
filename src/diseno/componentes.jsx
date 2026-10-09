/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// COMPONENTES COMPARTIDOS (rama de diseño). Delgados a propósito: solo
// presentación y accesibilidad, con las clases de src/diseno/sistema.css.
// No leen ni escriben datos y no deciden permisos: reciben lo que el módulo
// ya calculó (incluido si una acción está permitida).
// ═══════════════════════════════════════════════════════════════════
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

const cx = (...a) => a.filter(Boolean).join(" ");

export function Encabezado({ titulo, sub, acciones, children }) {
  return (
    <header className="mdt-encabezado">
      <div style={{ minWidth: 0 }}>
        <h2 className="mdt-encabezado__titulo">{titulo}</h2>
        {sub && <div className="mdt-encabezado__sub">{sub}</div>}
      </div>
      {acciones && <div className="mdt-acciones">{acciones}</div>}
      {children}
    </header>
  );
}

// items: [{id, label, oculto?}] — los ocultos (sin permiso) no se dibujan.
// Botones con aria-pressed (no role="tab"): sin paneles vinculados, un patrón de
// pestañas a medias confunde más a un lector de pantalla que botones bien marcados.
export function Pestanas({ items, activa, onCambiar, etiqueta = "Secciones", testid }) {
  const visibles = items.filter(i => !i.oculto);
  const refActiva = useRef(null);
  useEffect(() => { refActiva.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [activa]);
  const teclas = (e, idx) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const sig = visibles[(idx + (e.key === "ArrowRight" ? 1 : visibles.length - 1)) % visibles.length];
    onCambiar(sig.id); e.preventDefault();
  };
  return (
    <div className="mdt-pestanas" role="group" aria-label={etiqueta} data-testid={testid}>
      {visibles.map((i, idx) => (
        <button key={i.id} type="button" aria-pressed={activa === i.id}
          ref={activa === i.id ? refActiva : null} onClick={() => onCambiar(i.id)} onKeyDown={e => teclas(e, idx)}
          className="mdt-tab">{i.label}</button>
      ))}
    </div>
  );
}

export function Filtros({ children }) { return <div className="mdt-filtros" role="group" aria-label="Filtros">{children}</div>; }

export function Tabla({ children, alto, etiqueta, testid }) {
  return <div className={cx("mdt-tabla", alto && "mdt-tabla--alto")} role="region" aria-label={etiqueta} tabIndex={0} data-testid={testid}>{children}</div>;
}

export function Campo({ etiqueta, ayuda, error, id, children }) {
  return (
    <div className={cx("mdt-campo", error && "mdt-campo--error")}>
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      {error ? <div className="mdt-error-campo" role="alert">{error}</div> : ayuda ? <div className="mdt-ayuda">{ayuda}</div> : null}
    </div>
  );
}

// tipo: primario | secundario | peligro | ok | fantasma.
export function Boton({ tipo = "secundario", className, ...p }) {
  return <button type="button" {...p} className={cx("mdt-boton", `mdt-boton--${tipo}`, className)}/>;
}

// Modal accesible: Esc cierra, el foco entra al abrir y vuelve al cerrar.
// En teléfono se dibuja como hoja inferior (CSS). Las acciones van en `pie`.
export function Modal({ abierto, titulo, onCerrar, pie, children, testid, ancho = 560 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement;
    const f = ref.current?.querySelector("input,select,textarea,button:not([data-cerrar])");
    (f || ref.current)?.focus?.();
    const tecla = (e) => { if (e.key === "Escape") onCerrar?.(); };
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("keydown", tecla); previo?.focus?.(); };
  }, [abierto]);
  if (!abierto) return null;
  return (
    <div className="mdt-modal-fondo" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar?.(); }}>
      <div className="mdt-modal" role="dialog" aria-modal="true" aria-label={titulo} ref={ref} tabIndex={-1} data-testid={testid} style={{ width: `min(${ancho}px, 100%)` }}>
        <div className="mdt-modal__cabeza">
          <h3 className="mdt-modal__titulo">{titulo}</h3>
          {onCerrar && <button data-cerrar type="button" aria-label="Cerrar" onClick={onCerrar}
            className="mdt-boton mdt-boton--fantasma" style={{ minWidth: "var(--mdt-control)", fontSize: 22 }}>×</button>}
        </div>
        <div className="mdt-modal__cuerpo">{children}</div>
        {pie && <div className="mdt-modal__pie">{pie}</div>}
      </div>
    </div>
  );
}

// tipo: cargando | error | vacio | restringido | aviso. Nunca muestra cifras.
export function EstadoVista({ tipo, children, onReintentar, testid }) {
  const clase = { error: "mdt-estado--error", vacio: "mdt-estado--vacio", restringido: "mdt-estado--restringido", aviso: "mdt-estado--aviso" }[tipo];
  return (
    <div className={cx("mdt-estado", clase)} role={tipo === "error" ? "alert" : "status"} data-testid={testid || `estado-${tipo}`}>
      <div style={{ flex: 1 }}>{children}</div>
      {onReintentar && <Boton tipo="secundario" onClick={onReintentar}>Reintentar</Boton>}
    </div>
  );
}

// ── Etiquetas de gráficos legibles ─────────────────────────────────
// Un SVG con viewBox se dibuja escalado: un font-size de 9 en un viewBox de 900
// mostrado a 360 px se ve de 3,6 px. Este hook mide el ancho real y devuelve el
// tamaño en unidades del viewBox que se ve de `minimoPx` (11 px por omisión).
export function useFuenteGrafico(anchoViewBox, minimoPx = 11, base) {
  const ref = useRef(null);
  const [escala, setEscala] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const medir = () => { const w = el.getBoundingClientRect().width; if (w > 0) setEscala(w / anchoViewBox); };
    medir();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el); window.addEventListener("resize", medir);
    return () => { ro?.disconnect(); window.removeEventListener("resize", medir); };
  }, [anchoViewBox]);
  const tam = fuenteGraficoUnidades(escala, minimoPx, base);
  return [ref, tam, escala];
}
// Puro (probado): unidades de viewBox para que el texto se vea al menos de `minimoPx`,
// sin achicar el tamaño de diseño (`base`) cuando ya se ve más grande.
export function fuenteGraficoUnidades(escala, minimoPx = 11, base = 0) {
  if (!(escala > 0)) return Math.max(base || 0, minimoPx);
  return Math.max(base || 0, minimoPx / escala);
}

// Límite de error por módulo: si un módulo falla al dibujarse, la navegación sigue en
// pie y se muestra el error con salida, en vez de dejar toda la app en blanco. No
// reintenta solo ni guarda nada: el estado del módulo se pierde como antes.
export class LimiteError extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(`[${this.props.nombre || "módulo"}] error al dibujar:`, error, info?.componentStack); }
  componentDidUpdate(prev) { if (prev.clave !== this.props.clave && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24 }}>
        <EstadoVista tipo="error" testid="modulo-error">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No se pudo mostrar {this.props.nombre || "este módulo"}.</div>
          <div>Lo guardado antes del error sigue en el servidor; lo que estaba sin guardar en esta pantalla puede no haberse registrado. Revisa lo último que ingresaste antes de continuar. Si se repite, avisa con la hora.</div>
          <div className="mdt-acciones" style={{ marginTop: 12 }}>
            {this.props.onSalir && <Boton tipo="secundario" onClick={this.props.onSalir}>Volver al inicio</Boton>}
            <Boton tipo="fantasma" onClick={() => window.location.reload()}>Recargar</Boton>
          </div>
        </EstadoVista>
      </div>
    );
  }
}
