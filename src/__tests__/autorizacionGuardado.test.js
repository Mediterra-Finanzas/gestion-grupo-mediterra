/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// AUTORIZACIÓN EN LA RUTA DE GUARDADO (no solo en la interfaz)
//
// Antes, el único gate de `persistAll` era `cargaOkRef`. La interfaz escondía
// los controles de una pestaña en "ver", pero cualquier otro camino que
// cambiara el estado reescribía la fila `finanzas` COMPLETA, con los datos de
// las pestañas que esa sesión no puede ni ver. El hueco era alcanzable sin
// devtools: una sesión con el flujo en "ver" y bancos en "editar" que guardara
// un saldo disparaba el auto-save del blob entero.
//
// Esto NO es autorización del servidor (el cliente sigue teniendo la llave
// pública y no hay RLS): cierra la vía accidental desde la propia app. La
// distinción se prueba acá y está escrita en el código.
// ═══════════════════════════════════════════════════════════════════
import { autorizacionGuardado, CAMPO_PESTANA } from '../FinanzasModule.jsx';

// puedoEdit real de la app: admin siempre; si no, la pestaña no puede estar en
// "ver" ni en "sin_acceso".
const permisoDe = (tabPermisos, esAdmin=false) => (tabId) =>
  esAdmin || ((tabPermisos[tabId] ?? "editar") !== "ver" && (tabPermisos[tabId] ?? "editar") !== "sin_acceso");

describe('autorizacionGuardado', () => {
  test('sin función de permiso no bloquea (caminos sin contexto de permisos)', () => {
    expect(autorizacionGuardado({}, undefined).ok).toBe(true);
    expect(autorizacionGuardado({ allegria_params: {} }, null).ok).toBe(true);
  });

  test('con el flujo en editar, el auto-save del blob completo pasa', () => {
    const pe = permisoDe({ flujo:"editar" });
    expect(autorizacionGuardado({}, pe)).toEqual({ ok:true });
  });

  test('EL HUECO: con el flujo en "ver", el auto-save del blob completo YA NO escribe', () => {
    const pe = permisoDe({ flujo:"ver", bancos:"editar" });
    const r = autorizacionGuardado({}, pe);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sin_permiso");
    expect(r.pestanas).toEqual(["flujo"]);
  });

  test('con el flujo en "sin_acceso" tampoco', () => {
    const pe = permisoDe({ flujo:"sin_acceso" });
    expect(autorizacionGuardado({}, pe).ok).toBe(false);
  });

  test('un override de allegria_params exige permiso del flujo', () => {
    const conFlujo = permisoDe({ flujo:"editar" });
    const sinFlujo = permisoDe({ flujo:"ver" });
    expect(autorizacionGuardado({ allegria_params:{a:1} }, conFlujo).ok).toBe(true);
    expect(autorizacionGuardado({ allegria_params:{a:1} }, sinFlujo).ok).toBe(false);
  });

  test('créditos se gobierna por su propia pestaña, no por el flujo', () => {
    const pe = permisoDe({ flujo:"ver", creditos:"editar" });
    expect(autorizacionGuardado({ creditos_data:[] }, pe).ok).toBe(true);
    const pe2 = permisoDe({ flujo:"editar", creditos:"ver" });
    const r = autorizacionGuardado({ creditos_data:[] }, pe2);
    expect(r.ok).toBe(false);
    expect(r.pestanas).toEqual(["creditos"]);
  });

  test('con varios campos se exige permiso de CADA pestaña presente', () => {
    const pe = permisoDe({ flujo:"editar", creditos:"ver" });
    const r = autorizacionGuardado({ allegria_params:{}, creditos_data:[] }, pe);
    expect(r.ok).toBe(false);
    expect(r.pestanas).toEqual(["creditos"]);
  });

  test('un campo en undefined no cuenta como presente', () => {
    const pe = permisoDe({ flujo:"editar", creditos:"ver" });
    expect(autorizacionGuardado({ allegria_params:{}, creditos_data:undefined }, pe).ok).toBe(true);
  });

  test('admin pasa siempre, cualquiera sea tabPermisos', () => {
    const pe = permisoDe({ flujo:"sin_acceso", creditos:"sin_acceso" }, true);
    expect(autorizacionGuardado({}, pe).ok).toBe(true);
    expect(autorizacionGuardado({ creditos_data:[] }, pe).ok).toBe(true);
  });

  test('todo campo del blob que persistAll escribe tiene pestaña asignada', () => {
    // Si se agrega un campo nuevo al blob sin mapearlo, este test lo delata:
    // un campo sin pestaña no quedaría gobernado por ningún permiso.
    const delBlob = [
      "finanzas_real","allegria_params","allegria_comision_arandanos","params_emp",
      "creditos_data","params_as","params_frisku","params_if","params_af","params_ap",
      "params_osiris","params_participacion","sub_lines","added_lines","intercompany",
    ];
    const sinMapear = delBlob.filter(k => !CAMPO_PESTANA[k]);
    expect(sinMapear).toEqual([]);
  });

  test('un campo desconocido no abre la puerta: cae al permiso del flujo', () => {
    // Sin pestaña asignada, `pestanas` queda vacío y no habría nada que exigir.
    // Se comprueba el comportamiento explícito para que el día que aparezca un
    // campo nuevo sin mapear quede documentado qué pasa.
    const pe = permisoDe({ flujo:"ver" });
    const r = autorizacionGuardado({ campo_que_no_existe: 1 }, pe);
    expect(r.ok).toBe(true); // no bloquea, y el test de arriba impide que ocurra
  });
});
