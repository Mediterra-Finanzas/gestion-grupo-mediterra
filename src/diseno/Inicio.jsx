/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// INICIO — pendientes y acciones primero; módulos después.
// Cada contador viene de resumenInicio.js. Si la fuente no se pudo leer,
// se dice «no disponible» con un botón para reintentar: nunca un cero.
// ═══════════════════════════════════════════════════════════════════
import React from "react";
import { FUENTE, TXT, ESP, COL, SOMBRA, TACTIL } from "./tokens";

const tarjeta = { background: COL.superficie, border: `1px solid ${COL.borde}`, borderRadius: 14, boxShadow: SOMBRA };

function Rotulo({ children, style }) {
  return <div style={{ fontSize: TXT.rotulo, fontWeight: 700, color: COL.texto2, textTransform: "uppercase", letterSpacing: 1, ...style }}>{children}</div>;
}

function SinDatos({ estado, onReintentar, que }) {
  if (estado === "cargando") return <div data-testid={`cargando-${que}`} style={{ fontSize: TXT.chico, color: COL.texto2, padding: `${ESP.s}px 0` }}>Leyendo {que}…</div>;
  return (
    <div data-testid={`error-${que}`} style={{ fontSize: TXT.chico, color: COL.aviso, padding: `${ESP.s}px 0`, display: "flex", gap: ESP.s, alignItems: "center", flexWrap: "wrap" }}>
      <span>No se pudo leer {que}; los contadores no están disponibles.</span>
      {onReintentar && <button data-testid={`reintentar-${que}`} onClick={onReintentar} style={{ minHeight: 36, padding: `0 ${ESP.m}px`, borderRadius: 8, border: `1px solid ${COL.borde}`, background: COL.superficie, color: COL.texto, fontSize: TXT.chico, fontWeight: 600, cursor: "pointer" }}>Reintentar</button>}
    </div>
  );
}

function Cifra({ valor, label, tono, onClick, testid }) {
  const color = valor > 0 ? (tono === "peligro" ? COL.peligro : tono === "aviso" ? COL.aviso : COL.marca) : COL.texto2;
  return (
    <button data-testid={testid} onClick={onClick}
      style={{ flex: "1 1 0", minWidth: 92, minHeight: TACTIL + 20, textAlign: "left", border: `1px solid ${COL.borde}`, borderRadius: 10, background: COL.fondo,
        padding: `${ESP.s}px ${ESP.m}px`, cursor: onClick ? "pointer" : "default", fontFamily: FUENTE }}>
      <div style={{ fontSize: TXT.cifra - 4, fontWeight: 800, color, lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: TXT.chico, color: COL.texto2, marginTop: 2 }}>{label}</div>
    </button>
  );
}

function ListaTareas({ titulo, items, max = 5, tono }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: ESP.m }}>
      <div style={{ fontSize: TXT.chico, fontWeight: 700, color: tono || COL.texto, marginBottom: ESP.xs }}>{titulo}</div>
      {items.slice(0, max).map((i, k) => (
        <div key={k} style={{ fontSize: TXT.chico + 1, color: COL.texto, padding: "5px 0", borderTop: k ? `1px solid ${COL.borde}` : "none", display: "flex", justifyContent: "space-between", gap: ESP.s }}>
          <span>{i.nombre}</span>{i.detalle && <span style={{ color: COL.texto2, whiteSpace: "nowrap" }}>{i.detalle}</span>}
        </div>
      ))}
      {items.length > max && <div style={{ fontSize: TXT.chico, color: COL.texto2, paddingTop: 4 }}>y {items.length - max} más</div>}
    </div>
  );
}

