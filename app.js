import * as THREE from "https://unpkg.com/three@0.155.0/build/three.module.js";

const widthInput = document.getElementById("mazeWidth");
const heightInput = document.getElementById("mazeHeight");
const generateBtn = document.getElementById("generateBtn");
const drawPathBtn = document.getElementById("drawPathBtn");
const toggleGridCheckbox = document.getElementById("toggleGrid");
const pathDurationInput = document.getElementById("pathDuration");
const traverse3dBtn = document.getElementById("traverse3dBtn");
const fullscreenToggleBtn = document.getElementById("fullscreenToggle");
const replayBtn = document.getElementById("replayBtn");
const statusEl = document.getElementById("status");
const canvasContainer = document.getElementById("canvasContainer");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0xffffff, 1);
canvasContainer.appendChild(renderer.domElement);

const scene2D = new THREE.Scene();
const camera2D = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -10, 10);
camera2D.position.set(0, 0, 10);
camera2D.lookAt(0, 0, 0);
let scene3D = null;
let camera3D = null;
let activeScene = scene2D;
let activeCamera = camera2D;
let active3DController = null;

const mazeGroup = new THREE.Group();
const pathGroup = new THREE.Group();
scene2D.add(mazeGroup);
scene2D.add(pathGroup);
const wallMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  side: THREE.DoubleSide,
});
const pathMaterial = new THREE.MeshBasicMaterial({
  color: 0x00c853,
  side: THREE.DoubleSide,
});
const gridMaterial = new THREE.LineBasicMaterial({ color: 0xd32f2f });

let drawRequestId = null;
let currentGridWidth = 0;
let currentGridHeight = 0;
let lastTraversedPath = null;
let canvasControlsVisible = false;
function setReplayVisibility(enabled) {
  replayBtn.style.display = canvasControlsVisible && enabled ? "block" : "none";
}
function setCanvasControlsVisible(show) {
  canvasControlsVisible = show;
  fullscreenToggleBtn.style.display = show ? "block" : "none";
  setReplayVisibility(show && !!lastTraversedPath);
}
setCanvasControlsVisible(false);
const WALL_THICKNESS_PX = 10;
let gridHelperGroup = null;
let currentCells = null;
let entranceLabel = null;
let exitLabel = null;
const DIRECTIONS = [
  { dx: 0, dy: -1, wall: "top", opposite: "bottom" },
  { dx: 1, dy: 0, wall: "right", opposite: "left" },
  { dx: 0, dy: 1, wall: "bottom", opposite: "top" },
  { dx: -1, dy: 0, wall: "left", opposite: "right" },
];

function resizeRenderer() {
  const rect = canvasContainer.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  if (camera3D) {
    camera3D.aspect = width / height;
    camera3D.updateProjectionMatrix();
  }
}

window.addEventListener("resize", resizeRenderer);
resizeRenderer();

function configureCamera(gridWidth, gridHeight) {
  const margin = 0.5;
  const halfGridW = gridWidth / 2 + margin;
  const halfGridH = gridHeight / 2 + margin;
  const rect = canvasContainer.getBoundingClientRect();
  const aspect = rect.width / rect.height;

  let halfW = halfGridW;
  let halfH = halfGridH;
  if (halfW / halfH > aspect) {
    halfH = halfW / aspect;
  } else {
    halfW = halfH * aspect;
  }

  camera2D.left = -halfW;
  camera2D.right = halfW;
  camera2D.bottom = -halfH;
  camera2D.top = halfH;
  camera2D.position.set(0, 0, 10);
  camera2D.lookAt(0, 0, 0);
  camera2D.updateProjectionMatrix();
}

function clearMazeLines() {
  mazeGroup.children.slice().forEach((child) => {
    if (child.geometry) child.geometry.dispose();
    mazeGroup.remove(child);
  });
}

function clearGrid() {
  if (gridHelperGroup) {
    gridHelperGroup.children.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
    });
    scene2D.remove(gridHelperGroup);
    gridHelperGroup = null;
  }
}

function clearPath() {
  pathGroup.children.slice().forEach((child) => {
    if (child.geometry) child.geometry.dispose();
    pathGroup.remove(child);
  });
}

