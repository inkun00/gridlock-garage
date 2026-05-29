import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { PUZZLES } from "./puzzles.js";

const BOARD_SIZE = 6;
const CELL = 1.1;
const BOARD_OFFSET = ((BOARD_SIZE - 1) * CELL) / 2;
const STORAGE_KEY = "gridlock-garage-leaderboards";
const stageCache = new Map();

const state = {
  stageId: 1,
  vehicles: [],
  selected: null,
  history: [],
  moves: 0,
  startedAt: Date.now(),
  elapsedMs: 0,
  cleared: false,
  drag: null,
  walls: [],
  minimumMoves: 0,
};

const colors = ["#6fb7a6", "#e3b14b", "#8ab6d6", "#775f9b", "#ef8a5b", "#5f8fce", "#7d9a57"];
const host = document.querySelector("#sceneHost");
const stageGrid = document.querySelector("#stageGrid");
const leaderboardList = document.querySelector("#leaderboardList");
const stageLabel = document.querySelector("#stageLabel");
const timerLabel = document.querySelector("#timerLabel");
const moveLabel = document.querySelector("#moveLabel");
const difficultyLabel = document.querySelector("#difficultyLabel");
const undoButton = document.querySelector("#undoButton");
const resetButton = document.querySelector("#resetButton");
const nextButton = document.querySelector("#nextButton");
const clearDialog = document.querySelector("#clearDialog");
const clearTitle = document.querySelector("#clearTitle");
const clearSummary = document.querySelector("#clearSummary");
const clearReplayButton = document.querySelector("#clearReplayButton");
const clearNextButton = document.querySelector("#clearNextButton");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#dfe4dc");

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(4.9, 7.2, 7.1);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.maxPolarAngle = Math.PI * 0.44;
controls.minPolarAngle = Math.PI * 0.24;
controls.minDistance = 7;
controls.maxDistance = 12;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const vehicleGroup = new THREE.Group();
const wallGroup = new THREE.Group();
const highlightGroup = new THREE.Group();
scene.add(vehicleGroup, wallGroup, highlightGroup);

setupLights();
buildBoard();
buildStages();
loadStage(1);
resize();
animate();

window.addEventListener("resize", resize);
renderer.domElement.addEventListener("pointerdown", onPointerDown);
renderer.domElement.addEventListener("pointermove", onPointerMove);
renderer.domElement.addEventListener("pointerup", onPointerUp);
renderer.domElement.addEventListener("pointercancel", onPointerUp);
undoButton.addEventListener("click", undo);
resetButton.addEventListener("click", () => loadStage(state.stageId));
nextButton.addEventListener("click", () => loadStage(Math.min(100, state.stageId + 1)));
clearReplayButton.addEventListener("click", () => loadStage(state.stageId));
clearNextButton.addEventListener("click", () => loadStage(Math.min(100, state.stageId + 1)));

function setupLights() {
  scene.add(new THREE.HemisphereLight("#ffffff", "#66736d", 2.2));
  const key = new THREE.DirectionalLight("#ffffff", 2.4);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);
}

function buildBoard() {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_SIZE * CELL + 0.9, 0.24, BOARD_SIZE * CELL + 0.9),
    new THREE.MeshStandardMaterial({ color: "#575f5a", roughness: 0.72, metalness: 0.05 })
  );
  floor.position.y = -0.17;
  floor.receiveShadow = true;
  scene.add(floor);

  const tileMaterial = new THREE.MeshStandardMaterial({ color: "#747d77", roughness: 0.68 });
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.94, 0.08, CELL * 0.94), tileMaterial);
      tile.position.set(toX(col), -0.02, toZ(row));
      tile.receiveShadow = true;
      scene.add(tile);
    }
  }

  const exit = new THREE.Mesh(
    new THREE.BoxGeometry(CELL * 1.2, 0.1, CELL * 0.7),
    new THREE.MeshStandardMaterial({ color: "#d64235", emissive: "#52110d", emissiveIntensity: 0.25 })
  );
  exit.position.set(toX(BOARD_SIZE - 1) + CELL * 0.96, 0.03, toZ(2));
  exit.receiveShadow = true;
  scene.add(exit);

  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 14),
    new THREE.MeshStandardMaterial({ color: "#cbd1c9", roughness: 0.95 })
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.34;
  table.receiveShadow = true;
  scene.add(table);
}

function buildStages() {
  for (let i = 1; i <= 100; i += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = i;
    button.addEventListener("click", () => loadStage(i));
    stageGrid.appendChild(button);
  }
}

