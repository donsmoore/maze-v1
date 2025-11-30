# Mazes v1 (Three.js)

Simple browser-based maze generator that renders the final maze one wall segment at a time using Three.js. Enter the desired width/height (in cells) and click **Generate Maze** to watch every wall line appear over a white canvas.

## Tech stack
- Vanilla HTML/CSS/JS
- [Three.js](https://threejs.org/) for rendering black line segments
- Depth-first backtracking maze algorithm

## Development
Open `index.html` in a browser (or serve the folder via your preferred dev server). Adjust the inputs and click the button to create a new maze.

## Notes
- Valid maze sizes are 5–80 cells per side.
- Rendering shows each wall being drawn sequentially so larger mazes can take a few seconds.
