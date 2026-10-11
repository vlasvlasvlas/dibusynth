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
2. Dibujá sobre el canvas
3. Activá uno o más barridos (→ ← ↓ ↑)
4. Presioná ▶ para reproducir

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