function clearLabels() {
  if (entranceLabel) {
    if (entranceLabel._resizeHandler) {
      window.removeEventListener("resize", entranceLabel._resizeHandler);
    }
    entranceLabel.remove();
    entranceLabel = null;
  }
  if (exitLabel) {
    if (exitLabel._resizeHandler) {
      window.removeEventListener("resize", exitLabel._resizeHandler);
    }
    exitLabel.remove();
    exitLabel = null;
  }
}

function renderGrid(width, height, { updateCamera = true, showStatus = true } = {}) {
  if (width === null || height === null) {
    statusEl.textContent = "Please enter width/height between 5 and 80.";
    return;
  }
  if (showStatus) {
    statusEl.textContent = "Drawing grid…";
  }
  clearGrid();
  if (updateCamera) {
    configureCamera(width, height);
  }

  const group = new THREE.Group();
  const createLine = (x1, y1, x2, y2) => {
    const points = [
      new THREE.Vector3(x1, y1, 0),
      new THREE.Vector3(x2, y2, 0),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, gridMaterial);
    group.add(line);
  };

  for (let x = 0; x <= width; x += 1) {
    createLine(x, 0, x, height);
  }
  for (let y = 0; y <= height; y += 1) {
    createLine(0, y, width, y);
  }

  group.position.set(-width / 2, -height / 2, 0);
  gridHelperGroup = group;
  scene2D.add(gridHelperGroup);
  if (showStatus) {
    statusEl.textContent = "Grid ready. Click Generate Maze to draw walls.";
  }
}

function renderLoop(timestamp) {
  requestAnimationFrame(renderLoop);
  if (active3DController) {
    active3DController.update(timestamp);
  }
  renderer.render(activeScene, activeCamera);
}
renderLoop();

function generateMaze(width, height) {
  const cells = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      visited: false,
      walls: { top: true, right: true, bottom: true, left: true },
    }))
  );

  const stack = [];
  cells[0][0].visited = true;
  stack.push({ x: 0, y: 0 });

  while (stack.length) {
    const current = stack[stack.length - 1];
    const neighbors = DIRECTIONS
      .map((dir) => ({
        nx: current.x + dir.dx,
        ny: current.y + dir.dy,
        wall: dir.wall,
        opposite: dir.opposite,
      }))
      .filter(
        (n) =>
          n.nx >= 0 &&
          n.nx < width &&
          n.ny >= 0 &&
          n.ny < height &&
          !cells[n.ny][n.nx].visited
      );

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    cells[current.y][current.x].walls[next.wall] = false;
    cells[next.ny][next.nx].walls[next.opposite] = false;
    cells[next.ny][next.nx].visited = true;
    stack.push({ x: next.nx, y: next.ny });
  }

  cells[0][0].walls.top = false;
  cells[height - 1][width - 1].walls.bottom = false;
  return cells;
}

function collectWallSegments(cells, width, height) {
  const segments = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = cells[y][x];
      if (cell.walls.top) {
        segments.push({ x1: x, y1: y, x2: x + 1, y2: y });
      }
      if (cell.walls.left) {
        segments.push({ x1: x, y1: y, x2: x, y2: y + 1 });
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    const isExitGap = x === width - 1 && !cells[height - 1][width - 1].walls.bottom;
    if (isExitGap) continue;
    segments.push({ x1: x, y1: height, x2: x + 1, y2: height });
  }
  for (let y = 0; y < height; y += 1) {
    segments.push({ x1: width, y1: y, x2: width, y2: y + 1 });
  }

  return segments;
}

