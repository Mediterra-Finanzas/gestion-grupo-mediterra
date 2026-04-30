// api/informe.js — Vercel Serverless Function
// Sirve informes técnicos de Osiris como páginas HTML renderizadas
// URL: /api/informe?id=INFORME_ID

const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

module.exports = async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(400).send("<h1>Error: ID de informe no proporcionado</h1>");
  }

  try {
    // Buscar el HTML del informe en Supabase Storage
    const storageUrl = `${SUPA_URL}/storage/v1/object/public/osiris-fotos/informes-html/${id}.html`;
    const storageRes = await fetch(storageUrl);

    if (storageRes.ok) {
      const html = await storageRes.text();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.status(200).send(html);
    }

    // Si no está en Storage, buscar en la base de datos (osiris row)
    const dbRes = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.osiris&select=value`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const rows = await dbRes.json();
    const osirisData = rows?.[0]?.value;
    
    if (!osirisData) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send("<h1>Datos de Osiris no encontrados</h1>");
    }

    const opTecnica = osirisData.opTecnica || {};
    const informes = Array.isArray(opTecnica.informes) ? opTecnica.informes : [];
    const informe = informes.find(i => i.id === id);

    if (!informe || !informe._htmlCache) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(`<h1>Informe no encontrado</h1><p>ID: ${id}</p>`);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(informe._htmlCache);
  } catch (error) {
    console.error("Error sirviendo informe:", error);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(`<h1>Error interno</h1><p>${error.message}</p>`);
  }
};