function TarjetaTareas({ tareas, onAbrir, detalle, compacta }) {
  return (
    <section data-testid="pend-tareas" style={{ ...tarjeta, padding: compacta ? ESP.m : ESP.l }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ESP.s }}>
        <div style={{ fontSize: TXT.destacado, fontWeight: 700, color: COL.texto }}>Tareas{tareas.mes ? ` · ${tareas.mes}` : ""}</div>
        <button onClick={onAbrir} style={{ border: "none", background: "none", color: COL.info, fontSize: TXT.chico, fontWeight: 600, cursor: "pointer", minHeight: 32 }}>Abrir</button>
      </div>
      {tareas.estado !== "ok" ? <SinDatos estado={tareas.estado} que="tareas" onReintentar={tareas.reintentar}/> : (
        <>
          {/* Vencidas y por revisar ya están en «Requiere tu decisión»: aquí, lo que viene. */}
          <div style={{ display: "flex", gap: ESP.s, flexWrap: "wrap" }}>
            <Cifra testid="cifra-tareas-porvencer" valor={tareas.resumen.porVencer.length} label="Vencen en 2 días" tono="aviso" onClick={onAbrir}/>
          </div>
          {detalle && <>
            <ListaTareas titulo="Vencidas" items={tareas.resumen.vencidas} tono={COL.peligro}/>
            <ListaTareas titulo="Vencen en 2 días" items={tareas.resumen.porVencer} tono={COL.aviso}/>
            <ListaTareas titulo="Por revisar como supervisor" items={tareas.resumen.porRevisar}/>
          </>}
        </>
      )}
    </section>
  );
}

function TarjetaRendiciones({ rend, onVer, compacta }) {
  const r = rend.resumen;
  return (
    <section data-testid="pend-rendiciones" style={{ ...tarjeta, padding: compacta ? ESP.m : ESP.l }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ESP.s }}>
        <div style={{ fontSize: TXT.destacado, fontWeight: 700, color: COL.texto }}>Rendiciones</div>
        <button onClick={() => onVer()} style={{ border: "none", background: "none", color: COL.info, fontSize: TXT.chico, fontWeight: 600, cursor: "pointer", minHeight: 32 }}>Abrir</button>
      </div>
      {rend.estado !== "ok" ? <SinDatos estado={rend.estado} que="rendiciones" onReintentar={rend.reintentar}/> : (
        // Por aprobar y por pagar ya están en «Requiere tu decisión»: aquí, lo tuyo.
        <div style={{ display: "flex", gap: ESP.s, flexWrap: "wrap" }}>
          <Cifra testid="cifra-rend-devueltas" valor={r.mias.devuelta} label="Devueltas a ti" tono="peligro" onClick={() => onVer()}/>
          <Cifra testid="cifra-rend-borrador" valor={r.mias.borrador} label="Tus borradores" onClick={() => onVer()}/>
          {r.porPagar != null && !r.puedePagar && <Cifra testid="cifra-rend-pagar" valor={r.porPagar} label="Por pagar · solo ver" onClick={() => onVer()}/>}
        </div>
      )}
    </section>
  );
}