function solveMaze(cells) {
  const height = cells.length;
  const width = cells[0].length;
  const queue = [{ x: 0, y: 0 }];
  const visited = Array.from({ length: height }, () =>
    Array(width).fill(false)
  );
  const parent = Array.from({ length: height }, () =>
    Array(width).fill(null)
  );
  visited[0][0] = true;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.x === width - 1 && current.y === height - 1) {
      break;
    }
    for (const dir of DIRECTIONS) {
      if (!cells[current.y][current.x].walls[dir.wall]) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        if (
          nx >= 0 &&
          nx < width &&
          ny >= 0 &&
          ny < height &&
          !visited[ny][nx]
        ) {
          visited[ny][nx] = true;
          parent[ny][nx] = current;
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  if (!visited[height - 1][width - 1]) {
    return null;
  }

  const path = [];
  let cursor = { x: width - 1, y: height - 1 };
  while (cursor) {
    path.push(cursor);
    cursor = parent[cursor.y][cursor.x];
  }
  return path.reverse();
}

function unitsPerPixel() {
  const size = renderer.getSize(new THREE.Vector2());
  const unitsX = (camera2D.right - camera2D.left) / size.x;
  const unitsY = (camera2D.top - camera2D.bottom) / size.y;
  return Math.max(unitsX, unitsY);
}

function addSegment(seg) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const thickness = WALL_THICKNESS_PX * unitsPerPixel();
  const geometry = new THREE.PlaneGeometry(length, thickness);
  const mesh = new THREE.Mesh(geometry, wallMaterial);
  mesh.position.set(seg.x1 + dx / 2, seg.y1 + dy / 2, 0);
  mesh.rotation.z = Math.atan2(dy, dx);
  mazeGroup.add(mesh);
}

function addPathSegment(start, end, thickness) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const geometry = new THREE.PlaneGeometry(length, thickness);
  const mesh = new THREE.Mesh(geometry, pathMaterial);
  mesh.position.set(start.x + dx / 2, start.y + dy / 2, 0.05);
  mesh.rotation.z = Math.atan2(dy, dx);
  pathGroup.add(mesh);
}

function addArrowHead(tip, preceding, thickness) {
  const direction = new THREE.Vector2(tip.x - preceding.x, tip.y - preceding.y)
    .normalize();
  const perpendicular = new THREE.Vector2(-direction.y, direction.x);
  const arrowLength = Math.max(thickness * 1.8, 0.6);
  const base = new THREE.Vector2(
    tip.x - direction.x * arrowLength,
    tip.y - direction.y * arrowLength
  );
  const left = base
    .clone()
    .add(perpendicular.clone().multiplyScalar(thickness * 0.8));
  const right = base
    .clone()
    .add(perpendicular.clone().multiplyScalar(-thickness * 0.8));

  const vertices = new Float32Array([
    tip.x,
    tip.y,
    0.06,
    left.x,
    left.y,
    0.06,
    right.x,
    right.y,
    0.06,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const arrow = new THREE.Mesh(geometry, pathMaterial);
  pathGroup.add(arrow);
}

function createGerbilMesh() {
  const group = new THREE.Group();
  const furMaterial = new THREE.MeshStandardMaterial({ color: 0xb3825a });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xfefefe });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), furMaterial);
  body.scale.set(1.8, 1, 1);
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), furMaterial);
  head.position.set(0.38, 0.03, 0);
  group.add(head);
  group.userData.head = head;

  const leftEar = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), accentMaterial);
  leftEar.position.set(0.32, 0.18, 0.09);
  const rightEar = leftEar.clone();
  rightEar.position.z *= -1;
  group.add(leftEar, rightEar);

  const tailGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.5, 12);
  const tail = new THREE.Mesh(tailGeo, furMaterial);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.65, 0, 0);
  group.add(tail);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), accentMaterial);
  nose.position.set(0.6, 0.02, 0);
  group.add(nose);

  group.position.y = 0.15;
  return group;
}

function createCardboardTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d9b188";
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 18) {
    ctx.fillStyle = "#c89968";
    ctx.fillRect(x, 0, 6, size);
    ctx.fillStyle = "#e4c199";
    ctx.fillRect(x + 6, 0, 4, size);
    ctx.fillStyle = "#cfa16d";
    ctx.fillRect(x + 10, 0, 8, size);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  for (let x = 0; x < size; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x + 1, 0);
    ctx.lineTo(x + 1, size);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}

function createLabelSprite(text) {
  const div = document.createElement("div");
  div.textContent = text;
  div.style.position = "absolute";
  div.style.color = "#111";
  div.style.fontWeight = "600";
  div.style.fontSize = "14px";
  div.style.background = "rgba(255,255,255,0.8)";
  div.style.padding = "2px 6px";
  div.style.borderRadius = "4px";
  div.style.pointerEvents = "none";
  div.style.transform = "translate(-50%, -50%)";
  canvasContainer.appendChild(div);
  return div;
}

