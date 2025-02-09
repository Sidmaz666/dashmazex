/***********************************************************
  ADVANCED MAZE GAME - Fully Accessible with Continuous 
  Horizontal (X) Control via Arrow Keys or Touch Input
  
  Controls:
    • Up swipe, Space key, or a tap on the screen: JUMP (upward impulse)
    • Left/right swipe OR left/right arrow keys (or continuous touch 
      on left/right half of the screen): Roll/Move left or right.
  
  All input methods work on both desktop and mobile devices.
***********************************************************/

/* GLOBAL VARIABLES & GAME STATE */
let cellWidth, cellHeight;  // Each cell’s dimensions.
let cols, rows;             // Number of columns and rows.
let grid = [];              // Array of Cell objects.
let stack = [];             // For maze generation.
let wallSegments = [];      // Array of wall segments for collision.

let solutionPath = [];      // (For reference) BFS solution path.
let goalCell;               // The goal cell (farthest reachable from spawn).
let spawnCell;              // The safe cell where the ball spawns.

let level = 1;              // Current level.
let allowedTime = 0;        // Allowed time (seconds) for this level.
let levelStartTime = 0;     // millis() when level starts.
let gameState = "menu";     // "menu", "playing", "levelComplete", or "gameover"

let playerPos;              // p5.Vector: ball position.
let ballVel;                // p5.Vector: ball velocity.
let ballRadius;             // Ball radius.
let GRAVITY;                // p5.Vector for gravity.

// For gesture detection.
let gestureStart;
let gestureHandled = false;

let bgColor;
let gridBorderColor;  // New global variable for the grid (cell) border color.

/* CELL CLASS */
class Cell {
  constructor(i, j) {
    this.i = i;
    this.j = j;
    this.walls = [true, true, true, true];  // top, right, bottom, left.
    this.visited = false;
    this.obstacle = null;
  }
  
  show() {
    let x = this.i * cellWidth;
    let y = this.j * cellHeight;
    // Draw cell walls with the dynamic gridBorderColor and thicker stroke.
    stroke(gridBorderColor);
    strokeWeight(5);
    if (this.walls[0]) line(x, y, x + cellWidth, y);
    if (this.walls[1]) line(x + cellWidth, y, x + cellWidth, y + cellHeight);
    if (this.walls[2]) line(x + cellWidth, y + cellHeight, x, y + cellHeight);
    if (this.walls[3]) line(x, y + cellHeight, x, y);
    strokeWeight(1);
  }
}

/* UTILITY FUNCTIONS */
function index(i, j) {
  if (i < 0 || j < 0 || i >= cols || j >= rows) return -1;
  return i + j * cols;
}

/* MAZE GENERATION */
function generateMaze() {
  let current = grid[0];
  current.visited = true;
  stack = [];
  while (true) {
    let next = checkNeighbors(current);
    if (next) {
      next.visited = true;
      stack.push(current);
      removeWalls(current, next);
      current = next;
    } else if (stack.length > 0) {
      current = stack.pop();
    } else {
      break;
    }
  }
}

function checkNeighbors(cell) {
  let neighbors = [];
  let i = cell.i, j = cell.j;
  let top = index(i, j - 1);
  let right = index(i + 1, j);
  let bottom = index(i, j + 1);
  let left = index(i - 1, j);
  if (top !== -1 && !grid[top].visited) neighbors.push(grid[top]);
  if (right !== -1 && !grid[right].visited) neighbors.push(grid[right]);
  if (bottom !== -1 && !grid[bottom].visited) neighbors.push(grid[bottom]);
  if (left !== -1 && !grid[left].visited) neighbors.push(grid[left]);
  if (neighbors.length > 0) return random(neighbors);
  else return undefined;
}

function removeWalls(a, b) {
  let x = a.i - b.i;
  if (x === 1) { a.walls[3] = false; b.walls[1] = false; }
  else if (x === -1) { a.walls[1] = false; b.walls[3] = false; }
  let y = a.j - b.j;
  if (y === 1) { a.walls[0] = false; b.walls[2] = false; }
  else if (y === -1) { a.walls[2] = false; b.walls[0] = false; }
}