function makeStage(stageId) {
  const puzzle = PUZZLES[stageId - 1];
  if (!stageCache.has(stageId)) {
    stageCache.set(stageId, parsePuzzle(stageId, puzzle));
  }
  const parsed = stageCache.get(stageId);
  return {
    vehicles: cloneVehicles(parsed.vehicles),
    walls: parsed.walls.map((wall) => ({ ...wall })),
    minimumMoves: parsed.minimumMoves,
  };
}

function parsePuzzle(stageId, puzzle) {
  const labels = new Map();
  const walls = [];

  [...puzzle.board].forEach((cell, index) => {
    const row = Math.floor(index / BOARD_SIZE);
    const col = index % BOARD_SIZE;
    if (cell === "x") {
      walls.push({ id: `wall-${row}-${col}`, row, col });
      return;
    }
    if (cell === "o" || cell === ".") return;
    if (!labels.has(cell)) labels.set(cell, []);
    labels.get(cell).push({ row, col });
  });

  const vehicles = [...labels.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, cells], index) => {
      const orientation = cells.every((cell) => cell.row === cells[0].row) ? "h" : "v";
      const row = Math.min(...cells.map((cell) => cell.row));
      const col = Math.min(...cells.map((cell) => cell.col));
      const isTarget = label === "A";
      return {
        id: isTarget ? "goal" : `v${index}`,
        row,
        col,
        length: cells.length,
        orientation,
        color: isTarget ? "#d64235" : colors[(stageId + index) % colors.length],
        target: isTarget,
      };
    });

  return { vehicles, walls, minimumMoves: puzzle.moves };
}

function generateVerifiedStage(stageId) {
  const targetMoves = targetMinimumMoves(stageId);
  const seed = stageId * 7919 + 104729;
  const vehicleCount = Math.min(12, 5 + Math.ceil(stageId / 12));
  const scrambleSteps = 14 + stageId * 3;
  const base = solvedGarageLayout(vehicleCount, stageId);
  let best = null;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const rng = createRng(seed + attempt * 9973);
    const candidate = scrambleFromSolved(base, scrambleSteps + attempt * 4, rng);
    const score = solveMinimumMoves(candidate, targetMoves + 5, 45000);
    if (score !== null && (!best || score > best.score)) {
      best = { vehicles: candidate, score };
    }
    if (score !== null && score >= targetMoves) {
      return candidate;
    }
  }

  return best ? best.vehicles : fallbackHardStage(stageId);
}

function solvedGarageLayout(count, stageId) {
  const pool = [
    { id: "goal", row: 2, col: 4, length: 2, orientation: "h", color: "#d64235", target: true },
    { id: "v0", row: 0, col: 0, length: 2, orientation: "v" },
    { id: "v1", row: 0, col: 1, length: 2, orientation: "v" },
    { id: "v2", row: 0, col: 2, length: 2, orientation: "v" },
    { id: "v3", row: 0, col: 3, length: 2, orientation: "v" },
    { id: "v4", row: 0, col: 5, length: 2, orientation: "v" },
    { id: "v5", row: 3, col: 4, length: 3, orientation: "v" },
    { id: "v6", row: 3, col: 0, length: 2, orientation: "h" },
    { id: "v7", row: 4, col: 1, length: 3, orientation: "h" },
    { id: "v8", row: 5, col: 0, length: 3, orientation: "h" },
    { id: "v9", row: 4, col: 4, length: 2, orientation: "h" },
    { id: "v10", row: 5, col: 3, length: 3, orientation: "h" },
  ];

  return pool.slice(0, count).map((vehicle, index) => ({
    ...vehicle,
    color: vehicle.color || colors[(stageId + index) % colors.length],
  }));
}