function addEntranceExitLabels(width, height) {
  clearLabels();
  const startLabel = createLabelSprite("Start");
  const exitLabelSprite = createLabelSprite("Exit");

  const placement = () => {
    const containerRect = canvasContainer.getBoundingClientRect();
    const canvasRect = renderer.domElement.getBoundingClientRect();
    const offsetX = canvasRect.left - containerRect.left;
    const offsetY = canvasRect.top - containerRect.top;
    const project = (x, y) => {
      const worldX = (x - width / 2) / (camera2D.right - camera2D.left);
      const worldY = (y - height / 2) / (camera2D.top - camera2D.bottom);
      return {
        x:
          offsetX +
          canvasRect.width / 2 +
          worldX * canvasRect.width,
        y:
          offsetY +
          canvasRect.height / 2 -
          worldY * canvasRect.height,
      };
    };

    const startPos = project(0.5, 0.5);
    const exitPos = project(width - 0.5, height - 0.5);

    startLabel.style.left = `${startPos.x}px`;
    startLabel.style.top = `${startPos.y}px`;
    exitLabelSprite.style.left = `${exitPos.x}px`;
    exitLabelSprite.style.top = `${exitPos.y}px`;
  };

  const handler = () => requestAnimationFrame(placement);
  window.addEventListener("resize", handler);
  placement();
  startLabel._resizeHandler = handler;
  exitLabelSprite._resizeHandler = handler;
  entranceLabel = startLabel;
  exitLabel = exitLabelSprite;
}

function startDrawing(segments, gridWidth, gridHeight, onComplete) {
  currentGridWidth = gridWidth;
  currentGridHeight = gridHeight;
  if (drawRequestId) cancelAnimationFrame(drawRequestId);
  clearMazeLines();
  clearPath();
  clearLabels();
  const offsetX = -gridWidth / 2;
  const offsetY = -gridHeight / 2;
  mazeGroup.position.set(offsetX, offsetY, 0);
  pathGroup.position.set(offsetX, offsetY, 0);

  let index = 0;
  const total = segments.length;
  const perFrame = Math.max(1, Math.floor(total / 600));

  function step() {
    let drawn = 0;
    while (drawn < perFrame && index < total) {
      addSegment(segments[index++]);
      drawn += 1;
    }

    statusEl.textContent = `Drawing maze… ${index}/${total} walls`;

    if (index < total) {
      drawRequestId = requestAnimationFrame(step);
    } else {
      statusEl.textContent = `Maze complete (${total} walls).`;
      if (typeof onComplete === "function") {
        onComplete();
      }
    }
  }

  step();
}

function drawSolutionPath(cells, width, height) {
  const path = solveMaze(cells);
  if (!path || path.length < 2) {
    statusEl.textContent += " Unable to compute path.";
    return;
  }

  clearPath();
  const thickness = WALL_THICKNESS_PX * unitsPerPixel();
  const durationSeconds = Math.max(
    0.1,
    Number.isFinite(Number(pathDurationInput.value))
      ? Number(pathDurationInput.value)
      : 5
  );
  const durationMs = durationSeconds * 1000;
  const totalSegments = path.length - 1;
  let drawnSegments = 0;
  let startTime = null;

  function addNextSegment() {
    const start = {
      x: path[drawnSegments].x + 0.5,
      y: path[drawnSegments].y + 0.5,
    };
    const end = {
      x: path[drawnSegments + 1].x + 0.5,
      y: path[drawnSegments + 1].y + 0.5,
    };
    addPathSegment(start, end, thickness);
    drawnSegments += 1;
  }

  function step(timestamp) {
    if (startTime === null) {
      startTime = timestamp;
    }
    const elapsed = timestamp - startTime;
    const progress = durationMs <= 0 ? 1 : Math.min(1, elapsed / durationMs);
    const targetSegments = Math.max(
      drawnSegments,
      Math.floor(progress * totalSegments)
    );

    while (drawnSegments < targetSegments && drawnSegments < totalSegments) {
      addNextSegment();
    }

    if (drawnSegments < totalSegments) {
      requestAnimationFrame(step);
    } else {
      // ensure final segment rendered
      while (drawnSegments < totalSegments) {
        addNextSegment();
      }
      const tip = {
        x: path[path.length - 1].x + 0.5,
        y: path[path.length - 1].y + 0.5,
      };
      const previous = {
        x: path[path.length - 2].x + 0.5,
        y: path[path.length - 2].y + 0.5,
      };
      addArrowHead(tip, previous, thickness);
      statusEl.textContent += ` Path solved in ~${durationSeconds.toFixed(
        1
      )}s.`;
    }
  }

  requestAnimationFrame(step);
}

