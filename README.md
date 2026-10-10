# dibusynth

Primera versión. Sintetizador experimental que convierte dibujos en música.

## Qué hace

Dibujás sobre un canvas y un barrido de línea convierte lo que dibujaste en sonido. La posición vertical (eje Y) determina el tono: arriba es agudo, abajo es grave. El color del trazo determina el timbre.

## Cómo usarlo

1. Elegí un color en la fila de swatches
2. Dibujá sobre el canvas (lápiz, línea, círculo)
3. Activá uno o más barridos (→ ← ↓ ↑) con sus botones
4. Presioná ▶ para reproducir

## Controles

- **Herramientas**: lápiz, línea plana, línea punteada, círculo, borrador
- **Deshacer / limpiar**: ↩ y ✕
- **BPM**: velocidad de los barridos
- **Vol**: volumen general
- **Grid**: cuantiza el dibujo a una grilla (se puede activar/desactivar; el dibujo original se restaura al apagar)
- **Color de fondo**: dos pickers + dirección del degradé
- **Timbre por color**: mantené presionado un swatch (o click derecho) para editar la síntesis de ese color — onda, octava, filtro, release, detune, volumen

## Correr localmente

```bash
npm install
npm start
```

Abre en `http://localhost:3000`

## Tecnologías

Vanilla JS + Web Audio API + Canvas 2D. Sin frameworks, sin build step. Compatible con GitHub Pages.
