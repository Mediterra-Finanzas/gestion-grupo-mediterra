/* eslint-disable */
// Correo del Informe Técnico. Casos sintéticos: campos y correos inventados,
// ningún dato real de clientes. Nada acá envía correo ni toca la red.
import {
  FRASE_RESPONSABILIDAD,
  asuntoCorreoInforme,
  cuerpoCorreoInforme,
  vistaPreviaCorreo,
  validarDestinatarios,
  normalizarDestinatarios,
} from "./correoInforme";

// La frase se escribe de nuevo acá a propósito, NO se importa la constante:
// si alguien edita FRASE_RESPONSABILIDAD por accidente, esta prueba cae.
const FRASE_ESPERADA =
  "Tomar todas las recomendaciones realizadas como una guía, la decisión de utilizarlas queda totalmente bajo su criterio y responsabilidad.";

const INFORME = {
  titulo: "Visita de seguimiento invierno",
  lugar: "Campo Los Nogales",
  especie: "Cerezo",
  variedad: "Santina",
  fecha: "2026-07-14",
  responsable: "Equipo Agronómico Osiris",
};

const LINK = "https://ejemplo.invalido/api/informe?id=inf-777";

describe("la frase de responsabilidad", () => {
  test("el cuerpo la contiene exacta, carácter por carácter", () => {
    const cuerpo = cuerpoCorreoInforme(INFORME, { cliente: "Agrícola Ejemplo Ltda." });
    expect(cuerpo).toContain(FRASE_ESPERADA);
  });

  test("la constante exportada es exactamente esa frase", () => {
    expect(FRASE_RESPONSABILIDAD).toBe(FRASE_ESPERADA);
    expect(FRASE_RESPONSABILIDAD.endsWith(".")).toBe(true);
  });

  test("aparece una sola vez", () => {
    const cuerpo = cuerpoCorreoInforme(INFORME, { cliente: "Agrícola Ejemplo Ltda.", linkInforme: LINK });
    const veces = cuerpo.split(FRASE_ESPERADA).length - 1;
    expect(veces).toBe(1);
  });

  test("aparece con link y sin link", () => {
    const conLink = cuerpoCorreoInforme(INFORME, { cliente: "Agrícola Ejemplo Ltda.", linkInforme: LINK });
    const sinLink = cuerpoCorreoInforme(INFORME, { cliente: "Agrícola Ejemplo Ltda." });
    expect(conLink).toContain(FRASE_ESPERADA);
    expect(sinLink).toContain(FRASE_ESPERADA);
    expect(conLink).toContain(LINK);
    expect(sinLink).not.toContain("📎 Ver y descargar informe completo:");
  });

  test("va antes de la firma y separada por una línea en blanco", () => {
    const cuerpo = cuerpoCorreoInforme(INFORME, { cliente: "Agrícola Ejemplo Ltda." });
    expect(cuerpo).toContain(FRASE_ESPERADA + "\n\n— Osiris Plant Management · Grupo Mediterra");
    // lastIndexOf: "— Osiris Plant Management" también aparece en el encabezado.
    expect(cuerpo.indexOf(FRASE_ESPERADA)).toBeLessThan(
      cuerpo.lastIndexOf("— Osiris Plant Management")
    );
    expect(cuerpo.endsWith("— Osiris Plant Management · Grupo Mediterra")).toBe(true);
  });
});

describe("estructura del cuerpo, igual a la de hoy", () => {
  test("mantiene encabezado, viñetas y datos", () => {
    const cuerpo = cuerpoCorreoInforme(INFORME, { cliente: "Agrícola Ejemplo Ltda." });
    expect(cuerpo.startsWith("📄 INFORME TÉCNICO — Osiris Plant Management")).toBe(true);
    expect(cuerpo).toContain("Estimado(a),");
    expect(cuerpo).toContain("Le enviamos el Informe Técnico correspondiente a:");
    expect(cuerpo).toContain("• Título: Visita de seguimiento invierno");
    expect(cuerpo).toContain("• Cliente: Agrícola Ejemplo Ltda.");
    expect(cuerpo).toContain("• Campo: Campo Los Nogales");
    expect(cuerpo).toContain("• Fecha: 2026-07-14");
    expect(cuerpo).toContain("• Responsable: Equipo Agronómico Osiris");
  });

  test("con link agrega el bloque y la nota de Ctrl+P", () => {
    const cuerpo = cuerpoCorreoInforme(INFORME, { cliente: "Agrícola Ejemplo Ltda.", linkInforme: LINK });
    expect(cuerpo).toContain("📎 Ver y descargar informe completo:\n" + LINK);
    expect(cuerpo).toContain('(Para guardar como PDF: Ctrl+P → "Guardar como PDF")');
  });

  test("lo que falta se escribe con guion largo, no se inventa", () => {
    const cuerpo = cuerpoCorreoInforme({}, {});
    expect(cuerpo).toContain("• Título: —");
    expect(cuerpo).toContain("• Cliente: —");
    expect(cuerpo).toContain("• Campo: —");
    expect(cuerpo).toContain("• Especie: —");
    expect(cuerpo).toContain("• Fecha: —");
    expect(cuerpo).toContain("• Responsable: —");
    expect(cuerpo).toContain(FRASE_ESPERADA);
  });

  test("los espacios en blanco no cuentan como dato", () => {
    const cuerpo = cuerpoCorreoInforme({ titulo: "   " }, { cliente: "  " });
    expect(cuerpo).toContain("• Título: —");
    expect(cuerpo).toContain("• Cliente: —");
  });
});