function start3DTraversal(existingPath = null) {
  if (!currentCells || active3DController) {
    return;
  }
  const gridWasVisible = !!(gridHelperGroup && gridHelperGroup.visible);
  if (gridWasVisible) {
    gridHelperGroup.visible = false;
  }
  const path = existingPath
    ? existingPath.map((p) => ({ x: p.x, y: p.y }))
    : solveMaze(currentCells);
  if (!path || path.length < 2) {
    statusEl.textContent = "Unable to solve maze for traversal.";
    traverse3dBtn.disabled = false;
    return;
  }

  const durationSeconds = Math.max(
    0.5,
    Number.isFinite(Number(pathDurationInput.value))
      ? Number(pathDurationInput.value)
      : 5
  );
  const durationMs = durationSeconds * 1000;
  traverse3dBtn.disabled = true;
  clearLabels();
  statusEl.textContent = "Preparing 3D traversal…";

  const controller = create3DTraversalController(
    path,
    currentGridWidth,
    currentGridHeight,
    durationMs,
    currentCells
  );
  active3DController = controller;
  scene3D = controller.scene;
  camera3D = controller.camera;
  activeScene = scene3D;
  activeCamera = camera3D;
  traverse3dBtn.disabled = true;
  setCanvasControlsVisible(true);
  lastTraversedPath = path.map((p) => ({ x: p.x, y: p.y }));
  setReplayVisibility(true);

  controller.onComplete = () => {
    active3DController = null;
    traverse3dBtn.disabled = false;
    if (gridHelperGroup) {
      gridHelperGroup.visible = gridWasVisible && toggleGridCheckbox.checked;
    }
    statusEl.textContent = "3D traversal complete. You are now in 3D view.";
  };
}