function scrambleFromSolved(baseVehicles, steps, rng) {
  const vehicles = cloneVehicles(baseVehicles);
  const goal = vehicles.find((vehicle) => vehicle.target);
  goal.col = rng() > 0.35 ? 0 : 1;

  let previous = null;
  for (let step = 0; step < steps; step += 1) {
    const moves = legalMoves(vehicles, false).filter((move) => {
      if (!previous) return true;
      return !(move.index === previous.index && move.toRow === previous.fromRow && move.toCol === previous.fromCol);
    });
    if (moves.length === 0) break;

    const weighted = moves.flatMap((move) => {
      const vehicle = vehicles[move.index];
      const blocksExitRow = vehicle.orientation === "v" && move.toRow <= 2 && move.toRow + vehicle.length > 2 && move.toCol > goal.col;
      const goalLeft = vehicle.target && move.toCol <= 1;
      const weight = blocksExitRow ? 5 : goalLeft ? 3 : 1;
      return Array.from({ length: weight }, () => move);
    });

    const move = weighted[Math.floor(rng() * weighted.length)];
    const vehicle = vehicles[move.index];
    previous = { index: move.index, fromRow: vehicle.row, fromCol: vehicle.col };
    vehicle.row = move.toRow;
    vehicle.col = move.toCol;
  }

  if (!exitIsBlocked(vehicles)) {
    const blockingMove = legalMoves(vehicles, false).find((move) => {
      const vehicle = vehicles[move.index];
      return vehicle.orientation === "v" && move.toRow <= 2 && move.toRow + vehicle.length > 2 && move.toCol > goal.col;
    });
    if (blockingMove) {
      vehicles[blockingMove.index].row = blockingMove.toRow;
      vehicles[blockingMove.index].col = blockingMove.toCol;
    }
  }

  return vehicles;
}

function targetMinimumMoves(stageId) {
  if (stageId <= 20) return 4 + Math.floor(stageId / 5);
  if (stageId <= 50) return 8 + Math.floor((stageId - 20) / 3);
  if (stageId <= 80) return 18 + Math.floor((stageId - 50) / 3);
  return 26 + Math.floor((stageId - 80) / 3);
}

function solveMinimumMoves(startVehicles, maxDepth, maxNodes) {
  const start = encodeState(startVehicles);
  const queue = [{ positions: decodeState(start, startVehicles), depth: 0 }];
  const seen = new Set([start]);
  let cursor = 0;

  while (cursor < queue.length && seen.size < maxNodes) {
    const current = queue[cursor];
    cursor += 1;
    const vehicles = applyPositions(startVehicles, current.positions);
    if (isCleared(vehicles)) return current.depth;
    if (current.depth >= maxDepth) continue;

    for (const move of legalMoves(vehicles, true)) {
      const nextPositions = current.positions.slice();
      nextPositions[move.index] = [move.toRow, move.toCol];
      const key = encodePositions(nextPositions);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ positions: nextPositions, depth: current.depth + 1 });
    }
  }

  return null;
}

function legalMoves(vehicles, allowGoalExit) {
  const moves = [];
  vehicles.forEach((vehicle, index) => {
    const occupied = occupancyForVehicles(vehicles, vehicle.id);
    if (vehicle.orientation === "h") {
      for (let col = vehicle.col - 1; col >= 0; col -= 1) {
        if (occupied.has(`${vehicle.row},${col}`)) break;
        moves.push({ index, toRow: vehicle.row, toCol: col });
      }
      const limit = vehicle.target && allowGoalExit ? BOARD_SIZE - 1 : BOARD_SIZE - vehicle.length;
      for (let col = vehicle.col + 1; col <= limit; col += 1) {
        const nose = col + vehicle.length - 1;
        if (nose < BOARD_SIZE && occupied.has(`${vehicle.row},${nose}`)) break;
        moves.push({ index, toRow: vehicle.row, toCol: col });
      }
    } else {
      for (let row = vehicle.row - 1; row >= 0; row -= 1) {
        if (occupied.has(`${row},${vehicle.col}`)) break;
        moves.push({ index, toRow: row, toCol: vehicle.col });
      }
      for (let row = vehicle.row + 1; row <= BOARD_SIZE - vehicle.length; row += 1) {
        const tail = row + vehicle.length - 1;
        if (occupied.has(`${tail},${vehicle.col}`)) break;
        moves.push({ index, toRow: row, toCol: vehicle.col });
      }
    }
  });
  return moves;
}

function exitIsBlocked(vehicles) {
  const goal = vehicles.find((vehicle) => vehicle.target);
  const occupied = occupancyForVehicles(vehicles, goal.id);
  for (let col = goal.col + goal.length; col < BOARD_SIZE; col += 1) {
    if (occupied.has(`${goal.row},${col}`)) return true;
  }
  return false;
}

function isCleared(vehicles) {
  const goal = vehicles.find((vehicle) => vehicle.target);
  return goal.col + goal.length > BOARD_SIZE;
}