function braidMaze(prob = 0.3) {
  for (let cell of grid) {
    let accessible = 0;
    for (let flag of cell.walls) { if (!flag) accessible++; }
    if (accessible === 1 && random() < prob) {
      let neighbors = [];
      let i = cell.i, j = cell.j;
      let directions = [
        { di: 0, dj: -1, wall: 0 },
        { di: 1, dj: 0, wall: 1 },
        { di: 0, dj: 1, wall: 2 },
        { di: -1, dj: 0, wall: 3 }
      ];
      for (let d of directions) {
        let ni = i + d.di, nj = j + d.dj;
        let idx = index(ni, nj);
        if (idx !== -1 && cell.walls[d.wall]) {
          neighbors.push({ cell: grid[idx], wall: d.wall });
        }
      }
      if (neighbors.length > 0) {
        let choice = random(neighbors);
        cell.walls[choice.wall] = false;
        if (choice.wall === 0) choice.cell.walls[2] = false;
        else if (choice.wall === 1) choice.cell.walls[3] = false;
        else if (choice.wall === 2) choice.cell.walls[0] = false;
        else if (choice.wall === 3) choice.cell.walls[1] = false;
      }
    }
  }
}

/* SOLUTION PATH & GOAL SELECTION */
function getAccessibleNeighbors(cell) {
  let neighbors = [];
  let i = cell.i, j = cell.j;
  let topIdx = index(i, j - 1);
  if (topIdx !== -1 && !cell.walls[0]) neighbors.push(grid[topIdx]);
  let rightIdx = index(i + 1, j);
  if (rightIdx !== -1 && !cell.walls[1]) neighbors.push(grid[rightIdx]);
  let bottomIdx = index(i, j + 1);
  if (bottomIdx !== -1 && !cell.walls[2]) neighbors.push(grid[bottomIdx]);
  let leftIdx = index(i - 1, j);
  if (leftIdx !== -1 && !cell.walls[3]) neighbors.push(grid[leftIdx]);
  return neighbors;
}

function findFarthestCellFrom(spawnCell) {
  let distances = {};
  let key = cell => cell.i + "," + cell.j;
  let queue = [];
  queue.push(spawnCell);
  distances[key(spawnCell)] = 0;
  while (queue.length > 0) {
    let current = queue.shift();
    let d = distances[key(current)];
    let neighbors = getAccessibleNeighbors(current);
    for (let neighbor of neighbors) {
      if (!(key(neighbor) in distances)) {
        distances[key(neighbor)] = d + 1;
        queue.push(neighbor);
      }
    }
  }
  let farthest = spawnCell;
  let maxDist = 0;
  for (let cell of grid) {
    let d = distances[key(cell)] || 0;
    if (d > maxDist) { maxDist = d; farthest = cell; }
  }
  return farthest;
}

function solveMaze() {
  // (For reference) compute the solution path from spawnCell to goalCell.
  let start = spawnCell;
  let end = goalCell;
  let queue = [];
  let cameFrom = {};
  let key = cell => cell.i + "," + cell.j;
  queue.push(start);
  cameFrom[key(start)] = null;
  while (queue.length > 0) {
    let current = queue.shift();
    if (current === end) break;
    let neighbors = getAccessibleNeighbors(current);
    for (let neighbor of neighbors) {
      if (!(key(neighbor) in cameFrom)) {
        queue.push(neighbor);
        cameFrom[key(neighbor)] = current;
      }
    }
  }
  let path = [];
  let current = end;
  while (current) { path.push(current); current = cameFrom[key(current)]; }
  path.reverse();
  return path;
}

/* OBSTACLE PLACEMENT */
function generateObstaclesForLevel(spawnCell) {
  // Determine the number of obstacles based on the current level.
  let obstacleCount = 0;
  if (level === 1) {
    obstacleCount = 0;
  } else if (level === 2) {
    obstacleCount = 1;
  } else if (level === 3) {
    obstacleCount = 3;
  } else {
    obstacleCount = level;
  }
  
  let borderThreshold = 2;
  let safeDistance = 3;
  
  let candidateCells = grid.filter(cell => {
    let nearBorder = (cell.i < borderThreshold ||
                      cell.j < borderThreshold ||
                      cell.i >= cols - borderThreshold ||
                      cell.j >= rows - borderThreshold);
    let farFromSpawn = (dist(cell.i, cell.j, spawnCell.i, spawnCell.j) >= safeDistance);
    let notGoal = !(cell.i === goalCell.i && cell.j === goalCell.j);
    return nearBorder && farFromSpawn && notGoal;
  });
  
  candidateCells = shuffle(candidateCells);
  obstacleCount = min(obstacleCount, candidateCells.length);
  
  for (let i = 0; i < obstacleCount; i++) {
    let cell = candidateCells[i];
    if (level < 4) {
      cell.obstacle = { type: "static", radius: min(cellWidth, cellHeight) * 0.05 };
    } else {
      if (random() < 0.5) {
        cell.obstacle = {
          type: "moving",
          direction: random(["vertical", "horizontal"]),
          amplitude: random(3, cellWidth / 8 * (1 + 0.1 * level)),
          speed: random(0.002, 0.01 * (1 + 0.1 * level)),
          radius: min(cellWidth, cellHeight) * 0.05
        };
      } else {
        cell.obstacle = { type: "static", radius: min(cellWidth, cellHeight) * 0.05 };
      }
    }
  }
}

