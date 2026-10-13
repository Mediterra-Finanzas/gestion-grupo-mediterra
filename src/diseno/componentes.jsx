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

// ── Encabezado de módulo con contexto ──────────────────────────────
// Mismo lugar y misma forma en todos los módulos: ruta, título, logo de la
// empresa o del grupo (sin deformar: alto fijo, ancho automático), contexto
// (empresa, moneda, período) y, a la derecha, el estado de guardado y las
// acciones. `contexto`: [{ rotulo, valor }]. Los botones que repiten la
// navegación llevan la clase mdt-dup-nav (en teléfono los oculta la barra).
export function EncabezadoModulo({ ruta, titulo, logo, logoAlt = "", contexto = [], estado, acciones, testid, oscuro = false }) {
  return (
    <header className={cx("mdt-cabmod", oscuro && "mdt-cabmod--oscuro")} data-testid={testid || "encabezado-modulo"}>
      <div className="mdt-cabmod__id">
        {logo && <img className="mdt-cabmod__logo" src={logo} alt={logoAlt} onError={e => { e.currentTarget.style.display = "none"; }}/>}
        <div style={{ minWidth: 0 }}>
          {ruta && <div className="mdt-cabmod__ruta">{ruta}</div>}
          <h1 className="mdt-cabmod__titulo">{titulo}</h1>
        </div>
      </div>
      {contexto.length > 0 && (
        <dl className="mdt-cabmod__contexto">
          {contexto.filter(c => c && c.valor).map(c => (
            <div key={c.rotulo} className="mdt-cabmod__dato"><dt>{c.rotulo}</dt><dd>{c.valor}</dd></div>
          ))}
        </dl>
      )}
      {(estado || acciones) && <div className="mdt-cabmod__acciones">{estado}{acciones}</div>}
    </header>
  );
}

