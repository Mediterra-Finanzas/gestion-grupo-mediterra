/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// NAVEGACIÓN «A + bandeja en teléfono»
//   expandida (≥1024): barra lateral fija con módulos y herramientas.
//   media (600–1023): riel de íconos con rótulo + panel «Más».
//   compacta (<600):  barra inferior Inicio · Pendientes · Rendir · Más.
// Solo muestra destinos que el perfil puede abrir: la lista de módulos y la
// acción «Rendir» llegan ya filtradas por permisos efectivos desde App.
// El contenido va PRIMERO en el documento y la barra se dibuja a la izquierda con
// `order`: teclado y lector de pantalla llegan primero al trabajo, y un botón del
// contenido (p. ej. la empresa «Allegria Foods» en Finanzas) no queda detrás de un
// módulo homónimo de la barra.
// ═══════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";
import { FUENTE, TXT, ESP, COL, ANCHO_LATERAL, ANCHO_RIEL, ALTO_BARRA_INF, TACTIL } from "./tokens";

// Prioridad de dibujo de la barra inferior: sobre los encabezados fijos de las tablas
// (los módulos usan hasta 10) y BAJO cualquier modal o panel de los módulos (el más bajo
// usa 199: EEFF; varios de Tareas y Osiris usan 300). Con 300 la barra tapaba los botones
// inferiores de esos modales en el teléfono (scripts/e2e/modulos-movil.mjs).
export const Z_BARRA_INF = 100;

const CORTO = { tareas: "Tareas", osiris: "Osiris", finanzas: "Finanzas", allegria: "Allegria",
  frisku: "Frisku", contabilidad: "Contab.", allegria_service: "A. Service" };