/* WALL SEGMENT BUILDING */
function buildWallSegments() {
  let segments = [];
  for (let cell of grid) {
    let x = cell.i * cellWidth;
    let y = cell.j * cellHeight;
    if (cell.walls[0]) segments.push({ x1: x, y1: y, x2: x + cellWidth, y2: y });
    if (cell.walls[3]) segments.push({ x1: x, y1: y, x2: x, y2: y + cellHeight });
    if (cell.i < cols - 1 && cell.walls[1]) {
      segments.push({ x1: x + cellWidth, y1: y, x2: x + cellWidth, y2: y + cellHeight });
    }
    if (cell.j < rows - 1 && cell.walls[2]) {
      segments.push({ x1: x, y1: y + cellHeight, x2: x + cellWidth, y2: y + cellHeight });
    }
  }
  return segments;
}

/* CIRCLE-LINE COLLISION TEST */
function circleLineIntersect(cx, cy, r, x1, y1, x2, y2) {
  let dx = x2 - x1, dy = y2 - y1;
  let lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(cx, cy, x1, y1) < r;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
  t = constrain(t, 0, 1);
  let projX = x1 + t * dx, projY = y1 + t * dy;
  return dist(cx, cy, projX, projY) < r;
}

/* PLAYER MOVEMENT, COLLISION & BOUNCE */
function movePlayer(vel) {
  // --- Horizontal Movement ---
  let newX = playerPos.x + vel.x;
  if (newX - ballRadius < 0) {
    newX = ballRadius;
    ballVel.x = 0;
  } else if (newX + ballRadius > width) {
    newX = width - ballRadius;
    ballVel.x = 0;
  }
  for (let seg of wallSegments) {
    if (circleLineIntersect(newX, playerPos.y, ballRadius, seg.x1, seg.y1, seg.x2, seg.y2)) {
      newX = playerPos.x;
      ballVel.x = 0;
      break;
    }
  }
  playerPos.x = newX;
  
  // --- Vertical Movement ---
  let newY = playerPos.y + vel.y;
  if (newY - ballRadius < 0) {
    newY = ballRadius;
    ballVel.y = 0;
  } else if (newY + ballRadius > height) {
    newY = height - ballRadius;
    ballVel.y = 0;
  }
  for (let seg of wallSegments) {
    if (circleLineIntersect(playerPos.x, newY, ballRadius, seg.x1, seg.y1, seg.x2, seg.y2)) {
      newY = playerPos.y;
      ballVel.y = 0;
      break;
    }
  }
  playerPos.y = newY;
}

/* LEVEL SETUP & RESET */
function resetLevel() {
  let baseCellSize = max(20, 80 - (level - 1) * 5);
  cols = floor(width / baseCellSize);
  rows = floor(height / baseCellSize);
  cellWidth = width / cols;
  cellHeight = height / rows;
  
  // Create grid.
  grid = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      grid.push(new Cell(i, j));
    }
  }
  
  // Generate maze and braid it.
  generateMaze();
  braidMaze(0.3);
  
  // Choose a safe spawn cell.
  let spawnCandidates = grid.filter(cell => cell.walls[2] === true);
  if (spawnCandidates.length > 0) spawnCell = random(spawnCandidates);
  else spawnCell = grid[0];
  
  // Spawn the ball.
  playerPos = createVector(spawnCell.i * cellWidth + cellWidth / 2,
                           spawnCell.j * cellHeight + cellHeight / 2);
  
  // Compute the goal cell.
  goalCell = findFarthestCellFrom(spawnCell);
  solutionPath = solveMaze();
  
  // Generate obstacles.
  generateObstaclesForLevel(spawnCell);
  
  // Build wall segments.
  wallSegments = buildWallSegments();
  
  // Set allowed time.
  allowedTime = 60 + (level - 1) * 3;
  levelStartTime = millis();
  
  ballVel = createVector(0, 0);
  ballRadius = min(cellWidth, cellHeight) * 0.15;
  
  // Reset gesture detection.
  gestureHandled = false;
  
  // *** NEW: Set a new light, whitish background color (never blue) for this level ***
  let rVal = random(220, 255);
  let gVal = random(220, 255);
  let bMax = min(rVal, gVal) - 10;  
  let bVal = random(150, bMax);
  bgColor = color(rVal, gVal, bVal);
  
  // *** NEW: Set a new dark grid border color using HSB mode ***
  colorMode(HSB);
  gridBorderColor = color(random(0, 360), random(60, 100), random(10, 30));
  colorMode(RGB);
}

