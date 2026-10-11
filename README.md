# dibusynth

Sintetizador experimental que convierte dibujos en música. Primera versión en desarrollo.

**Demo:** https://vlasvlasvlas.github.io/dibusynth/

---

## Qué hace

Dibujás sobre un canvas y un barrido de línea lo convierte en sonido en tiempo real.

- **Eje Y** → tono (arriba = agudo, abajo = grave)
- **Color del trazo** → timbre (cada color tiene su propio sintetizador)
- **Barridos** → la línea puede recorrer el canvas en 4 direcciones, de forma independiente

## Cómo usarlo

1. Elegí un color en la fila de swatches
2. Dibujá sobre el canvas (trazos libres, líneas, círculos)
3. Activá uno o más barridos con sus botones de dirección
4. Ajustá el BPM y el volumen de cada barrido
5. Presioná ▶ para reproducir

## Los barridos (secuenciadores)

Hay 4 barridos independientes que recorren el canvas y convierten el dibujo en notas. Cada uno tiene su propio botón de activación y un slider de volumen que aparece al encenderlo.

| Botón | Dirección | Eje | Cómo lee el dibujo |
|-------|-----------|-----|--------------------|
| → | Izquierda a derecha | Horizontal | Barre columna por columna de izquierda a derecha. La altura (Y) de cada trazo en esa columna determina el tono. |
| ← | Derecha a izquierda | Horizontal | Igual que →, pero en sentido inverso. Produce la misma melodía al revés. |
| ↓ | Arriba a abajo | Vertical | Barre fila por fila de arriba a abajo. El tono lo determina la posición Y de la línea horizontal que cruza. |
| ↑ | Abajo a arriba | Vertical | Igual que ↓, pero en sentido inverso. |

**Todos los barridos comparten el mismo BPM central.** Un barrido completo dura 4 tiempos (beats). A 90 BPM eso es un ciclo cada ~2.7 segundos.

**Se pueden activar varios a la vez.** Combinados crean texturas polifónicas: → y ← tocan la misma melodía en direcciones opuestas; ↓ y ↑ leen el canvas por otro eje. Cuatro activos simultáneamente generan hasta 4 lecturas independientes del mismo dibujo.

**Cada barrido tiene su propio volumen.** El slider aparece debajo del botón cuando el barrido está activo. Útil para mezclar: por ejemplo, el barrido → fuerte como melodía principal y ↓ suave como textura de fondo.

**Las notas se sostienen** mientras la línea de barrido está sobre un trazo, y se liberan cuando la abandona. No hay retriggering: un trazo largo suena como nota larga, no como pulsos repetidos.

**El BPM afecta la velocidad de todos los barridos a la vez.** Podés cambiarlo con los botones − y + mientras está reproduciendo.

### Cómo afecta el dibujo a cada barrido

- **Trazos horizontales** suenan como notas largas y sostenidas en los barridos → y ←, y como muchas notas distintas en los barridos ↓ y ↑ (cada fila que cruzan tiene su propia altura Y).
- **Trazos verticales** suenan como glissandos o escalas en los barridos → y ←, y como notas largas en ↓ y ↑.
- **Trazos diagonales** producen melodías ascendentes o descendentes en todos los barridos.
- **Círculos** generan patrones rítmicos y melódicos que se repiten a medida que la línea los cruza.
- **Múltiples colores en la misma columna o fila** suenan simultáneamente (polifonía). Cada color usa su propio sintetizador.

### Relación entre posición Y y tono

El canvas está dividido verticalmente en notas de la escala seleccionada, distribuidas en 4 octavas:

```
Arriba del canvas  →  notas agudas (octava alta)
Abajo del canvas   →  notas graves (octava baja)
```

Con la escala en C mayor, por ejemplo, el canvas de arriba a abajo recorre algo así como Do5 → Si4 → La4 → ... → Re2 → Do2.

## Herramientas de dibujo

| Botón | Función |
|-------|---------|
| ✏ | Lápiz libre |
| — | Línea plana |
| ╌ | Línea punteada |
| ○ | Círculo |
| ◻ | Borrador |
| ↩ | Deshacer |
| ✕ | Limpiar todo |

## Configuración de sonido

**Clave y escala** — seleccioná la tonalidad (C, D, etc.) y el modo (mayor, menor, pentatónica, blues, cromática).

**Grid (cuantize)** — activa una grilla que cuantiza el dibujo a celdas. Con grid ON los saltos son discretos; con grid OFF el dibujo se restaura y el glissando es continuo píxel a píxel.

**Timbre por color** — mantenés presionado un swatch (o hacés clic en ⚙) para abrir el editor de síntesis de ese color:
- **onda**: sine / triangle / square / sawtooth
- **oct**: octava (-2 a +2)
- **filtro**: off / lpf / hpf / bpf, con cutoff y resonancia
- **rel**: tiempo de release
- **det**: detune en cents
- **vol**: ganancia del color

**Templates** — el dropdown en el editor de timbre carga presets desde `templates.yaml`. Incluye los originales de dibusynth y presets inspirados en Vangelis, Blade Runner, Laurie Spiegel, Kraftwerk, Daft Punk, Brian Eno y Gary Numan. Podés agregar los tuyos editando el archivo.

## Correr localmente

```bash
npm install
npm start
```

Abre en `http://localhost:3000`

## Agregar templates propios

Editá `templates.yaml` en la raíz del repo. Cada template lleva:

```yaml
templates:
  mi_template:
    label: "Mi template"
    waveform: sine        # sine | triangle | square | sawtooth
    octave: 0             # -2 .. 2
    detune: 0             # cents
    filterType: lowpass   # none | lowpass | highpass | bandpass
    filterFreq: 2000      # Hz
    filterQ: 1            # 0.1 .. 20
    release: 400          # ms
    gain: 0.75            # 0 .. 1
```

## Tecnologías

Vanilla JS · Web Audio API · Canvas 2D · sin frameworks · sin build step · compatible con GitHub Pages.