function Icono({ tipo, tam = 22 }) {
  const p = { width: tam, height: tam, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (tipo === "inicio") return <svg {...p}><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>;
  if (tipo === "pendientes") return <svg {...p}><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>;
  if (tipo === "rendir") return <svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>;
  if (tipo === "mas") return <svg {...p}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>;
  if (tipo === "nueva") return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
  return null;
}

function Distintivo({ n }) {
  if (n == null || n === 0) return null;
  return <span data-testid="nav-distintivo" style={{ minWidth: 20, height: 20, borderRadius: 10, background: COL.peligro, color: "#fff",
    fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{n > 99 ? "99+" : n}</span>;
}

function IconoModulo({ m, tam = 20 }) {
  return <span aria-hidden style={{ fontSize: tam, lineHeight: 1, width: tam + 4, textAlign: "center", display: "inline-block" }}>{m.icon}</span>;
}

// Panel inferior (teléfono) o lateral (tablet) con módulos y herramientas.
function PanelMas({ abierto, onCerrar, modulos, activo, onIr, herramientas, usuario, desde = "abajo" }) {
  useEffect(() => {
    if (!abierto) return;
    const f = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  const caja = desde === "abajo"
    ? { left: 0, right: 0, bottom: 0, maxHeight: "82vh", borderRadius: "16px 16px 0 0", paddingBottom: `calc(${ESP.l}px + env(safe-area-inset-bottom))` }
    : { left: ANCHO_RIEL, top: 0, bottom: 0, width: 320, borderRadius: 0 };
  return (
    <div data-testid="panel-mas" style={{ position: "fixed", inset: 0, zIndex: 400, fontFamily: FUENTE }}>
      <div onClick={onCerrar} style={{ position: "absolute", inset: 0, background: "rgba(16,24,40,0.45)" }}/>
      <div role="dialog" aria-label="Más opciones" style={{ position: "absolute", background: COL.superficie, overflowY: "auto", padding: ESP.l, boxShadow: "0 -8px 32px rgba(0,0,0,0.2)", ...caja }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ESP.m }}>
          <div>
            <div style={{ fontSize: TXT.destacado, fontWeight: 700, color: COL.texto }}>{usuario?.nombre}</div>
            {usuario?.cargo && <div style={{ fontSize: TXT.chico, color: COL.texto2 }}>{usuario.cargo}</div>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ minWidth: TACTIL, minHeight: TACTIL, border: "none", background: "none", fontSize: 24, color: COL.texto2, cursor: "pointer" }}>×</button>
        </div>
        {modulos.length > 0 && <div style={{ fontSize: TXT.rotulo, fontWeight: 700, color: COL.texto2, textTransform: "uppercase", letterSpacing: 1, margin: `${ESP.s}px 0` }}>Módulos</div>}
        {modulos.map(m => (
          <button key={m.id} data-testid={`mas-modulo-${m.id}`} onClick={() => { onCerrar(); onIr(m.id); }}
            style={{ width: "100%", minHeight: TACTIL + 4, display: "flex", alignItems: "center", gap: ESP.m, padding: `0 ${ESP.s}px`, border: "none",
              borderRadius: 10, background: activo === m.id ? COL.infoFondo : "transparent", color: COL.texto, fontSize: TXT.cuerpo, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            <IconoModulo m={m}/> <span>{m.label}</span>
          </button>
        ))}
        <div style={{ borderTop: `1px solid ${COL.borde}`, margin: `${ESP.m}px 0` }}/>
        {herramientas.map(h => (
          <button key={h.id} data-testid={`herramienta-${h.id}`} onClick={() => { onCerrar(); h.onClick(); }}
            style={{ width: "100%", minHeight: TACTIL, display: "flex", alignItems: "center", padding: `0 ${ESP.s}px`, border: "none", borderRadius: 10,
              background: "transparent", color: h.tono === "peligro" ? COL.peligro : COL.texto, fontSize: TXT.cuerpo, cursor: "pointer", textAlign: "left" }}>
            {h.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemLateral({ activo, onClick, children, testid, badge }) {
  return (
    <button data-testid={testid} onClick={onClick} aria-current={activo ? "page" : undefined}
      style={{ width: "100%", minHeight: 40, display: "flex", alignItems: "center", gap: ESP.m, padding: `0 ${ESP.m}px`, border: "none", borderRadius: 8,
        background: activo ? COL.lateralActivo : "transparent", color: activo ? "#fff" : COL.lateralTexto, fontSize: TXT.cuerpo - 1,
        fontWeight: activo ? 700 : 500, cursor: "pointer", textAlign: "left", fontFamily: FUENTE }}>
      {children}
      {badge != null && <span style={{ marginLeft: "auto" }}><Distintivo n={badge}/></span>}
    </button>
  );
}

export default function Navegacion({ clase, usuario, modulos, activo, onIr, puedeRendir, mostrarPendientes, badgePendientes, herramientas, children }) {
  const [mas, setMas] = useState(false);
  // Altura que ocupa la barra inferior, para que los avisos fijos de los módulos
  // («Guardado», «NO se guardó», etc.) se dibujen sobre ella y no detrás ni encima.
  // Los módulos la usan como bottom: calc(16px + var(--mdt-barra-inf, 0px)).
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--mdt-barra-inf", clase === "compacta" ? `calc(${ALTO_BARRA_INF}px + env(safe-area-inset-bottom, 0px))` : "0px");
    // DD11: con barra inferior, los botones «← Mediterra / Volver» y «Salir» de los
    // encabezados de los módulos repiten Inicio y Más → Salir; el CSS los esconde.
    raiz.setAttribute("data-nav", clase);
    return () => { raiz.style.removeProperty("--mdt-barra-inf"); raiz.removeAttribute("data-nav"); };
  }, [clase]);

  if (clase === "expandida") {
    return (
      <div style={{ display: "flex", minHeight: "100vh", fontFamily: FUENTE }}>
        <main style={{ flex: 1, minWidth: 0, order: 1 }}>{children}</main>
        <aside data-testid="nav-lateral" style={{ order: 0, width: ANCHO_LATERAL, flexShrink: 0, background: COL.lateral, color: COL.lateralTexto,
          position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", padding: `${ESP.l}px ${ESP.m}px`, boxSizing: "border-box" }}>
          <button onClick={() => onIr("inicio")} style={{ display: "flex", alignItems: "center", gap: ESP.s, background: "none", border: "none", cursor: "pointer", padding: `0 ${ESP.xs}px ${ESP.l}px`, color: "#fff", textAlign: "left" }}>
            <img src="/med.png" alt="" style={{ width: 34, height: 34, objectFit: "contain", background: "#fff", borderRadius: 8, padding: 2 }} onError={e => { e.target.style.display = "none"; }}/>
            <span style={{ lineHeight: 1.15 }}>
              <span style={{ display: "block", fontSize: TXT.rotulo, letterSpacing: 2, color: COL.lateralTenue, fontWeight: 700 }}>MEDITERRA</span>
              <span style={{ display: "block", fontSize: TXT.cuerpo, fontWeight: 700 }}>Gestión del grupo</span>
            </span>
          </button>
          {puedeRendir && (
            <button data-testid="nav-nueva-rendicion" onClick={() => onIr("nueva")}
              style={{ minHeight: TACTIL, display: "flex", alignItems: "center", justifyContent: "center", gap: ESP.s, borderRadius: 10, border: "none",
                background: "#fff", color: COL.marca, fontSize: TXT.cuerpo, fontWeight: 700, cursor: "pointer", marginBottom: ESP.l, fontFamily: FUENTE }}>
              <Icono tipo="nueva" tam={18}/> Nueva rendición
            </button>
          )}
          <nav aria-label="Principal" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", flex: 1 }}>
            <ItemLateral testid="nav-inicio" activo={activo === "inicio"} onClick={() => onIr("inicio")} badge={mostrarPendientes ? badgePendientes : null}>
              <Icono tipo="inicio" tam={20}/> Inicio
            </ItemLateral>
            {puedeRendir && (
              <ItemLateral testid="nav-rendir" activo={activo === "rendir"} onClick={() => onIr("rendir")}>
                <Icono tipo="rendir" tam={20}/> Mis rendiciones
              </ItemLateral>
            )}
            {modulos.length > 0 && <div style={{ fontSize: TXT.rotulo, fontWeight: 700, color: COL.lateralTenue, textTransform: "uppercase", letterSpacing: 1, margin: `${ESP.l}px ${ESP.m}px ${ESP.xs}px` }}>Módulos</div>}
            {modulos.map(m => (
              <ItemLateral key={m.id} testid={`nav-modulo-${m.id}`} activo={activo === m.id} onClick={() => onIr(m.id)}>
                <IconoModulo m={m} tam={18}/> {m.label}
              </ItemLateral>
            ))}
          </nav>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.14)", paddingTop: ESP.m, marginTop: ESP.s }}>
            <div style={{ padding: `0 ${ESP.m}px ${ESP.s}px` }}>
              <div style={{ fontSize: TXT.chico + 1, fontWeight: 700, color: "#fff" }}>{usuario?.nombre}</div>
              {usuario?.cargo && <div style={{ fontSize: TXT.rotulo, color: COL.lateralTenue }}>{usuario.cargo}</div>}
            </div>
            {herramientas.map(h => (
              <ItemLateral key={h.id} testid={`herramienta-${h.id}`} onClick={h.onClick}>
                <span style={{ fontSize: TXT.chico + 1, color: h.tono === "peligro" ? "#fca5a5" : undefined }}>{h.label}</span>
              </ItemLateral>
            ))}
          </div>
        </aside>
      </div>
    );
  }

  if (clase === "media") {
    const BotonRiel = ({ id, label, icono, testid, badge }) => (
      <button data-testid={testid} onClick={() => id === "mas" ? setMas(true) : onIr(id)} aria-current={activo === id ? "page" : undefined}
        style={{ width: "100%", minHeight: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
          border: "none", borderRadius: 12, background: activo === id ? COL.lateralActivo : "transparent", color: activo === id ? "#fff" : COL.lateralTexto,
          cursor: "pointer", fontSize: TXT.rotulo, fontWeight: activo === id ? 700 : 500, position: "relative", fontFamily: FUENTE, padding: "6px 2px" }}>
        {icono}
        <span style={{ maxWidth: ANCHO_RIEL - 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {badge != null && badge > 0 && <span style={{ position: "absolute", top: 4, right: 12 }}><Distintivo n={badge}/></span>}
      </button>
    );
    return (
      <div style={{ display: "flex", minHeight: "100vh", fontFamily: FUENTE }}>
        <main style={{ flex: 1, minWidth: 0, order: 1 }}>{children}</main>
        <nav data-testid="nav-riel" aria-label="Principal" style={{ order: 0, width: ANCHO_RIEL, flexShrink: 0, background: COL.lateral, position: "sticky", top: 0, height: "100vh",
          display: "flex", flexDirection: "column", gap: 4, padding: `${ESP.m}px ${ESP.xs + 2}px`, boxSizing: "border-box", overflowY: "auto" }}>
          <BotonRiel id="inicio" testid="nav-inicio" label="Inicio" icono={<Icono tipo="inicio"/>} badge={mostrarPendientes ? badgePendientes : null}/>
          {puedeRendir && <BotonRiel id="rendir" testid="nav-rendir" label="Rendir" icono={<Icono tipo="rendir"/>}/>}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.14)", margin: `${ESP.xs}px ${ESP.s}px` }}/>
          {modulos.map(m => <BotonRiel key={m.id} id={m.id} testid={`nav-modulo-${m.id}`} label={CORTO[m.id] || m.label} icono={<IconoModulo m={m}/>}/>)}
          <div style={{ marginTop: "auto" }}/>
          <BotonRiel id="mas" testid="nav-mas" label="Más" icono={<Icono tipo="mas"/>}/>
        </nav>
        <PanelMas abierto={mas} onCerrar={() => setMas(false)} modulos={[]} activo={activo} onIr={onIr} herramientas={herramientas} usuario={usuario} desde="lado"/>
      </div>
    );
  }

  // compacta (teléfono)
  const BotonInf = ({ id, label, icono, testid, badge }) => (
    <button data-testid={testid} onClick={() => id === "mas" ? setMas(true) : onIr(id)} aria-current={activo === id ? "page" : undefined}
      style={{ flex: 1, minHeight: ALTO_BARRA_INF - 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
        border: "none", background: "none", color: activo === id ? COL.marca : COL.texto2, fontSize: TXT.rotulo, fontWeight: activo === id ? 700 : 500,
        cursor: "pointer", position: "relative", fontFamily: FUENTE }}>
      {icono}
      <span>{label}</span>
      {badge != null && badge > 0 && <span style={{ position: "absolute", top: 2, left: "calc(50% + 6px)" }}><Distintivo n={badge}/></span>}
    </button>
  );
  return (
    <div style={{ minHeight: "100vh", fontFamily: FUENTE, paddingBottom: `calc(${ALTO_BARRA_INF}px + env(safe-area-inset-bottom))` }}>
      <main>{children}</main>
      <nav data-testid="nav-inferior" aria-label="Principal" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: Z_BARRA_INF, background: COL.superficie,
        borderTop: `1px solid ${COL.borde}`, display: "flex", height: ALTO_BARRA_INF, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -2px 10px rgba(16,24,40,0.06)" }}>
        <BotonInf id="inicio" testid="nav-inicio" label="Inicio" icono={<Icono tipo="inicio"/>}/>
        {mostrarPendientes && <BotonInf id="pendientes" testid="nav-pendientes" label="Pendientes" icono={<Icono tipo="pendientes"/>} badge={badgePendientes}/>}
        {puedeRendir && <BotonInf id="rendir" testid="nav-rendir" label="Rendir" icono={<Icono tipo="rendir"/>}/>}
        <BotonInf id="mas" testid="nav-mas" label="Más" icono={<Icono tipo="mas"/>}/>
      </nav>
      <PanelMas abierto={mas} onCerrar={() => setMas(false)} modulos={modulos} activo={activo} onIr={onIr} herramientas={herramientas} usuario={usuario}/>
    </div>
  );
}