function create3DTraversalController(path, width, height, durationMs, cells) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f6fb);
  const camera = new THREE.PerspectiveCamera(
    60,
    renderer.domElement.width / renderer.domElement.height || 1,
    0.1,
    100
  );

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(6, 10, 6);
  scene.add(ambient, dir);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xfdfaf2,
    roughness: 0.95,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width + 2, height + 2), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  const cardboardTexture = createCardboardTexture();
  cardboardTexture.wrapS = cardboardTexture.wrapT = THREE.RepeatWrapping;
  cardboardTexture.repeat.set(Math.max(2, width / 4), Math.max(3, height / 2));
  const wallMaterial3D = new THREE.MeshStandardMaterial({
    map: cardboardTexture,
    roughness: 0.8,
    metalness: 0.05,
  });

  const wallSegments = collectWallSegments(cells, width, height);
  const baseHeight = Math.max(0.8, Math.min(1.5, Math.max(width, height) / 8));
  const wallHeight = baseHeight * 0.5;
  const wallThickness = 0.08;
  for (const seg of wallSegments) {
    const dx = seg.x2 - seg.x1;
    const dz = seg.y2 - seg.y1;
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length === 0) continue;
    const geometry = new THREE.BoxGeometry(length, wallHeight, wallThickness);
    const mesh = new THREE.Mesh(geometry, wallMaterial3D);
    mesh.position.set(
      (seg.x1 + seg.x2) / 2 - width / 2,
      wallHeight / 2,
      (seg.y1 + seg.y2) / 2 - height / 2
    );
    mesh.rotation.y = Math.atan2(dz, dx);
    scene.add(mesh);
  }

  const pathPoints = path.map((p) =>
    new THREE.Vector3(
      p.x + 0.5 - width / 2,
      0,
      p.y + 0.5 - height / 2
    )
  );
  const axisY = new THREE.Vector3(0, 1, 0);
  const gerbil = createGerbilMesh();
  const entranceDir =
    pathPoints.length > 1
      ? pathPoints[1].clone().sub(pathPoints[0]).normalize()
      : new THREE.Vector3(1, 0, 0);
  const gerbilStart = pathPoints[0].clone().sub(entranceDir.clone().multiplyScalar(0.4));
  gerbil.position.set(gerbilStart.x, 0.12, gerbilStart.z);
  const entranceYaw = Math.atan2(entranceDir.x, entranceDir.z);
  gerbil.setRotationFromAxisAngle(axisY, entranceYaw - Math.PI / 2);
  if (gerbil.userData.head) {
    gerbil.userData.head.setRotationFromAxisAngle(axisY, 0);
  }
  scene.add(gerbil);

  let curve;
  if (pathPoints.length >= 3) {
    curve = new THREE.CatmullRomCurve3(pathPoints, false, "catmullrom", 0.2);
  } else {
    curve = new THREE.LineCurve3(pathPoints[0], pathPoints[pathPoints.length - 1]);
  }

  const overviewDuration = 1700;
  const approachDuration = 1800;
  const totalSegments = pathPoints.length - 1;

  let startTime = null;
  let completed = false;

  const entranceLook = pathPoints[0].clone();
  const isoPosition = new THREE.Vector3(
    width * 0.8,
    Math.max(width, height) * 1.3,
    height * 0.8
  );
  const isoLookTarget = new THREE.Vector3(0, 0, 0);
  camera.position.copy(isoPosition);
  camera.lookAt(isoLookTarget);

  const controller = {
    scene,
    camera,
    onComplete: () => {},
    update(timestamp) {
      if (completed) {
        return;
      }
      if (startTime === null) {
        startTime = timestamp;
      }
      const elapsed = timestamp - startTime;

      if (elapsed < overviewDuration) {
        const spin = (elapsed / overviewDuration) * (Math.PI / 9);
        const orbitPos = isoPosition
          .clone()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), spin);
        camera.position.copy(orbitPos);
        camera.lookAt(isoLookTarget);
        return;
      }

      if (elapsed < overviewDuration + approachDuration) {
        const phase = (elapsed - overviewDuration) / approachDuration;
        const closeCam = new THREE.Vector3(
          pathPoints[0].x - entranceDir.x * 1.2,
          1.4,
          pathPoints[0].z - entranceDir.z * 1.2
        );
        const approachPos = isoPosition.clone().lerp(closeCam, Math.min(1, Math.max(0, phase)));
        camera.position.copy(approachPos);
        const lookTarget = pathPoints[0].clone();
        lookTarget.y = 0.15;
        camera.lookAt(lookTarget);
        return;
      }

      const travelElapsed = elapsed - overviewDuration - approachDuration;
      const travelProgress = durationMs <= 0 ? 1 : Math.min(1, travelElapsed / durationMs);
      const curvePoint = curve.getPoint(Math.max(0, Math.min(1, travelProgress)));
      const tangent = curve.getTangent(Math.max(0, Math.min(1, travelProgress))).normalize();
      const gerbilTarget = new THREE.Vector3(curvePoint.x, 0.12, curvePoint.z);
      gerbil.position.lerp(gerbilTarget, 0.4);

      if (tangent.lengthSq() > 0) {
        const yaw = Math.atan2(tangent.x, tangent.z);
        const targetQuat = new THREE.Quaternion().setFromAxisAngle(axisY, yaw);
        const facingQuat = targetQuat.multiply(
          new THREE.Quaternion().setFromAxisAngle(axisY, -Math.PI / 2)
        );
        gerbil.quaternion.slerp(facingQuat, 0.12);
      }

      const behind = tangent.clone().multiplyScalar(-1.1);
      const desiredCameraPos = gerbil.position.clone().add(behind);
      desiredCameraPos.y += 1.4;
      camera.position.copy(desiredCameraPos);
      const lookTarget = gerbil.position.clone();
      lookTarget.y += 0.25;
      camera.lookAt(lookTarget);
      if (travelProgress >= 1) {
        completed = true;
        this.onComplete();
      }
    },
  };

  controller.pathSnapshot = path.map((p) => ({ x: p.x, y: p.y }));
  return controller;
}