function fallbackHardStage(stageId) {
  return [
    { id: "goal", row: 2, col: 0, length: 2, orientation: "h", color: "#d64235", target: true },
    { id: "v0", row: 0, col: 2, length: 3, orientation: "v", color: colors[(stageId + 1) % colors.length] },
    { id: "v1", row: 1, col: 3, length: 2, orientation: "v", color: colors[(stageId + 2) % colors.length] },
    { id: "v2", row: 1, col: 4, length: 3, orientation: "v", color: colors[(stageId + 3) % colors.length] },
    { id: "v3", row: 0, col: 5, length: 2, orientation: "v", color: colors[(stageId + 4) % colors.length] },
    { id: "v4", row: 3, col: 0, length: 3, orientation: "h", color: colors[(stageId + 5) % colors.length] },
    { id: "v5", row: 4, col: 1, length: 2, orientation: "h", color: colors[(stageId + 6) % colors.length] },
    { id: "v6", row: 5, col: 2, length: 3, orientation: "h", color: colors[(stageId + 7) % colors.length] },
    { id: "v7", row: 3, col: 5, length: 3, orientation: "v", color: colors[(stageId + 8) % colors.length] },
  ];
}

function cloneVehicles(vehicles) {
  return vehicles.map(({ mesh, ...vehicle }) => ({ ...vehicle }));
}

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function occupancyForVehicles(vehicles, exceptId) {
  const map = new Set();
  state.walls.forEach((wall) => map.add(`${wall.row},${wall.col}`));
  vehicles.forEach((vehicle) => {
    if (vehicle.id === exceptId) return;
    vehicleCells(vehicle).forEach(([row, col]) => {
      if (col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE) {
        map.add(`${row},${col}`);
      }
    });
  });
  return map;
}

function encodeState(vehicles) {
  return encodePositions(vehicles.map((vehicle) => [vehicle.row, vehicle.col]));
}

function encodePositions(positions) {
  return positions.map(([row, col]) => `${row},${col}`).join("|");
}

function decodeState(key) {
  return key.split("|").map((pair) => pair.split(",").map(Number));
}

function applyPositions(template, positions) {
  return template.map((vehicle, index) => ({
    ...vehicle,
    row: positions[index][0],
    col: positions[index][1],
  }));
}

function loadStage(stageId) {
  const stage = makeStage(stageId);
  state.stageId = stageId;
  state.vehicles = stage.vehicles;
  state.walls = stage.walls;
  state.minimumMoves = stage.minimumMoves;
  state.history = [];
  state.moves = 0;
  state.startedAt = Date.now();
  state.elapsedMs = 0;
  state.cleared = false;
  state.selected = null;
  state.drag = null;
  clearDialog.close();
  renderVehicles();
  renderWalls();
  renderStageButtons();
  renderHud();
  renderLeaderboard();
}

function renderVehicles() {
  vehicleGroup.clear();
  highlightGroup.clear();
  state.vehicles.forEach((vehicle) => {
    const mesh = createVehicleMesh(vehicle);
    vehicle.mesh = mesh;
    mesh.userData.vehicleId = vehicle.id;
    vehicleGroup.add(mesh);
    updateVehicleMesh(vehicle);
  });
}

function renderWalls() {
  wallGroup.clear();
  const material = new THREE.MeshStandardMaterial({ color: "#2f3633", roughness: 0.76, metalness: 0.04 });
  state.walls.forEach((wall) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.82, 0.72, CELL * 0.82), material);
    post.position.set(toX(wall.col), 0.22, toZ(wall.row));
    post.castShadow = true;
    post.receiveShadow = true;
    wallGroup.add(post);
  });
}

