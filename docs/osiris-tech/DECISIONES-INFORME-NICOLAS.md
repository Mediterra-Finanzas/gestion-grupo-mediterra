# Revisión conjunta con Nicolás · informes técnicos

2026-09-25. **Los dos bloques que bloqueaban publicar están cerrados** por Nicolás Fuenzalida.
Lo que sigue queda como registro de la decisión y de lo que aún no se definió.

## Respuestas de Nicolás (2026-09-25)

**Bloque 1 · Catálogo — CERRADO.** *"Lo que vale es la hoja 1, la otra no la consideres."*
El catálogo operativo son los **8 estados de "Hoja1"**, con Floración y Cuaja en un solo estado
("4- Floración y cuajado"). Las **19 labores** que solo estaban en "Manejos por estado" quedan
fuera por decisión suya; siguen listadas por nombre en el anexo A, no se descartan en silencio.
Lo ya guardado en informes antiguos se conserva igual.

**Bloque 2 · Alcance — CERRADO.** *"Por variedad (…) cuando use esa opción ideal poder marcar
varias variedades y se registre la superficie de cada una. El estado fenológico que sea el mismo
para todas las seleccionadas."*

- El alcance evaluado se registra **por variedad**: cada variedad marcada lleva su propia
  superficie o cantidad de plantas, con su unidad. No se suma entre unidades, no se convierte y no
  se reparte nada automáticamente.
- El **estado fenológico predominante es uno solo por informe**, común a todas las variedades
  marcadas, y la pantalla lo dice.
- Los informes antiguos conservan su superficie del informe completo, en hectáreas, con su
  procedencia. No se reparte por variedad.

## Lo que queda abierto (no bloquea publicar)

**Bloque 3 · Unidades** y **Bloque 4 · Campos dudosos de "Hoja1"**: son respuestas de labores que
todavía no se muestran en pantalla. Se completan cuando se cableen las respuestas por labor. El
detalle está más abajo, sin cambios.

---

## Bloque 1 · El catálogo: las dos hojas no coinciden

### Los estados, lado a lado

```
  "Manejos por estado"  (9)              "Hoja1"  (8)
  ─────────────────────────              ────────────────────────────────────
  Establecimiento          ──────────►   1. Establecimiento
  Crecimiento vegetativo   ──────────►   2- Crecimiento Vegetativo
  Inducción de yemas       ──────────►   3- Inducción de yemas
  Floración            ──┐
                         ├──────────►   4- Floración y cuajado     ◄── ¿FUSIÓN?
  Cuaja                ──┘
  Llenado de fruto         ──────────►   5- Crecimiento y Llenado del Fruto
  Cosecha                  ──────────►   6- Cosecha
  Post-cosecha             ──────────►   7- Post-Cosecha y Acumulación de Reservas
  Poda                     ──────────►   8- Poda
```

Hoy está cargado el listado de **8** (Hoja1), que es el único que trae las opciones de cada labor.
Los 9 de la otra hoja quedaron registrados **sin fusionar**: no decidimos nosotros.

### Las labores

```
  Solo "Manejos por estado"   │   En ambas   │   Solo "Hoja1"
            19                │      10      │        16
     (sin opciones)           │              │   (con opciones)
```

**CERRADO**: gobierna Hoja1. Las 19 labores de la otra hoja quedan fuera. Los 4 pares que parecen
la misma labor con dos nombres (Pinchado / Pinchado-despunte · Segregación de plantas / …por vigor
· Limpieza de cañas / …basales · Poda / Poda post-cosecha) dejan de ser un problema: solo entran
los nombres de Hoja1.

*(Listado completo de las 19 y las 16 en el anexo A.)*

---

## Bloque 2 · El alcance: ¿del informe o de cada variedad?

Un informe ahora puede llevar varias variedades. Con un solo alcance no se sabe cuánto le toca a
cada una.

```
  Informe con 3 variedades
  ┌──────────────────────────────────────────┐
  │  Alcance evaluado: 8.400 plantas         │   ¿es del informe completo…
  │                                          │
  │  · Biloxi                                │   …o hay que declarar
  │  · Ventura                               │      uno por variedad?
  │  · Emerald                               │
  └──────────────────────────────────────────┘
```

Misma pregunta para el **estado fenológico predominante**: ¿uno para todo el informe o uno por
variedad? El nombre nuevo sugiere uno solo.

**Ya resuelto, no hace falta decidirlo:**
- Los informes antiguos con "Superficie evaluada (há)" conservan ese dato **como alcance válido en
  hectáreas**, con su procedencia a la vista. No se declara indefinido por ser antiguo.