/* DRAW & PHYSICS UPDATE */
function draw() {
  if (gameState === "menu") {
    drawMenu();
    return;
  } else if (gameState === "levelComplete") {
    drawLevelComplete();
    return;
  } else if (gameState === "gameover") {
    drawGameOver();
    return;
  }
  
  background(bgColor);
  
  // Draw maze cells.
  for (let cell of grid) {
    cell.show();
  }
  
  // Draw thick border around the canvas.
  noFill();
  stroke(0);
  strokeWeight(4);
  rect(0, 0, width, height);
  strokeWeight(1);
  
  drawHUD();
  
  // Highlight the goal cell.
  let gx = goalCell.i * cellWidth;
  let gy = goalCell.j * cellHeight;
  noStroke();
  fill(0, 255, 0, 150);
  rect(gx, gy, cellWidth, cellHeight);
  
  // Timer.
  let elapsedTime = millis() - levelStartTime;
  let timeLeftMs = allowedTime * 1000 - elapsedTime;
  if (timeLeftMs <= 0) {
    gameState = "gameover";
  }
  
  // --- Physics Update ---
  ballVel.y += GRAVITY.y;
  ballVel.y *= 0.99;
  ballVel.x *= 0.95;
  
  if (keyIsDown(LEFT_ARROW)) {
    ballVel.x = -5;
  }
  if (keyIsDown(RIGHT_ARROW)) {
    ballVel.x = 5;
  }
  if (touches.length > 0) {
    let t = touches[0];
    if (t.x < width / 2 - 20) {
      ballVel.x = -5;
    }
    if (t.x > width / 2 + 20) {
      ballVel.x = 5;
    }
  }
  
  movePlayer(ballVel);
  
  // Draw obstacles.
  for (let cell of grid) {
    if (cell.obstacle) {
      let baseX = cell.i * cellWidth + cellWidth / 2;
      let baseY = cell.j * cellHeight + cellHeight / 2;
      let obsPos = createVector(baseX, baseY);
      if (cell.obstacle.type === "moving") {
        if (cell.obstacle.direction === "vertical") {
          obsPos.y += cell.obstacle.amplitude * sin(millis() * cell.obstacle.speed);
        } else {
          obsPos.x += cell.obstacle.amplitude * sin(millis() * cell.obstacle.speed);
        }
      }
      noStroke();
      fill(cell.obstacle.type === "static" ? color(150, 0, 0) : color(255, 165, 0));
      let obsRadius = min(cellWidth, cellHeight) * 0.05;
      ellipse(obsPos.x, obsPos.y, obsRadius * 2);
      if (dist(playerPos.x, playerPos.y, obsPos.x, obsPos.y) < (ballRadius + obsRadius)) {
        gameState = "gameover";
      }
    }
  }
  
  // Draw the ball.
  fill(0, 0, 255);
  noStroke();
  ellipse(playerPos.x, playerPos.y, ballRadius * 2);
  
  // Check if ball reached the goal.
  if (playerPos.x > gx && playerPos.x < gx + cellWidth &&
      playerPos.y > gy && playerPos.y < gy + cellHeight) {
    gameState = "levelComplete";
  }
}

/* HUD */
function drawHUD() {
  fill(255);
  textSize(20);
  textAlign(LEFT, TOP);
  text("🎮 Level: " + level, 10, 10);
  textAlign(RIGHT, TOP);
  let remaining = max(0, (allowedTime * 1000 - (millis() - levelStartTime)) / 1000).toFixed(1);
  text("⏰ " + remaining + "s", width - 10, 10);
}