function TarjetaModulo({ m, onAbrir, compacta }) {
  return (
    <div data-testid={`modulo-${m.id}`} style={{ ...tarjeta, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <button onClick={() => onAbrir(m.id)}
        style={{ display: "flex", alignItems: "center", gap: ESP.m, padding: compacta ? `${ESP.m}px ${ESP.l}px` : ESP.l, border: "none", background: "none",
          textAlign: "left", cursor: "pointer", fontFamily: FUENTE, borderLeft: `4px solid ${m.color}`, minHeight: TACTIL + 12 }}>
        <span aria-hidden style={{ fontSize: compacta ? 24 : 28, lineHeight: 1 }}>{m.icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: TXT.destacado, fontWeight: 700, color: COL.texto }}>{m.label}</span>
          <span style={{ display: "block", fontSize: TXT.chico, color: COL.texto2, marginTop: 1 }}>{m.sublabel}</span>
        </span>
        <span aria-hidden style={{ color: COL.texto2, fontSize: 18 }}>›</span>
      </button>
      {m.accesos && m.accesos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: `0 ${ESP.l}px ${ESP.m}px ${ESP.l + 4}px` }}>
          {m.accesos.map(a => (
            <button key={a.id} data-testid={`acceso-${m.id}-${a.id}`} onClick={() => onAbrir(m.id, a.id)}
              style={{ minHeight: 34, padding: `0 ${ESP.m}px`, borderRadius: 17, border: `1px solid ${COL.borde}`, background: COL.fondo, color: COL.texto,
                fontSize: TXT.chico, fontWeight: 600, cursor: "pointer", fontFamily: FUENTE }}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function BotonPrincipal({ onClick, children, testid }) {
  return (
    <button data-testid={testid} onClick={onClick}
      style={{ minHeight: 52, padding: `0 ${ESP.xl}px`, borderRadius: 12, border: "none", background: COL.marca, color: COL.marcaTexto,
        fontSize: TXT.destacado, fontWeight: 700, cursor: "pointer", fontFamily: FUENTE, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: ESP.s }}>
      {children}
    </button>
  );
}

function Avisos({ avisos }) {
  if (!avisos || !avisos.length) return null;
  return (
    <div data-testid="avisos-inicio" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {avisos.map(a => (
        <div key={a.id} style={{ fontSize: TXT.chico, color: COL.aviso, background: COL.avisoFondo, borderRadius: 8, padding: `6px ${ESP.m}px`, lineHeight: 1.4 }}>{a.texto}</div>
      ))}
    </div>
  );
}

// ── «Requiere tu decisión» ────────────────────────────────────────────
// Solo lo que ESTE perfil puede ejecutar (ver ≠ hacer), con las reglas de cada
// módulo. Una fuente sin leer se dice «no disponible», nunca cero.
function Decisiones({ items, compacta }) {
  if (!items.length) return null;
  const total = items.reduce((a, i) => a + (i.estado === "ok" ? i.valor : 0), 0);
  const algunaFalta = items.some(i => i.estado !== "ok");
  return (
    <section data-testid="decisiones" aria-label="Requiere tu decisión">
      <div style={{ display: "flex", alignItems: "baseline", gap: ESP.s, marginBottom: ESP.s }}>
        <Rotulo>Requiere tu decisión</Rotulo>
        {!algunaFalta && total === 0 && <span data-testid="decisiones-al-dia" style={{ fontSize: TXT.chico, color: COL.ok, fontWeight: 600 }}>Nada espera tu decisión</span>}
      </div>
      <div style={{ display: "grid", gap: compacta ? 0 : ESP.m, gridTemplateColumns: compacta ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
        ...(compacta ? { ...tarjeta, overflow: "hidden" } : {}) }}>
        {items.map((i, k) => {
          const activo = i.estado === "ok" && i.valor > 0;
          const color = !activo ? COL.texto2 : i.tono === "peligro" ? COL.peligro : COL.marca;
          if (compacta) return (
            <button key={i.id} data-testid={i.estado === "ok" ? i.testid : `decision-${i.id}`} onClick={i.estado === "ok" ? i.onClick : i.reintentar}
              style={{ display: "flex", alignItems: "center", gap: ESP.m, minHeight: 56, padding: `${ESP.s}px ${ESP.l}px`, border: "none",
                borderTop: k ? `1px solid ${COL.borde}` : "none", background: COL.superficie, textAlign: "left", cursor: "pointer", fontFamily: FUENTE, width: "100%" }}>
              <span style={{ minWidth: 34, fontSize: TXT.titulo, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{i.estado === "ok" ? <span data-cifra>{i.valor}</span> : "—"}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: TXT.cuerpo, fontWeight: 600, color: COL.texto }}>{i.label}</span>
                <span style={{ display: "block", fontSize: TXT.chico, color: i.estado === "ok" ? COL.texto2 : COL.aviso }}>{i.estado === "ok" ? i.sub : i.estado === "cargando" ? "Leyendo…" : "No disponible · tocar para reintentar"}</span>
              </span>
              <span aria-hidden style={{ color: COL.texto2, fontSize: 18 }}>›</span>
            </button>
          );
          return (
            <button key={i.id} data-testid={i.estado === "ok" ? i.testid : `decision-${i.id}`} onClick={i.estado === "ok" ? i.onClick : i.reintentar}
              style={{ ...tarjeta, textAlign: "left", cursor: "pointer", fontFamily: FUENTE, padding: `${ESP.m}px ${ESP.l}px`, minHeight: 112,
                display: "flex", flexDirection: "column", gap: 4, borderTop: `3px solid ${activo ? color : COL.borde}` }}>
              <span style={{ fontSize: TXT.chico, fontWeight: 700, color: COL.texto2 }}>{i.modulo}</span>
              <span style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{i.estado === "ok" ? <span data-cifra>{i.valor}</span> : "—"}</span>
              <span style={{ fontSize: TXT.cuerpo, fontWeight: 600, color: COL.texto }}>{i.label}</span>
              <span style={{ fontSize: TXT.chico, color: i.estado === "ok" ? COL.texto2 : COL.aviso, marginTop: "auto" }}>
                {i.estado === "ok" ? (activo ? "Abrir ›" : "Al día") : i.estado === "cargando" ? "Leyendo…" : "No disponible · reintentar"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TarjetaNominas({ nominas, onAbrir, compacta }) {
  const r = nominas.resumen;
  return (
    <section data-testid="pend-nominas" style={{ ...tarjeta, padding: compacta ? ESP.m : ESP.l }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ESP.s }}>
        <div style={{ fontSize: TXT.destacado, fontWeight: 700, color: COL.texto }}>Nóminas de pago</div>
        <button onClick={onAbrir} style={{ border: "none", background: "none", color: COL.info, fontSize: TXT.chico, fontWeight: 600, cursor: "pointer", minHeight: 32 }}>Abrir</button>
      </div>
      {nominas.estado !== "ok" ? <SinDatos estado={nominas.estado} que="nóminas" onReintentar={nominas.reintentar}/> : (
        <>
          <div style={{ fontSize: TXT.chico, color: COL.texto2 }}>{r.enCurso} en curso (preparadas, en revisión o con V°B°)</div>
          <ListaTareas titulo="Esperan tu aprobación" items={r.detalle} tono={COL.marca}/>
        </>
      )}
    </section>
  );
}

// ── Entrada simple para quien solo rinde gastos ───────────────────────
function InicioRendiciones({ clase, rend, onNueva, onVer }) {
  const r = rend.resumen;
  const filas = r ? [
    ["Borradores", r.mias.borrador, "Aún no enviadas"],
    ["Devueltas para corregir", r.mias.devuelta, "Corrige y vuelve a enviar"],
    ["Enviadas", r.mias.enviada, "Esperan aprobación"],
    ["Aprobadas", r.mias.aprobada, "Pendientes de pago"],
    ["Pagadas", r.mias.pagada, null],
    ["Rechazadas", r.mias.rechazada, null],
  ] : [];
  return (
    <div data-testid="inicio-rendiciones" style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: ESP.l }}>
      <BotonPrincipal testid="inicio-nueva-rendicion" onClick={onNueva}>+ Nueva rendición</BotonPrincipal>
      <section style={{ ...tarjeta, padding: ESP.l }}>
        <div style={{ fontSize: TXT.destacado, fontWeight: 700, color: COL.texto, marginBottom: ESP.s }}>Mis rendiciones</div>
        {rend.estado !== "ok" ? <SinDatos estado={rend.estado} que="rendiciones" onReintentar={rend.reintentar}/> : (
          <div>
            {filas.map(([l, v, sub], k) => (
              <button key={l} data-testid={`rend-estado-${k}`} onClick={onVer}
                style={{ width: "100%", minHeight: TACTIL + 8, display: "flex", alignItems: "center", gap: ESP.m, border: "none", borderTop: k ? `1px solid ${COL.borde}` : "none",
                  background: "none", padding: `${ESP.xs}px 0`, cursor: "pointer", textAlign: "left", fontFamily: FUENTE }}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontSize: TXT.cuerpo, color: COL.texto, fontWeight: 600 }}>{l}</span>
                  {sub && <span style={{ display: "block", fontSize: TXT.chico, color: COL.texto2 }}>{sub}</span>}
                </span>
                <span style={{ fontSize: TXT.destacado + 2, fontWeight: 800, color: v > 0 && k === 1 ? COL.peligro : COL.texto }}>{v}</span>
              </button>
            ))}
            <button onClick={onVer} style={{ marginTop: ESP.s, minHeight: TACTIL, width: "100%", borderRadius: 10, border: `1px solid ${COL.borde}`, background: COL.superficie,
              color: COL.texto, fontSize: TXT.cuerpo, fontWeight: 600, cursor: "pointer", fontFamily: FUENTE }}>Ver todas mis rendiciones</button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Inicio({ clase, usuario, vista = "inicio", soloRendiciones, tareas, rend, nominas, puedeRendir, modulos, avisos,
  onAbrirModulo, onNuevaRendicion, onVerRendiciones, onAbrirTareas }) {
  const compacta = clase === "compacta";
  const hoy = new Date();
  const h = hoy.getHours();
  const saludo = `${h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches"}, ${String(usuario?.nombre || "").split(" ")[0]}`;
  const f0 = hoy.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const fecha = f0.charAt(0).toUpperCase() + f0.slice(1);
  const m = hoy.getMonth(), y = hoy.getFullYear(), sy = m >= 6 ? y : y - 1;
  const temporada = `Temporada ${String(sy).slice(2)}-${String(sy + 1).slice(2)}`;
  const pad = compacta ? ESP.l : clase === "media" ? ESP.xl : ESP.xxl;

  const cabecera = (
    <header style={{ marginBottom: compacta ? ESP.m : ESP.xl, display: "flex", alignItems: "center", gap: ESP.m }}>
      {compacta && <img src="/med.png" alt="" style={{ width: 36, height: 36, objectFit: "contain" }} onError={e => { e.target.style.display = "none"; }}/>}
      <div>
        <h1 style={{ margin: 0, fontSize: compacta ? TXT.titulo : TXT.saludo, fontWeight: 800, color: COL.texto, letterSpacing: "-0.2px" }}>
          {vista === "pendientes" ? "Pendientes" : saludo}
        </h1>
        <div style={{ fontSize: TXT.chico, color: COL.texto2, marginTop: 2 }}>
          <span>{fecha}</span> · {temporada}{!compacta && usuario?.cargo ? ` · ${usuario.cargo}` : ""}
        </div>
      </div>
    </header>
  );

  const decisiones = [
    nominas && { id: "nominas", testid: "cifra-nominas-aprobar", modulo: "Finanzas · Nóminas", label: "Nóminas por aprobar", sub: "Revisión, V°B° o aprobación CFO",
      estado: nominas.estado, valor: nominas.resumen?.porAprobar || 0, reintentar: nominas.reintentar, onClick: () => onAbrirModulo("finanzas", "nominas") },
    rend && { id: "rend-aprobar", testid: "cifra-rend-aprobar", modulo: "Finanzas · Rendiciones", label: "Rendiciones por aprobar", sub: "Te toca en la cadena",
      estado: rend.estado, valor: rend.resumen?.teTocaAprobar || 0, reintentar: rend.reintentar, onClick: () => onVerRendiciones() },
    rend && rend.resumen?.puedePagar && rend.resumen?.porPagar != null && { id: "rend-pagar", testid: "cifra-rend-pagar", modulo: "Finanzas · Rendiciones", label: "Rendiciones por pagar", sub: "Aprobadas, listas para pago",
      estado: rend.estado, valor: rend.resumen.porPagar, reintentar: rend.reintentar, onClick: () => onVerRendiciones() },
    tareas && { id: "tareas-revisar", testid: "cifra-tareas-revisar", modulo: "Tareas", label: "Tareas por revisar", sub: "Como supervisor",
      estado: tareas.estado, valor: tareas.resumen?.porRevisar.length || 0, reintentar: tareas.reintentar, onClick: onAbrirTareas },
    tareas && { id: "tareas-vencidas", testid: "cifra-tareas-vencidas", modulo: "Tareas", label: "Tareas vencidas", sub: "Tuyas, del mes en curso", tono: "peligro",
      estado: tareas.estado, valor: tareas.resumen?.vencidas.length || 0, reintentar: tareas.reintentar, onClick: onAbrirTareas },
  ].filter(Boolean);

  const pendientes = (tareas || rend || nominas) ? (
    <div style={{ display: "grid", gap: compacta ? ESP.s : ESP.l, alignItems: "start", gridTemplateColumns: !compacta && tareas && rend ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr" }}>
      {tareas && <TarjetaTareas tareas={tareas} onAbrir={onAbrirTareas} detalle={vista === "pendientes" || !compacta} compacta={compacta}/>}
      {rend && <TarjetaRendiciones rend={rend} onVer={onVerRendiciones} compacta={compacta && vista !== "pendientes"}/>}
      {nominas && <TarjetaNominas nominas={nominas} onAbrir={() => onAbrirModulo("finanzas", "nominas")} compacta={compacta}/>}
    </div>
  ) : null;

  let cuerpo;
  if (soloRendiciones) {
    cuerpo = <InicioRendiciones clase={clase} rend={rend} onNueva={onNuevaRendicion} onVer={onVerRendiciones}/>;
  } else if (vista === "pendientes") {
    cuerpo = pendientes ? (
      <div style={{ display: "flex", flexDirection: "column", gap: ESP.l }}>
        <Decisiones items={decisiones} compacta={compacta}/>
        <div><Rotulo style={{ marginBottom: ESP.s }}>Seguimiento</Rotulo>{pendientes}</div>
      </div>
    ) : <div style={{ fontSize: TXT.cuerpo, color: COL.texto2 }}>Tu perfil no tiene tareas ni rendiciones asignadas.</div>;
  } else {
    cuerpo = (
      <div style={{ display: "flex", flexDirection: "column", gap: compacta ? ESP.l : ESP.xl }}>
        {!compacta && <Avisos avisos={avisos}/>}
        {puedeRendir && compacta && <BotonPrincipal testid="inicio-nueva-rendicion" onClick={onNuevaRendicion}>+ Nueva rendición</BotonPrincipal>}
        <Decisiones items={decisiones} compacta={compacta}/>
        {pendientes && !compacta && (
          <div>
            <Rotulo style={{ marginBottom: ESP.s }}>Seguimiento</Rotulo>
            {pendientes}
          </div>
        )}
        {modulos.length > 0 ? (
          <div>
            <Rotulo style={{ marginBottom: ESP.s }}>Módulos</Rotulo>
            <div data-testid="grilla-modulos" style={{ display: "grid", gap: compacta ? ESP.s : ESP.l, alignItems: "start",
              gridTemplateColumns: compacta ? "1fr" : clase === "media" ? "repeat(2, minmax(0,1fr))" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {modulos.map(x => <TarjetaModulo key={x.id} m={x} onAbrir={onAbrirModulo} compacta={compacta}/>)}
            </div>
          </div>
        ) : <div style={{ fontSize: TXT.cuerpo, color: COL.texto2 }}>No tienes módulos asignados. Contacta al administrador.</div>}
        {compacta && <Avisos avisos={avisos}/>}
      </div>
    );
  }

  return (
    <div data-testid="inicio" style={{ background: COL.fondo, minHeight: "100vh", fontFamily: FUENTE, padding: `${compacta ? ESP.l : ESP.xl}px ${pad}px ${ESP.xxl}px`, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {cabecera}
        {cuerpo}
      </div>
    </div>
  );
}
