# dibusynth

Dibujá una partitura y escuchala. La altura de cada trazo elige la nota, el color elige el instrumento y una línea de barrido recorre el dibujo para tocarlo.

**[Abrir la demo](https://vlasvlasvlas.github.io/dibusynth/)** · JavaScript, Canvas y Web Audio · sin compilación

## Empezar en un minuto

1. Elegí un color en **Instrumentos**.
2. Elegí **Línea** (`—`) y arrastrá sobre el canvas para dibujar una línea horizontal.
3. En **Barridos**, activá **→**. Si no hay ningún barrido activo al tocar Play, se activa **→** automáticamente.
4. Tocá **▶**. En celulares, ese toque también habilita el audio del navegador.
5. Dibujá otra línea más arriba: va a sonar más aguda. Usá otro color para sumar otro instrumento.
6. Ajustá **BPM** para cambiar la velocidad y **Volumen** para controlar la mezcla general. **⏸** pausa la reproducción.

Para una primera prueba tranquila, usá un solo barrido y dos o tres líneas. Después sumá círculos, diagonales y otras direcciones.

**El dibujo y los cambios hechos con los controles viven en la sesión: recargar la página los pierde.** Por ahora no hay guardado del dibujo, exportación de audio ni escritura automática de YAML desde la interfaz.

## Abrirlo en tu computadora

Necesitás Node.js y npm. Desde la carpeta del proyecto:

```bash
npm install
npm start
```

Abrí la dirección que indique el servidor, normalmente [localhost:3000](http://localhost:3000). Si ese puerto está ocupado, usá el que aparezca en la terminal.

Usá un servidor HTTP: abrir `index.html` con doble clic puede impedir que el navegador cargue los YAML. Para probar en un celular de la misma red, usá la dirección de red que muestre el servidor; `localhost` en el celular apunta al propio celular, no a tu computadora.

Los YAML se vuelven a leer al recargar. No hace falta compilar ni reiniciar el servidor para cambiar sus valores. Editar tu copia local no modifica la demo publicada; para eso hay que publicar esos archivos en tu alojamiento.

## Qué hace cada grupo de controles

| Grupo | Cómo se usa |
|---|---|
| **Reproducción** | ▶/⏸ inicia o pausa. −/+ cambia el BPM. Volumen controla la salida general. |
| **Barridos** | Las flechas activan lecturas independientes del mismo dibujo. Debajo de cada flecha está su volumen; se habilita al activar ese barrido. |
| **Dibujo** | Elegí una herramienta y arrastrá sobre el canvas. Deshacer quita el último trazo; ✕ borra todos los trazos. |
| **Instrumentos** | Tocá un color para dibujar con él. **M** silencia ese color en los barridos. **Timbre del color** edita el color seleccionado. |
| **Composición** | Tono y Escala eligen las notas disponibles. Cuantizar ajusta el dibujo a celdas. Guías muestra divisiones visuales. |
| **Fondo** | Los dos selectores eligen los colores del fondo. ↕/↔ cambia la orientación del degradado. No modifica el sonido. |

En celular, dibujá con un dedo sobre el canvas y desplazá verticalmente el panel para acceder a todos los controles. Los paneles de timbre y punteado se cierran con ✕, tocando fuera o con Escape en un teclado. Activar barridos no cambia la altura del canvas.

### Herramientas

| Herramienta | Resultado y opciones |
|---|---|
| ✏ | Dibujo libre; un toque sin arrastrar crea un punto que también suena. Opciones permite cambiar el grosor. |
| — | Línea recta. Opciones permite elegir continua o punteada, grosor y separación. |
| + | Elegí círculo, cuadrado, triángulo, estrella o texto en Opciones. |
| Balde | Elegí un color y tocá un trazo existente: cambia su color y su sonido. No rellena interiores. Si se superponen, toma el de arriba. |
| Borrar | Elimina trazos completos. Su tamaño se ajusta en Opciones. |
| Opciones | Ajustes de la herramienta seleccionada. También abre con clic derecho o pulsación larga sobre la herramienta. |
| ↩ | Deshace hasta 100 operaciones de dibujo, cambio de color, borrado o limpieza. |
| ✕ | Limpia el dibujo y las anotaciones. |

Cada herramienta conserva sus opciones durante la sesión. El grosor se aplica a los próximos trazos; las líneas y figuras comparten grosor. Para círculos, triángulos y estrellas, arrastrá desde el centro hacia afuera. Para cuadrados, arrastrá desde una esquina.

Para escribir, seleccioná **+ → Opciones → Texto**, escribí la anotación y elegí su tamaño. Cerrá las opciones y tocá el canvas para colocarla. El texto suena según su posición vertical, no se cuantiza y se puede borrar o recolorear.

El botón **?** abre la información del proyecto y su enlace a GitHub en un modal. Se cierra con ✕, Escape o tocando fuera, sin cambiar el tamaño del canvas.

El espaciado del punteado se guarda en cada línea al dibujarla. Cambiarlo no modifica las anteriores. **Hoy los guiones son visuales: sus huecos no se convierten en silencios.** El motor lee esa línea como un segmento continuo.

## Cómo se convierte el dibujo en sonido

La posición **Y** siempre determina la nota: arriba es más agudo y abajo más grave. Se elige una nota de la escala, incluso con Cuantizar apagado; no hay un deslizamiento continuo entre todas las frecuencias.

Con los valores iniciales, **C + Major** ocupa cuatro octavas, desde **Si6 arriba hasta Do3 abajo**, antes de aplicar la octava propia del instrumento. Las líneas horizontales tenues marcan las separaciones entre octavas.

| Barrido | Lectura del dibujo |
|---|---|
| → / ← | Recorre columnas. Las distintas alturas que encuentra en una columna pueden sonar juntas. Una línea horizontal sostiene una nota; una diagonal recorre notas; una vertical puede formar un acorde al cruzarla. |
| ↓ / ↑ | Recorre filas. Los colores encontrados en la misma fila comparten la nota base de esa altura, con sus propios ajustes de octava y afinación. Una línea vertical recorre notas sucesivas; una horizontal se cruza brevemente. |

Cada barrido tiene su propia lectura y volumen. Podés combinar los cuatro. Una intersección continua de la misma nota y color mantiene el sonido; al abandonarla empieza su **release**, o cola de salida.

Por defecto, una vuelta completa dura **4 tiempos**. A 80 BPM tarda aproximadamente 3 segundos:

```text
segundos por vuelta = beatsPerSweep × 60 / BPM
```

`music.beatsPerSweep` permite cambiar esa duración desde YAML. **Guías** solamente divide visualmente el ancho del canvas: elegir 8 guías no cambia el BPM ni la duración de la vuelta.

### Cuantizar

El checkbox ajusta la representación sonora a celdas; el slider define su tamaño en píxeles. No es una cuantización rítmica a corcheas o semicorcheas.

Al activar y desactivar Cuantizar sobre un dibujo existente se recuperan sus puntos originales. Si dibujás con Cuantizar ya activo, los puntos se capturan ajustados desde el principio. En algunos trazos, la geometría visible y la representación sonora cuantizada pueden diferir.

### Editar un instrumento

Seleccioná el color y abrí **Timbre del color**. Elegí un preset del desplegable o ajustá onda, octava, filtro, cola, afinación y volumen. Cada modificación reproduce una nota de prueba basada en La4 (440 Hz), con la octava y afinación de ese instrumento.

Los controles afectan a todos los trazos de ese color durante la sesión. **M** excluye ese color de los barridos; las colas ya iniciadas pueden terminar de sonar. La preescucha del editor funciona aunque el color esté silenciado.

## Personalizar con YAML

Hay dos archivos, con funciones distintas:

| Archivo | Qué define |
|---|---|
| [`config.yaml`](config.yaml) | Cómo arranca tu instrumento: tempo, volumen, escala, rango, barridos, herramientas, grilla, fondo, paleta, mute y sonido inicial de cada color. |
| [`templates.yaml`](templates.yaml) | Biblioteca de presets de síntesis. Sus claves se pueden usar desde `config.yaml` y sus nombres aparecen en el editor de timbre. |

**Todos los ajustes que podés elegir en los controles tienen un valor inicial configurable en YAML.** También hay opciones de archivo, como el grosor del lápiz, la cantidad de octavas y los tiempos por vuelta. La reproducción siempre empieza pausada: `active: true` habilita un barrido, pero todavía tenés que tocar Play.

### Flujo recomendado

1. Hacé una copia de los YAML antes de personalizarlos.
2. Editá `config.yaml` para cambiar los valores iniciales.
3. Agregá o editá sonidos en `templates.yaml` si los necesitás.
4. Guardá los archivos y recargá la página. Recordá que se pierde el dibujo actual.
5. Probá con los controles. Para conservar un ajuste de la sesión, copiá sus valores al YAML correspondiente y guardalo.

La interfaz **no escribe los archivos**. Estos definen el estado de la próxima carga; después, los controles modifican la sesión actual.

### Ejemplo: empezar más lento, con pentatónica y un solo barrido

En `config.yaml`, cambiá estas secciones:

```yaml
music:
  bpm: 70
  masterVolume: 0.5
  root: D
  scale: pentatonicm
  octaves: 3
  baseOctave: 2
  beatsPerSweep: 8

sweeps:
  lr: { active: true, volume: 0.5 }
  rl: { active: false, volume: 0.6 }
  tb: { active: false, volume: 0.6 }
  bt: { active: false, volume: 0.6 }
```

Una vuelta dura ahora unos 6,86 segundos. Las propiedades omitidas conservan sus valores de respaldo; no hace falta repetir todo el archivo para personalizar unas pocas opciones.

### Referencia de `config.yaml`

#### Música

| Clave bajo `music` | Inicial | Valores permitidos / significado |
|---|---|---|
| `bpm` | `80` | Entero entre 20 y 300. |
| `bpmStep` | `5` | Entero entre 1 y 50. Cuánto suman/restan los botones +/−. |
| `masterVolume` | `0.65` | 0–1. Volumen general. |
| `root` | `C` | `C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B`. |
| `scale` | `major` | `major`, `minor`, `pentatonicM` (mayor), `pentatonicm` (menor), `blues`, `chromatic`. Respetá mayúsculas/minúsculas. |
| `octaves` | `4` | Entero entre 1 y 4. Cantidad de octavas distribuidas en el canvas. |
| `baseOctave` | `3` | Entero entre 0 y 3. Octava de la tónica más grave, antes del ajuste de cada instrumento. |
| `beatsPerSweep` | `4` | Entero entre 1 y 32. Tiempos por vuelta de cada barrido. |

#### Barridos

Bajo `sweeps`, las claves son `lr` (→), `rl` (←), `tb` (↓) y `bt` (↑). Cada una acepta:

| Clave | Inicial | Significado |
|---|---|---|
| `active` | `false` | `true` o `false`: si el barrido está habilitado al abrir la página. |
| `volume` | `0.6` | 0–1. Volumen de ese barrido. |

#### Dibujo y guías

| Clave bajo `drawing` | Inicial | Valores permitidos / significado |
|---|---|---|
| `tool` | `pencil` | `pencil`, `line-solid`, `line-dashed`, `circle`, `square`, `triangle`, `star`, `text`, `paint`, `eraser`. |
| `selectedColor` | `"#27ae60"` | Un color que exista en `palette`. |
| `pencilWidth` | `12` | 1–24 px. Grosor del lápiz sin cuantizar; con cuantización se adapta a la celda. |
| `shapeWidth` | `3` | 1–24 px. Grosor de líneas y círculos. |
| `eraserRadius` | `24` | 4–100 px. Radio de búsqueda del borrador. |
| `dashGap` | `7` | Entero entre 2 y 50 px. Espaciado visual de las próximas líneas punteadas. |
| `quantize` | `false` | Activa o desactiva el ajuste a celdas. |
| `cellSize` | `25` | 10–80 px, en múltiplos de 5. |
| `guides` | `false` | Muestra las divisiones verticales. |
| `divisions` | `4` | `2`, `3`, `4`, `6`, `8`, `12` o `16`. Divisiones visuales del ancho. |
| `octaveGuides` | `true` | Muestra las líneas que separan octavas. |
| `text` | `""` | Anotación inicial, hasta 200 caracteres. |
| `textSize` | `24` | Tamaño de texto de 12 a 72 píxeles. |

#### Fondo

Cada recarga elige dos colores de la paleta y los mezcla con un 95 % de blanco: un degradado muy suave. Se eligen colores distintos cuando la paleta tiene al menos dos; una combinación puede repetirse por azar. Los selectores de fondo permiten cambiarlos durante la sesión. Para mantener colores fijos al recargar, poné `randomize: false`.

| Clave bajo `background` | Inicial | Valores permitidos |
|---|---|---|
| `randomize` | `true` | Elegir colores de la paleta al iniciar. `false` usa `first` y `second`. |
| `tint` | `0.05` | De `0` (blanco) a `1` (color original). Intensidad del fondo aleatorio. |
| `first` | `"#f0ebe0"` | Color hexadecimal de seis dígitos. |
| `second` | `"#ffffff"` | Color hexadecimal de seis dígitos. |
| `direction` | `to bottom` | `to bottom` (vertical) o `to right` (horizontal). |

#### Paleta e instrumentos

`palette` es una lista de **1 a 24 colores únicos**. Su orden determina el orden de los instrumentos. Si reemplazás la lista, reemplazás toda la paleta: no se agregan automáticamente los colores que omitiste.

Cada entrada admite:

| Clave | Uso |
|---|---|
| `color` | Obligatorio. Hexadecimal de seis dígitos entre comillas. |
| `label` | Nombre del instrumento, usado en ayudas y accesibilidad. Si falta, se usa el color. |
| `preset` | Clave de un sonido definido bajo `templates` en `templates.yaml`. Opcional. |
| `muted` | `true` o `false`. Inicialmente `false`. |
| `sound` | Parámetros de síntesis que reemplazan los del preset solamente para este color. Opcional. |

Ejemplo completo de una paleta de dos instrumentos:

```yaml
drawing:
  selectedColor: "#287a72"

palette:
  - color: "#287a72"
    label: Pad suave
    preset: brian_eno
    muted: false
    sound:
      octave: 0
      gain: 0.45

  - color: "#c85b45"
    label: Bajo
    preset: orig_rojo
    muted: false
    sound:
      detune: 0
      filterFreq: 900
```

El orden de aplicación es: sonido de respaldo → preset elegido → valores de `sound`. Si querés un resultado completamente definido, usá un preset completo. Los colores originales conservan su sonido incorporado si no tienen preset; un color nuevo sin preset parte del sonido verde.

### Crear tus sonidos en `templates.yaml`

Agregá una entrada **dentro del único bloque `templates:` existente**. No repitas ese encabezado al final del archivo:

```yaml
templates:
  # Conservá acá las otras entradas que quieras seguir usando.
  mi_pad:
    label: "Mi pad suave"
    waveform: triangle
    octave: -1
    detune: 0
    filterType: lowpass
    filterFreq: 1400
    filterQ: 0.7
    release: 1600
    gain: 0.55
```

Después seleccioná **Mi pad suave** en el editor de timbre, o usá `preset: mi_pad` en una entrada de `palette` para cargarlo desde el inicio.

La clave (`mi_pad`) identifica al preset; `label` es el nombre visible. Usá letras, números, guiones o guiones bajos para las claves. Las que empiezan con `orig_` aparecen en el grupo «originales»; las demás, en «inspiraciones».

### Parámetros de síntesis

Los mismos parámetros sirven en cada template y en `palette[].sound`:

| Parámetro | Valores permitidos | Qué cambia |
|---|---|---|
| `waveform` | `sine`, `triangle`, `square`, `sawtooth` | Forma de onda: seno, triángulo, cuadrada o sierra. |
| `octave` | Entero de −2 a +2 | Transposición por octavas del instrumento. |
| `detune` | −50 a +50 | Afinación fina, en cents; 100 cents equivalen a un semitono. |
| `filterType` | `none`, `lowpass`, `highpass`, `bandpass` | Sin filtro, pasa bajos, pasa altos o pasa banda. |
| `filterFreq` | 50–18000 | Frecuencia del filtro en Hz. No cambia la frecuencia de la nota. |
| `filterQ` | 0.1–20 | Resonancia/ancho de banda, según el tipo de filtro. |
| `release` | 20–3000 | Milisegundos de salida después de abandonar el trazo. No fija la duración de una nota sostenida. |
| `gain` | 0–1 | Volumen propio del instrumento. Se combina con los volúmenes de barrido y general. |

Los templates incompletos se completan con: `sine`, octava `0`, detune `0`, filtro `none`, frecuencia `2000`, Q `1`, release `400` y gain `0.75`. Es preferible escribir todos los parámetros para que el sonido quede explícito.

Para un timbre más suave, probá seno/triángulo y menor ganancia; para una cola más larga, aumentá `release`. Una sola onda con detune cambia la afinación: no agrega osciladores ni chorus. Los presets con nombres de artistas son aproximaciones simples, no emulaciones de equipos o grabaciones.

### Errores de YAML y valores de respaldo

- Usá espacios para indentar, no tabulaciones.
- Escribí los colores entre comillas: `"#27ae60"`. Sin comillas, `#` empieza un comentario.
- Usá punto decimal: `0.65`, no `0,65`.
- Escribí booleanos como `true`/`false`, sin comillas.
- No repitas una misma clave. Los nombres distinguen mayúsculas y minúsculas.
- Las referencias `preset` deben coincidir exactamente con una clave de `templates.yaml`.

Los archivos se validan antes de iniciar el instrumento. Un valor inválido se ignora y se conserva su respaldo; los valores válidos se siguen usando. Si falta un archivo o tiene un error de sintaxis, se usa un respaldo para ese archivo. La interfaz muestra un aviso y la consola del navegador detalla la ruta del ajuste problemático.

La carga tiene un tiempo límite: un YAML que no responde no debe dejar el instrumento esperando indefinidamente. El lector de YAML (`js-yaml`) se descarga desde un CDN; sin esa dependencia, la app puede iniciar con valores de respaldo, pero no aplicar tus YAML.

## Qué queda definido en el código

El YAML configura preferencias y sonidos. Las protecciones y el funcionamiento interno del motor —programación de audio, fundidos contra chasquidos, límite de voces y compresor— siguen en JavaScript. La distribución del panel y sus tamaños adaptables siguen en CSS. No son claves admitidas en los YAML.

Cambiar el tamaño de la ventana u orientación todavía puede cambiar cómo se distribuyen las alturas musicales del dibujo; las coordenadas no se guardan como una partitura independiente de la pantalla. Los paneles mantienen su espacio al activar barridos, pero eso no equivale a fijar la afinación ante cualquier redimensionamiento.

## Pruebas y estructura

```bash
node --test tests/*.test.js
```

Las pruebas de audio y configuración usan Node.js. Las de interfaz y gestos táctiles usan Chrome; se omiten si no se encuentra el navegador. Podés indicar su ejecutable con `CHROME_BIN`. La emulación táctil no reemplaza las pruebas en teléfonos físicos o Safari en iPhone.

| Archivo | Responsabilidad |
|---|---|
| `index.html` / `style.css` | Estructura y presentación de los controles. |
| `config.js` / `config.yaml` | Carga, validación y preferencias iniciales. |
| `templates.yaml` | Biblioteca de sonidos. |
| `canvas.js` | Dibujo y mapa de intersecciones sonoras. |
| `scanner.js` | Barridos y programación temporal. |
| `audio.js` | Notas, voces, envolventes y mezcla. |
| `ui.js` | Conecta los controles con el estado inicial y los motores. |

GitHub Pages publica la rama `main` mediante el workflow incluido. Los dos YAML se sirven como archivos estáticos junto con la aplicación; no requieren un servidor de configuración ni una base de datos.
