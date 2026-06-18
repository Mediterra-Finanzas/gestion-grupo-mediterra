// api/login.js — Endpoint de login server-side (Etapa 1)
// ------------------------------------------------------
// Valida correo + PIN del lado del servidor (los PINs YA no se comparan
// en el navegador) y devuelve una cookie de sesión firmada.
//
// Fuente de verdad: la MISMA lista de usuarios que ya usa la app, guardada
// en calendario_data id='main' (campos: value.usuarios[] y
// value.pinsPersonalizados). Se lee SOLO con la llave de servicio. Así no
// hay que copiar/sincronizar nada: cuando cambias un PIN en la app, el
// guardia lo valida igual.
//
// PIN efectivo (igual que getPinActivo en App.jsx):
//   pinsPersonalizados[nombre]  ||  usuarios[].pin
//   pinsPersonalizados[nombre+"_temp"]  = PIN temporal del flujo de reset
//
// Respuestas:
//   200 { ok:true, usuario:{nombre,email,rol}, pinTemporal:bool } + Set-Cookie
//   401 { ok:false, error:"credenciales" }
//   403 { ok:false, error:"desactivado" }
//   503 { ok:false, error:"no_configurado" }

const { crearToken, cookieSesion, supaFetch, faltanSecretos } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "metodo" });
  }
  if (faltanSecretos()) {
    return res.status(503).json({ ok: false, error: "no_configurado" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = String((body && body.email) || "").trim().toLowerCase();
  const pin = String((body && body.pin) || "").trim();
  if (!email || !pin) return res.status(401).json({ ok: false, error: "credenciales" });

  // Leer la lista actual de usuarios (server-side, con llave de servicio)
  let usuarios = [], pinsPersonalizados = {};
  try {
    const r = await supaFetch("calendario_data?id=eq.main&select=value");
    if (!r.ok) return res.status(503).json({ ok: false, error: "no_configurado" });
    const filas = await r.json();
    const v = (filas[0] && filas[0].value) || {};
    usuarios = v.usuarios || [];
    pinsPersonalizados = v.pinsPersonalizados || {};
  } catch {
    return res.status(503).json({ ok: false, error: "no_configurado" });
  }
  if (!usuarios.length) return res.status(503).json({ ok: false, error: "no_configurado" });

  const u = usuarios.find(x => x && x.email && String(x.email).toLowerCase() === email);
  if (!u) return res.status(401).json({ ok: false, error: "credenciales" });
  if (u.desactivado) return res.status(403).json({ ok: false, error: "desactivado" });

  const pinEfectivo = String(pinsPersonalizados[u.nombre] || u.pin || "");
  const pinTemp = pinsPersonalizados[u.nombre + "_temp"]
    ? String(pinsPersonalizados[u.nombre + "_temp"]) : "";

  const esOk = pinEfectivo && pin === pinEfectivo;
  const esTemp = pinTemp && pin === pinTemp;
  if (!esOk && !esTemp) {
    return res.status(401).json({ ok: false, error: "credenciales" });
  }

  const token = crearToken({ email: u.email, nombre: u.nombre, rol: u.rol });
  res.setHeader("Set-Cookie", cookieSesion(token));
  return res.status(200).json({
    ok: true,
    usuario: { nombre: u.nombre, email: u.email, rol: u.rol },
    pinTemporal: !!(esTemp && !esOk),
  });
};