- Ese dato **no se reparte por variedad** ni se convierte a plantas.
- Cambiarle el significado (pasarlo a plantas, cambiarle el valor) sí pide confirmación explícita.

---

## Bloque 3 · Unidades que el Excel no trae

| Campo | Falta | Estado hoy |
|---|---|---|
| CE | la unidad (¿dS/m?) | Se guardaría como número sin unidad |
| Frecuencia de pasadas | sobre qué (¿por semana?) | Igual |
| Número de tocones | la base (¿por planta, por metro, por cuartel?) | Igual |
| Densidad de plantación | la unidad oficial (¿plantas/ha?) | La unidad se escribe a mano; si falta dice "sin definir" |

Ninguna se inventó. Los tres primeros son respuestas de labores que aún no se muestran, así que no
bloquean.

---

## Bloque 4 · Campos dudosos dentro de "Hoja1"

| Qué | Por qué llama la atención |
|---|---|
| "Polinización / colmenas" | Pide cuadro de macronutrientes en dos estados. Parece copiado de Fertilización |
| Fertilización | N/P/K/Ca/Mg se enumeran solo en Establecimiento |
| "Uniformidad establecimiento" | Su única opción es "Comentarios (Segregación de plantas por vigor)" |
| Biometría | Solo dice "Comentarios", sin campos |
| Estados 5, 6 y 7 | Tienen menos labores que sus pares |
| Observación + Recomendación | Esas labores no llevan "Comentarios" como el resto |
| "Fecha realizacion" | No dice si es obligatoria al marcar "Realizado". Hoy es opcional |
| Columna "Reemplazar por" | Vacía en las 55 filas de la hoja simple |

---

## Lo que ya está cerrado y no necesita decisión

- La frase de responsabilidad va en el cuerpo del correo, exacta y una sola vez.
- El alcance se muestra siempre con su unidad y **nunca** se convierte de hectáreas a plantas ni al
  revés, ni siquiera con la densidad cargada.
- Los valores históricos se conservan: estados y labores antiguos, la variedad única, la superficie
  en hectáreas con su procedencia. La pantalla avisa cuando un valor guardado no está en el catálogo
  nuevo.
- Selección múltiple de variedades, conservando el campo de variedad única para lo ya emitido.
- Sistema productivo y sustrato quedan como texto libre, sin catálogo inventado.

---

# Anexo A · Detalle de las labores

**Solo en "Manejos por estado" (19)** — sin opciones definidas:
Segregación de plantas por vigor · Amarre / tutoreo · Limpieza de maceta · Pinchado / despunte ·
Limpieza de cañas basales · Ajuste de carga · Deshoje · Control de Botrytis · Limpieza de cañas ·
Raleo de fruto · Malla / sombreo · Personal de cosecha · Limpieza de plantas · Descarte en campo ·
Poda post-cosecha · Manejo evergreen · Riego post-cosecha · Compensadores de frío ·
Preparación de riego

**Solo en "Hoja1" (16)** — con opciones:
Uniformidad establecimiento · Revisión emisión de raíces · Revisión emisión de brotes ·
Revisión % de humedad del sustrato · Fertilización · CE · Pinchado · Poda limpieza de brotes débiles ·
Biometría · Revisión estado de raíces · Ajustes mediante aplicaciones foliares ·
Revisión firmeza, calibres y ajustes nutricionales · Revisión estado de las plantas ·
Ajuste fase nutricional · Número de tocones · Uso de tirasavia

**En las dos (10)**:
Riego de establecimiento · Control de malezas · Monitoreo de plagas · Desflore ·
Polinización / colmenas · Frecuencia de pasadas · Cadena de frío en campo · Poda ·
Segregación de plantas · Limpieza de cuartel

# Anexo B · Tipos de respuesta modelados

| Tipo | Cubre |
|---|---|
| Opción única | Bajo/Adecuado/Excesivo · Presencia/Ausencia · Baja/Adecuada/Óptima · Realizado/Pendiente/No aplica · Sanas/Deficientes |
| Número | CE, frecuencia de pasadas, número de tocones. Sin unidad mientras no se defina |
| Macronutrientes | Cuadro por nutriente (N/P/K/Ca/Mg donde el Excel los enumera) |
| Observación + Recomendación | Dos textos libres |
| Comentario | Un texto libre |

`pideFecha` y `pideComentario` son marcas derivadas de "Fecha realizacion" y "Comentarios", no tipos
aparte.