function createVehicleMesh(vehicle) {
  const length = vehicle.length * CELL - 0.16;
  const width = CELL * 0.78;
  const body = new THREE.Group();
  const bodyGeometry = vehicle.orientation === "h"
    ? new THREE.BoxGeometry(length, 0.45, width)
    : new THREE.BoxGeometry(width, 0.45, length);
  const bodyMesh = new THREE.Mesh(
    bodyGeometry,
    new THREE.MeshStandardMaterial({ color: vehicle.color, roughness: 0.45, metalness: 0.08 })
  );
  bodyMesh.position.y = 0.28;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  body.add(bodyMesh);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(vehicle.orientation === "h" ? CELL * 0.56 : CELL * 0.48, 0.24, vehicle.orientation === "h" ? CELL * 0.48 : CELL * 0.56),
    new THREE.MeshStandardMaterial({ color: "#dfeff2", roughness: 0.18, metalness: 0.12 })
  );
  cabin.position.set(vehicle.orientation === "h" ? CELL * 0.18 : 0, 0.66, vehicle.orientation === "h" ? 0 : -CELL * 0.18);
  cabin.castShadow = true;
  body.add(cabin);

  const wheelMaterial = new THREE.MeshStandardMaterial({ color: "#232927", roughness: 0.7 });
  const wheelOffsets = vehicle.orientation === "h"
    ? [[-length * 0.34, 0.05, -width * 0.56], [length * 0.34, 0.05, -width * 0.56], [-length * 0.34, 0.05, width * 0.56], [length * 0.34, 0.05, width * 0.56]]
    : [[-width * 0.56, 0.05, -length * 0.34], [-width * 0.56, 0.05, length * 0.34], [width * 0.56, 0.05, -length * 0.34], [width * 0.56, 0.05, length * 0.34]];
  wheelOffsets.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 18), wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    body.add(wheel);
  });

  return body;
}

function updateVehicleMesh(vehicle) {
  vehicle.mesh.position.set(
    toX(vehicle.col) + (vehicle.orientation === "h" ? ((vehicle.length - 1) * CELL) / 2 : 0),
    0,
    toZ(vehicle.row) + (vehicle.orientation === "v" ? ((vehicle.length - 1) * CELL) / 2 : 0)
  );
}

function renderStageButtons() {
  [...stageGrid.children].forEach((button, index) => {
    button.classList.toggle("active", index + 1 === state.stageId);
  });
}

function renderHud() {
  stageLabel.textContent = state.stageId;
  moveLabel.textContent = state.moves;
  timerLabel.textContent = formatTime(state.elapsedMs);
  difficultyLabel.textContent = `${getDifficulty(state.stageId)} · 최소 ${state.minimumMoves}수`;
  undoButton.disabled = state.history.length === 0 || state.cleared;
  nextButton.disabled = state.stageId >= 100;
}