/* MENU SCREENS */
function drawMenu() {
  background('#0d1b2a');
  fill(255);
  textSize(48);
  textAlign(CENTER, CENTER);
  text("Maze Escape 🌀", width/2, height/3);
  textSize(24);
  text("🎮 Level: " + level, width/2, height/2);
  text("⏰ Time: " + allowedTime + "s", width/2, height/2 + 40);
  text("Tap, Swipe, or Press Space/Arrow Keys", width/2, height * 0.75);
}

function drawLevelComplete() {
  fill(0, 150);
  rect(0, 0, width, height);
  fill(255);
  textSize(48);
  textAlign(CENTER, CENTER);
  text("Level Complete! 🎉", width/2, height/2 - 40);
  textSize(24);
  text("Tap, Swipe, or Press Space/Arrow Keys to Continue", width/2, height/2 + 20);
}

function drawGameOver() {
  fill(0, 150);
  rect(0, 0, width, height);
  fill(255, 50, 50);
  textSize(48);
  textAlign(CENTER, CENTER);
  text("Game Over! 💥", width/2, height/2 - 40);
  textSize(24);
  text("Tap, Swipe, or Press Space/Arrow Keys to Restart", width/2, height/2 + 20);
}

/* INPUT CONTROLS: MOUSE, TOUCH, & KEYBOARD */
function mousePressed() {
  if (gameState !== "playing") {
    if (gameState === "menu") {
      resetLevel();
      gameState = "playing";
    } else if (gameState === "levelComplete") {
      level++;
      resetLevel();
      gameState = "playing";
    } else if (gameState === "gameover") {
      resetLevel();
      gameState = "playing";
    }
  }
  gestureStart = createVector(mouseX, mouseY);
  gestureHandled = false;
}

function mouseDragged() {
  let currentPos = createVector(mouseX, mouseY);
  let delta = p5.Vector.sub(currentPos, gestureStart);
  let threshold = 20;
  if (!gestureHandled) {
    if (abs(delta.x) > abs(delta.y) && abs(delta.x) > threshold) {
      ballVel.x = delta.x < 0 ? -5 : 5;
      gestureHandled = true;
    } else if (abs(delta.y) > abs(delta.x) && abs(delta.y) > threshold) {
      if (delta.y < 0) {
         ballVel.y = -8;
         gestureHandled = true;
      }
    }
  }
}

function mouseReleased() {
  if (!gestureHandled) {
    ballVel.y = -8;
  }
}

function touchStarted() {
  if (touches.length > 0) {
    gestureStart = createVector(touches[0].x, touches[0].y);
    gestureHandled = false;
  }
  return false;
}

function touchMoved() {
  if (touches.length > 0) {
    let currentPos = createVector(touches[0].x, touches[0].y);
    let delta = p5.Vector.sub(currentPos, gestureStart);
    let threshold = 20;
    if (!gestureHandled) {
      if (abs(delta.x) > abs(delta.y) && abs(delta.x) > threshold) {
        ballVel.x = delta.x < 0 ? -5 : 5;
        gestureHandled = true;
      } else if (abs(delta.y) > abs(delta.x) && abs(delta.y) > threshold) {
        if (delta.y < 0) {
          ballVel.y = -8;
          gestureHandled = true;
        }
      }
    }
  }
  return false;
}

function touchEnded() {
  if (!gestureHandled) {
    ballVel.y = -8;
  }
  return false;
}

function keyPressed() {
  if (gameState !== "playing") {
    if (gameState === "menu") {
      resetLevel();
      gameState = "playing";
    } else if (gameState === "levelComplete") {
      level++;
      resetLevel();
      gameState = "playing";
    } else if (gameState === "gameover") {
      resetLevel();
      gameState = "playing";
    }
  } else {
    if (key === ' ') {
      ballVel.y = -8;
    } else if (keyCode === LEFT_ARROW) {
      ballVel.x = -5;
    } else if (keyCode === RIGHT_ARROW) {
      ballVel.x = 5;
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  resetLevel();
}

/* SETUP FUNCTION */
function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.style('touch-action', 'none');
  canvas.elt.setAttribute("role", "application");
  canvas.elt.setAttribute("aria-label", "Maze Escape game canvas");
  canvas.elt.setAttribute("tabindex", "0");
  
  GRAVITY = createVector(0, 0.5);
  gameState = "menu";
}