function validateDimension(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 5 || num > 80) {
    return null;
  }
  return Math.floor(num);
}

generateBtn.addEventListener("click", () => {
  const width = validateDimension(widthInput.value);
  const height = validateDimension(heightInput.value);

  if (width === null || height === null) {
    statusEl.textContent = "Please enter width/height between 5 and 80.";
    traverse3dBtn.disabled = true;
    return;
  }

  statusEl.textContent = "Generating maze…";
  activeScene = scene2D;
  activeCamera = camera2D;
  active3DController = null;
  scene3D = null;
  camera3D = null;

  requestAnimationFrame(() => {
    currentCells = generateMaze(width, height);
    const segments = collectWallSegments(currentCells, width, height);
    configureCamera(width, height);
    startDrawing(segments, width, height, () => addEntranceExitLabels(width, height));
    if (toggleGridCheckbox.checked) {
      renderGrid(width, height, { updateCamera: false, showStatus: false });
    }
    traverse3dBtn.disabled = false;
    lastTraversedPath = null;
    setCanvasControlsVisible(false);
  });
});

toggleGridCheckbox.addEventListener("change", () => {
  if (toggleGridCheckbox.checked) {
    const width = currentGridWidth || validateDimension(widthInput.value);
    const height = currentGridHeight || validateDimension(heightInput.value);
    if (width === null || height === null) {
      statusEl.textContent = "Please enter width/height between 5 and 80.";
      toggleGridCheckbox.checked = false;
      return;
    }
    renderGrid(width, height, {
      updateCamera: !currentCells,
      showStatus: Boolean(!currentCells),
    });
  } else {
    clearGrid();
    statusEl.textContent = "Grid hidden.";
  }
});

drawPathBtn.addEventListener("click", () => {
  if (!currentCells) {
    statusEl.textContent = "Generate a maze first.";
    return;
  }
  statusEl.textContent = "Drawing path…";
  drawSolutionPath(currentCells, currentGridWidth, currentGridHeight);
});

traverse3dBtn.addEventListener("click", () => {
  if (traverse3dBtn.disabled) {
    return;
  }
  start3DTraversal();
});

replayBtn.addEventListener("click", () => {
  if (active3DController) {
    statusEl.textContent = "Traversal already in progress.";
    return;
  }
  if (!lastTraversedPath || lastTraversedPath.length < 2) {
    statusEl.textContent = "Run a traversal first.";
    return;
  }
  start3DTraversal(lastTraversedPath);
  statusEl.textContent = "Replaying traversal…";
});

function handleDimensionChange() {
  if (!toggleGridCheckbox.checked) {
    return;
  }
  const width = validateDimension(widthInput.value);
  const height = validateDimension(heightInput.value);
  if (width === null || height === null) {
    return;
  }
  renderGrid(width, height, {
    updateCamera: !currentCells,
    showStatus: false,
  });
}

widthInput.addEventListener("change", handleDimensionChange);
heightInput.addEventListener("change", handleDimensionChange);

fullscreenToggleBtn.addEventListener("click", async () => {
  const isFullscreen = document.fullscreenElement !== null;
  if (!isFullscreen) {
    try {
      await canvasContainer.requestFullscreen();
      fullscreenToggleBtn.setAttribute("aria-pressed", "true");
      fullscreenToggleBtn.textContent = "Exit Fullscreen";
    } catch (err) {
      console.error("Failed to enter fullscreen:", err);
    }
  } else {
    await document.exitFullscreen();
    fullscreenToggleBtn.setAttribute("aria-pressed", "false");
    fullscreenToggleBtn.textContent = "Fullscreen";
  }
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    fullscreenToggleBtn.setAttribute("aria-pressed", "false");
    fullscreenToggleBtn.textContent = "Fullscreen";
  } else {
    fullscreenToggleBtn.setAttribute("aria-pressed", "true");
    fullscreenToggleBtn.textContent = "Exit Fullscreen";
  }
});

const initialWidth = validateDimension(widthInput.value);
const initialHeight = validateDimension(heightInput.value);
if (toggleGridCheckbox.checked && initialWidth && initialHeight) {
  renderGrid(initialWidth, initialHeight, { updateCamera: true, showStatus: false });
}