function renderLeaderboard() {
  const records = getLeaderboard(state.stageId);
  leaderboardList.innerHTML = "";
  if (records.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "아직 기록이 없습니다.";
    leaderboardList.appendChild(empty);
    return;
  }
  records.slice(0, 50).forEach((record) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${record.name}</strong> · ${record.moves}회 이동 · ${formatTime(record.timeMs)}`;
    leaderboardList.appendChild(item);
  });
}

function onPointerDown(event) {
  if (state.cleared) return;
  setPointer(event);
  const intersections = raycaster.intersectObjects(vehicleGroup.children, true);
  const hit = intersections.find((item) => findVehicleByMesh(item.object));
  if (!hit) return;
  const vehicle = findVehicleByMesh(hit.object);
  const moves = movableRange(vehicle);
  if (moves.min === 0 && moves.max === 0) return;
  state.selected = vehicle;
  state.drag = {
    vehicle,
    startX: event.clientX,
    startY: event.clientY,
    startRow: vehicle.row,
    startCol: vehicle.col,
    min: moves.min,
    max: moves.max,
  };
  controls.enabled = false;
  renderer.domElement.setPointerCapture(event.pointerId);
  renderHighlights(vehicle, moves);
}

function onPointerMove(event) {
  if (!state.drag) return;
  const { vehicle, startX, startY, startRow, startCol, min, max } = state.drag;
  const delta = vehicle.orientation === "h"
    ? Math.round((event.clientX - startX) / 92)
    : Math.round((event.clientY - startY) / 92);
  const raw = vehicle.orientation === "h" ? startCol + delta : startRow + delta;
  const clamped = Math.max(vehicle.orientation === "h" ? startCol + min : startRow + min, Math.min(vehicle.orientation === "h" ? startCol + max : startRow + max, raw));
  if (vehicle.orientation === "h") {
    vehicle.col = clamped;
  } else {
    vehicle.row = clamped;
  }
  updateVehicleMesh(vehicle);
}

function onPointerUp(event) {
  if (!state.drag) return;
  const { vehicle, startRow, startCol } = state.drag;
  const changed = vehicle.row !== startRow || vehicle.col !== startCol;
  if (changed) {
    state.history.push({ id: vehicle.id, row: startRow, col: startCol });
    state.moves += 1;
    checkClear();
  }
  state.drag = null;
  state.selected = null;
  controls.enabled = true;
  highlightGroup.clear();
  renderer.domElement.releasePointerCapture(event.pointerId);
  renderHud();
}

function setPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
}

function movableRange(vehicle) {
  const occupied = occupancy(vehicle.id);
  let min = 0;
  let max = 0;
  if (vehicle.orientation === "h") {
    for (let col = vehicle.col - 1; col >= 0; col -= 1) {
      if (occupied.has(`${vehicle.row},${col}`)) break;
      min -= 1;
    }
    const limit = vehicle.target ? BOARD_SIZE : BOARD_SIZE - vehicle.length;
    for (let col = vehicle.col + vehicle.length; col <= limit; col += 1) {
      if (col < BOARD_SIZE && occupied.has(`${vehicle.row},${col}`)) break;
      max += 1;
    }
  } else {
    for (let row = vehicle.row - 1; row >= 0; row -= 1) {
      if (occupied.has(`${row},${vehicle.col}`)) break;
      min -= 1;
    }
    for (let row = vehicle.row + vehicle.length; row < BOARD_SIZE; row += 1) {
      if (occupied.has(`${row},${vehicle.col}`)) break;
      max += 1;
    }
  }
  return { min, max };
}

function renderHighlights(vehicle, moves) {
  highlightGroup.clear();
  const material = new THREE.MeshStandardMaterial({ color: "#f4d35e", transparent: true, opacity: 0.42 });
  for (let offset = moves.min; offset <= moves.max; offset += 1) {
    if (offset === 0) continue;
    const row = vehicle.orientation === "h" ? vehicle.row : vehicle.row + offset;
    const col = vehicle.orientation === "h" ? vehicle.col + offset : vehicle.col;
    const marker = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.9, 0.07, CELL * 0.9), material);
    marker.position.set(toX(col), 0.08, toZ(row));
    highlightGroup.add(marker);
  }
}

function undo() {
  const last = state.history.pop();
  if (!last) return;
  const vehicle = state.vehicles.find((item) => item.id === last.id);
  vehicle.row = last.row;
  vehicle.col = last.col;
  state.moves = Math.max(0, state.moves - 1);
  updateVehicleMesh(vehicle);
  renderHud();
}

function checkClear() {
  const goal = state.vehicles.find((vehicle) => vehicle.target);
  if (goal.col + goal.length > BOARD_SIZE) {
    state.cleared = true;
    state.elapsedMs = Date.now() - state.startedAt;
    saveRecord(state.stageId, { name: "플레이어", moves: state.moves, timeMs: state.elapsedMs, createdAt: new Date().toISOString() });
    renderLeaderboard();
    clearTitle.textContent = `${state.stageId} 스테이지 클리어`;
    clearSummary.textContent = `${formatTime(state.elapsedMs)} · ${state.moves}회 이동`;
    clearDialog.showModal();
  }
}

function occupancy(exceptId) {
  const map = new Set();
  state.walls.forEach((wall) => map.add(`${wall.row},${wall.col}`));
  state.vehicles.forEach((vehicle) => {
    if (vehicle.id === exceptId) return;
    vehicleCells(vehicle).forEach(([row, col]) => map.add(`${row},${col}`));
  });
  return map;
}

function vehicleCells(vehicle) {
  return Array.from({ length: vehicle.length }, (_, index) => [
    vehicle.row + (vehicle.orientation === "v" ? index : 0),
    vehicle.col + (vehicle.orientation === "h" ? index : 0),
  ]);
}

function findVehicleByMesh(mesh) {
  let current = mesh;
  while (current) {
    if (current.userData.vehicleId) {
      return state.vehicles.find((vehicle) => vehicle.id === current.userData.vehicleId);
    }
    current = current.parent;
  }
  return null;
}

function getLeaderboard(stageId) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  return all[stageId] || [];
}

function saveRecord(stageId, record) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  const records = [record, ...(all[stageId] || [])]
    .sort((a, b) => a.moves - b.moves || a.timeMs - b.timeMs || a.createdAt.localeCompare(b.createdAt))
    .slice(0, 50);
  all[stageId] = records;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function getDifficulty(stageId) {
  if (stageId <= 25) return "입문";
  if (stageId <= 50) return "중급";
  if (stageId <= 75) return "고급";
  return "전문가";
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function toX(col) {
  return col * CELL - BOARD_OFFSET;
}

function toZ(row) {
  return row * CELL - BOARD_OFFSET;
}

function resize() {
  const rect = host.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  if (!state.cleared) {
    state.elapsedMs = Date.now() - state.startedAt;
    renderHud();
  }
  controls.update();
  renderer.render(scene, camera);
}