// ── «Más»: acciones secundarias en un panel desplegable ────────────
// Botón con aria-expanded / aria-controls; al abrir, el foco va al primer
// control del panel; Escape o un clic fuera lo cierran y devuelven el foco al
// botón. Elegir una acción (un <button> del panel) también lo cierra: la acción
// sigue siendo la misma, con sus propias confirmaciones. No decide permisos: el
// módulo solo pone dentro lo que la persona puede hacer.
export function MenuMas({ rotulo = "Más", etiqueta = "Más acciones", testid, children }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef(null), boton = useRef(null), panel = useRef(null);
  const idPanel = useRef(`mdt-mas-${Math.random().toString(36).slice(2, 8)}`).current;
  const cerrar = (devolverFoco = true) => { setAbierto(false); if (devolverFoco) boton.current?.focus(); };
  useEffect(() => {
    if (!abierto) return;
    panel.current?.querySelector("button, select, [tabindex]")?.focus();
    const tecla = (e) => { if (e.key === "Escape") { e.preventDefault(); cerrar(); } };
    const fuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) cerrar(false); };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    return () => { document.removeEventListener("keydown", tecla); document.removeEventListener("pointerdown", fuera); };
  }, [abierto]);
  return (
    <div className="mdt-mas" ref={raiz}>
      <button type="button" ref={boton} className="mdt-boton mdt-boton--secundario" aria-haspopup="true" aria-expanded={abierto}
        aria-controls={idPanel} aria-label={etiqueta} data-testid={testid ? `${testid}-boton` : undefined} onClick={() => setAbierto(a => !a)}>
        {rotulo} <span aria-hidden>{abierto ? "▴" : "▾"}</span>
      </button>
      {abierto && (
        <div id={idPanel} ref={panel} className="mdt-mas__panel" role="group" aria-label={etiqueta} data-testid={testid}
          onClick={(e) => { if (e.target.closest("button")) cerrar(false); }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Circuito de aprobación ──────────────────────────────────────────
// pasos: ver src/diseno/circuito.js. Horizontal en pantallas anchas, vertical
// en teléfono. El paso en curso se anuncia (aria-current="step").
export function Circuito({ pasos, titulo = "Circuito de aprobación", testid }) {
  if (!pasos || !pasos.length) return null;
  const icono = { hecho: "✓", actual: "●", devuelto: "↩", pendiente: "" };
  return (
    <section className="mdt-circuito" aria-label={titulo} data-testid={testid || "circuito"}>
      <div className="mdt-circuito__titulo">{titulo}</div>
      <ol className="mdt-circuito__pasos">
        {pasos.map((p, i) => (
          <li key={p.id} className={cx("mdt-circuito__paso", `mdt-circuito__paso--${p.devolucion ? "devuelto" : p.estado}`)}
            aria-current={p.estado === "actual" ? "step" : undefined} data-estado={p.estado}>
            <span className="mdt-circuito__marca" aria-hidden>{icono[p.devolucion ? "devuelto" : p.estado] || i + 1}</span>
            <span className="mdt-circuito__texto">
              <span className="mdt-circuito__rotulo">{p.rotulo}</span>
              {(p.quien || p.cuando) && <span className="mdt-circuito__quien">{[p.quien, p.cuando].filter(Boolean).join(" · ")}</span>}
              {p.nota && <span className="mdt-circuito__nota">{p.nota}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
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

// ── Accesos de un hub ──────────────────────────────────────────────
// Grilla compacta (computador y tablet) o lista táctil (teléfono), con las clases
// mdt-accesos / mdt-acceso de sistema.css. Cada tarjeta es un <button>: el acceso
// completo. `items`: [{ id, titulo, descripcion, icono, contadores:[{texto, tono}],
// onAbrir, deshabilitado, motivo }]. No decide permisos ni cuenta nada: muestra lo que
// el módulo le pasa. Si `onOrdenar` existe, ofrece «Ordenar accesos» con ↑ ↓ (sin arrastre).
const ICONOS_ACCESO = {
  dinero: <><circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3 6 1.6 6 4.6 0 1.3-1.3 2.4-3 2.4s-3-1.1-3-2.5M12 5.5v1.5M12 17v1.5"/></>,
  contrato: <><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></>,
  genetica: <><path d="M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/><path d="M9 6h6M9 18h6"/></>,
  brote: <><path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/></>,
  inspeccion: <><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></>,
  grafico: <><path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/></>,
  tareas: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></>,
};
export function IconoAcceso({ tipo, tam = 20 }) {
  return <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONOS_ACCESO[tipo] || <rect x="4" y="4" width="16" height="16" rx="3"/>}</svg>;
}
export function Accesos({ items, titulo = "Accesos", onOrdenar, testid = "accesos" }) {
  const [ordenando, setOrdenando] = useState(false);
  const mover = (i, d) => {
    const j = i + d; if (j < 0 || j >= items.length || !onOrdenar) return;
    const ids = items.map(x => x.id); [ids[i], ids[j]] = [ids[j], ids[i]]; onOrdenar(ids);
  };
  return (
    <section aria-label={titulo} data-testid={testid}>
      <div className="mdt-accesos-cab">
        <h2 className="mdt-accesos-cab__titulo">{titulo}</h2>
        {onOrdenar && <button type="button" className="mdt-boton mdt-boton--secundario mdt-boton--chico" aria-pressed={ordenando}
          data-testid={`${testid}-ordenar`} onClick={() => setOrdenando(!ordenando)}>{ordenando ? "Listo" : "Ordenar accesos"}</button>}
      </div>
      <ul className="mdt-accesos">
        {items.map((it, i) => (
          <li key={it.id}>
            <button type="button" className="mdt-acceso" data-testid={`${testid}-${it.id}`} aria-disabled={it.deshabilitado ? "true" : undefined}
              title={it.deshabilitado ? it.motivo : undefined} onClick={() => { if (!it.deshabilitado && !ordenando) it.onAbrir(); }}>
              <span className="mdt-acceso__icono"><IconoAcceso tipo={it.icono}/></span>
              <span className="mdt-acceso__texto">
                <span className="mdt-acceso__titulo">{it.titulo}</span>
                {it.descripcion && <span className="mdt-acceso__desc" title={it.descripcion}>{it.descripcion}</span>}
                {(it.contadores?.length > 0 || it.deshabilitado) && <span className="mdt-acceso__meta">
                  {it.deshabilitado && <span className="mdt-contador">{it.motivo || "Sin acceso"}</span>}
                  {(it.contadores || []).map((c, k) => <span key={k} className={cx("mdt-contador", c.tono && `mdt-contador--${c.tono}`)}>{c.texto}</span>)}
                </span>}
              </span>
              <span className="mdt-acceso__ir" aria-hidden="true">›</span>
            </button>
            {ordenando && <span className="mdt-acceso__orden">
              <button type="button" className="mdt-boton mdt-boton--secundario mdt-boton--chico" aria-label={`Subir ${it.titulo}`} disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
              <button type="button" className="mdt-boton mdt-boton--secundario mdt-boton--chico" aria-label={`Bajar ${it.titulo}`} disabled={i === items.length - 1} onClick={() => mover(i, 1)}>↓</button>
            </span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