describe("variedades", () => {
  test("con varias variedades se listan todas", () => {
    const cuerpo = cuerpoCorreoInforme(INFORME, {
      cliente: "Agrícola Ejemplo Ltda.",
      variedades: ["Santina", "Regina", "Lapins"],
    });
    expect(cuerpo).toContain("• Especie: Cerezo · Santina, Regina, Lapins");
    expect(cuerpo).toContain(FRASE_ESPERADA);
  });

  test("sin variedades se usa el campo variedad de siempre", () => {
    const cuerpo = cuerpoCorreoInforme(INFORME, { cliente: "Agrícola Ejemplo Ltda." });
    expect(cuerpo).toContain("• Especie: Cerezo · Santina");
  });

  test("lista vacía cae al campo legacy", () => {
    const cuerpo = cuerpoCorreoInforme(INFORME, { cliente: "Agrícola Ejemplo Ltda.", variedades: [] });
    expect(cuerpo).toContain("• Especie: Cerezo · Santina");
  });

  test("sin variedades ni campo legacy, la especie va sola", () => {
    const cuerpo = cuerpoCorreoInforme({ especie: "Nogal" }, {});
    expect(cuerpo).toContain("• Especie: Nogal\n");
    expect(cuerpo).not.toContain("Nogal · ");
  });
});

describe("asunto", () => {
  test("usa el título del informe", () => {
    expect(asuntoCorreoInforme(INFORME)).toBe(
      "📄 Informe Técnico: Visita de seguimiento invierno — Osiris"
    );
  });

  test("sin título usa 'Visita'", () => {
    expect(asuntoCorreoInforme({})).toBe("📄 Informe Técnico: Visita — Osiris");
    expect(asuntoCorreoInforme({ titulo: "  " })).toBe("📄 Informe Técnico: Visita — Osiris");
  });
});

describe("vista previa", () => {
  test("devuelve para, asunto, cuerpo y la marca de vista previa", () => {
    const vp = vistaPreviaCorreo(INFORME, {
      cliente: "Agrícola Ejemplo Ltda.",
      linkInforme: LINK,
      emails: " ana@ejemplo.invalido , , bruno@ejemplo.invalido ",
    });
    expect(vp.esVistaPrevia).toBe(true);
    expect(vp.para).toBe("ana@ejemplo.invalido, bruno@ejemplo.invalido");
    expect(vp.asunto).toBe(asuntoCorreoInforme(INFORME));
    expect(vp.cuerpo).toContain(FRASE_ESPERADA);
  });

  test("sin destinatarios el 'para' queda vacío y el cuerpo igual se arma", () => {
    const vp = vistaPreviaCorreo(INFORME, { cliente: "Agrícola Ejemplo Ltda." });
    expect(vp.para).toBe("");
    expect(vp.cuerpo).toContain(FRASE_ESPERADA);
  });

  test("no dispara ninguna llamada de red", () => {
    const espia = jest.fn();
    const previo = global.fetch;
    global.fetch = espia;
    try {
      vistaPreviaCorreo(INFORME, {
        cliente: "Agrícola Ejemplo Ltda.",
        linkInforme: LINK,
        emails: "ana@ejemplo.invalido",
      });
      expect(espia).not.toHaveBeenCalled();
    } finally {
      global.fetch = previo;
    }
  });

  test("el módulo no contiene ningún fetch ni endpoint de envío", () => {
    const fs = require("fs");
    const path = require("path");
    const fuente = fs.readFileSync(path.join(__dirname, "correoInforme.js"), "utf8");
    // Se descuentan los comentarios, que sí mencionan fetch para explicar que no lo usa.
    const codigo = fuente
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(codigo).not.toMatch(/fetch\s*\(/);
    expect(codigo).not.toContain("XMLHttpRequest");
    expect(codigo).not.toContain("send-email");
    expect(codigo).not.toContain("emailjs");
    expect(codigo).not.toContain("sendBeacon");
  });
});

describe("destinatarios", () => {
  test("normaliza separando por coma, recortando y descartando vacíos", () => {
    expect(normalizarDestinatarios(" ana@ejemplo.invalido ,, bruno@ejemplo.invalido , ")).toEqual([
      "ana@ejemplo.invalido",
      "bruno@ejemplo.invalido",
    ]);
    expect(normalizarDestinatarios("")).toEqual([]);
    expect(normalizarDestinatarios(null)).toEqual([]);
  });

  test("uno válido", () => {
    const r = validarDestinatarios("ana@ejemplo.invalido");
    expect(r.ok).toBe(true);
    expect(r.destinatarios).toEqual(["ana@ejemplo.invalido"]);
    expect(r.motivo).toBe("");
  });

  test("varios válidos", () => {
    const r = validarDestinatarios("ana@ejemplo.invalido, bruno@ejemplo.invalido");
    expect(r.ok).toBe(true);
    expect(r.destinatarios).toHaveLength(2);
  });

  test("texto vacío: no se puede enviar", () => {
    const r = validarDestinatarios("   ");
    expect(r.ok).toBe(false);
    expect(r.destinatarios).toEqual([]);
    expect(r.motivo).toBe("Ingresa al menos un email.");
  });

  test("ninguno con forma de email", () => {
    const r = validarDestinatarios("ana, bruno");
    expect(r.ok).toBe(false);
    expect(r.destinatarios).toEqual([]);
    expect(r.motivo).toContain("Ningún destinatario tiene forma de email");
  });

  test("mezcla de válidos e inválidos: se avisa y no se da por bueno", () => {
    const r = validarDestinatarios("ana@ejemplo.invalido, bruno-sin-arroba");
    expect(r.ok).toBe(false);
    expect(r.destinatarios).toEqual(["ana@ejemplo.invalido"]);
    expect(r.motivo).toContain("bruno-sin-arroba");
  });
});
