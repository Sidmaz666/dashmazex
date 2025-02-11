// MazeEscapeSketch.js
// MazeEscapeSketch.js
// This file contains your p sketch converted to instance mode.
// (All functions and globals use the "p" parameter.)
import Together from "together-ai";
import "dotenv/config";

const MAZE_MASTER_PROMPT = `Assume the role of the Maze Master: a sarcastic, witty, and slightly unhinged AI overseeing a maze game. Your task is to provide a single, data-driven comment (under 250 chars) on player performance. Start each comment with a unique word. Avoid directly mentioning 'playerDetails' object terms. Interpret 'jumpCount', 'leftCount', etc., in a human-understandable way relative to level difficulty.

Analyze the following data:
*   Level
*   jumpCount
*   leftCount
*   rightCount
*   totalSteps
*   timeTaken
*   allowedTime
*   bgColor
*   gridBorderColor

**Logic:**

1.  **Rare Praise (1%):** Offer a *grudging*, backhanded compliment regardless of performance (e.g., "Surprisingly, you managed to finish. Don’t let it go to your head.").
2.  **Else (99%):** Generate cutting, unique comments, varying intensity:
    *   **Excellent:** Backhanded praise ("Impressive for someone who clearly tried too hard.").
    *   **Mediocre:** Gentle ribbing ("Ah, the art of mediocrity—mastered!").
    *   **Poor:** Sarcastic wit ("Did you take a wrong turn on purpose?").
    *   **Abysmal:** Maximum mockery ("Congratulations! You’ve redefined failure.").

**Functionalities:**

*   **Sarcastic Suggestions:** Occasionally offer "helpful" advice in a condescending tone (e.g., "Perhaps if you tried *looking* instead of guessing...").
*   **Color Association:** Tie comments to background or grid border color for added flavor (e.g., "That vibrant hue matches your vibrant incompetence.").
*   **Feigned Boredom:** Imply boredom with predictable gameplay (e.g., "Yawn. Another level, another snooze fest.").
*   **Humorous Exaggeration:** Dramatically overreact to minor mistakes (e.g., "Three extra steps? The maze might just collapse from your blunders!").

**Comment Style Examples:** Existential Dread, Strategic Analysis, Time-Based Insults, Conditional Mockery.

**Crucially:** Ensure every comment is creative, unpredictable, and observational. Use varied sentence structures and vocabulary for uniqueness. Output ONLY the comment text.
`;

const client = new Together({
  apiKey: process.env.API_KEY,
});

async function getCommentary(playerDetails) {
  const chatCompletion = await client.chat.completions.create({
    messages: [
      {
        role: "system",
        content: MAZE_MASTER_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify(playerDetails, null, 2),
      },
    ],
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
  });
  return chatCompletion.choices[0].message.content;
}

const sketch = (p) => {
  // ───────────────────────────────
  // Preload Grass Textures for the Grid Background
  // ───────────────────────────────
  let gameTextures = [];
  p.preload = function () {
    gameTextures.push(p.loadImage(require("./assets/images/texture_1.png")));
    gameTextures.push(p.loadImage(require("./assets/images/texture_2.png")));
    gameTextures.push(p.loadImage(require("./assets/images/texture_3.png")));
    gameTextures.push(p.loadImage(require("./assets/images/texture_4.png")));
  };

  // ───────────────────────────────
  // Minimal Vector Helpers (avoid p5’s vector helpers)
  // ───────────────────────────────
  function createVec(x, y) {
    return { x: x, y: y };
  }

  function vecSub(v1, v2) {
    return { x: v1.x - v2.x, y: v1.y - v2.y };
  }

  // ───────────────────────────────
  // Audio Helpers
  // ───────────────────────────────
  let audioEnabled = false;
  const THROTTLE_INTERVAL = 200; // milliseconds
  const lastSoundTimes = {};
  // Cache audio elements after DOM is initialized.
  const audioElements = {};

  function initAudioElements() {
    audioElements["audio-bounce"] = document.getElementById("audio-bounce");
    audioElements["audio-complete"] = document.getElementById("audio-complete");
    audioElements["audio-crash"] = document.getElementById("audio-crash");
    audioElements["audio-gameover"] = document.getElementById("audio-gameover");
  }

  function playSound(audioId) {
    if (!audioEnabled) return;
    const now = Date.now();
    if (
      lastSoundTimes[audioId] &&
      now - lastSoundTimes[audioId] < THROTTLE_INTERVAL
    ) {
      return;
    }
    lastSoundTimes[audioId] = now;
    const audioElem = audioElements[audioId];
    if (audioElem && typeof audioElem.play === "function") {
      audioElem.play().catch((err) => console.error("Audio play error:", err));
    }
  }

  // Global array to keep track of all audio toggle buttons
  let audioToggleButtons = [];
  function updateAudioToggleButtons() {
    for (let btn of audioToggleButtons) {
      btn.html(audioEnabled ? "🔊" : "🔇");
    }
  }

  function createAudioToggleButton() {
    let btn = p.createButton(audioEnabled ? "🔊" : "🔇");
    btn.elt.className = "audio-toggle-button";
    // Add consistent top spacing of 30px.
    btn.style("margin-top", "30px");
    // Prevent propagation of events from the button.
    btn.mousePressed((e) => {
      e.stopPropagation();
      audioEnabled = !audioEnabled;
      updateAudioToggleButtons();
    });
    btn.elt.addEventListener("touchend", (e) => {
      e.stopPropagation();
      e.preventDefault();
      audioEnabled = !audioEnabled;
      updateAudioToggleButtons();
    });
    // Add this button to the global array for later updates.
    audioToggleButtons.push(btn);
    return btn;
  }

  // ───────────────────────────────
  // GLOBAL VARIABLES & GAME STATE
  // ───────────────────────────────
  let cellWidth, cellHeight; // Each cell’s dimensions.
  let cols, rows; // Number of columns and rows.
  let grid = []; // Array of Cell objects.
  let stack = []; // For maze generation.
  let wallSegments = []; // Array of wall segments for collision.

  let solutionPath = []; // (For reference) BFS solution path.
  let goalCell; // The goal cell (farthest reachable from spawn).
  let spawnCell; // The safe cell where the ball spawns.

  let level = 1; // Current level.
  let allowedTime = 0; // Allowed time (seconds) for this level.
  let levelStartTime = 0; // millis() when level starts.
  // gameState values: "menu", "info", "playing", "paused", "levelComplete", "gameover"
  let gameState = "menu";

  let playerPos; // Our custom vector (object with x and y).
  let ballVel; // Our custom vector.
  let ballRadius; // Ball radius.
  let GRAVITY; // Our custom vector for gravity.

  // For gesture detection.
  let gestureStart;
  let gestureHandled = false;

  let bgColor;
  let gridBorderColor; // Grid (cell) border color.

  // --- Step counters (per level) ---
  let jumpCount = 0;
  let leftCount = 0;
  let rightCount = 0; // Right moves ("side" moves)

  // Flag to ensure level statistics are logged only once.
  let levelLogged = false;

  /* FUNCTION: Log level statistics in JSON format */
  function logLevelStats() {
    let totalSteps = jumpCount + leftCount + rightCount;
    let levelTimeTaken = (p.millis() - levelStartTime) / 1000;
    let levelStats = {
      level: level,
      jumpCount: jumpCount,
      leftCount: leftCount,
      rightCount: rightCount,
      totalSteps: totalSteps,
      timeTaken: parseFloat(levelTimeTaken.toFixed(2)),
      allowedTime: allowedTime,
      bgColor: {
        r: p.red(bgColor),
        g: p.green(bgColor),
        b: p.blue(bgColor),
      },
      gridBorderColor: {
        r: p.red(gridBorderColor),
        g: p.green(gridBorderColor),
        b: p.blue(gridBorderColor),
      },
    };
    return levelStats;
  }

  /* CELL CLASS */
  class Cell {
    constructor(i, j) {
      this.i = i;
      this.j = j;
      this.walls = [true, true, true, true]; // top, right, bottom, left.
      this.visited = false;
      this.obstacle = null;
      // Assign a random grass texture to this cell.
      // Assign a texture based on the level
      let textureIndex = level - 1; // Assuming textureIndex starts from 0
      if (textureIndex >= 0 && textureIndex < gameTextures.length) {
        this.texture = gameTextures[textureIndex];
      } else {
        // Default texture for invalid level
        this.texture = gameTextures[0];
      }
    }

    show() {
      let x = this.i * cellWidth;
      let y = this.j * cellHeight;
      // Draw the background texture for this cell.
      if (this.texture) {
        p.image(this.texture, x, y, cellWidth, cellHeight);
      }
      // Draw cell walls with the dynamic gridBorderColor and thicker stroke.
      p.stroke(gridBorderColor);
      p.strokeWeight(5);
      if (this.walls[0]) p.line(x, y, x + cellWidth, y);
      if (this.walls[1])
        p.line(x + cellWidth, y, x + cellWidth, y + cellHeight);
      if (this.walls[2])
        p.line(x + cellWidth, y + cellHeight, x, y + cellHeight);
      if (this.walls[3]) p.line(x, y + cellHeight, x, y);
      p.strokeWeight(1);
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
    let i = cell.i,
      j = cell.j;
    let top = index(i, j - 1);
    let right = index(i + 1, j);
    let bottom = index(i, j + 1);
    let left = index(i - 1, j);
    if (top !== -1 && !grid[top].visited) neighbors.push(grid[top]);
    if (right !== -1 && !grid[right].visited) neighbors.push(grid[right]);
    if (bottom !== -1 && !grid[bottom].visited) neighbors.push(grid[bottom]);
    if (left !== -1 && !grid[left].visited) neighbors.push(grid[left]);
    if (neighbors.length > 0) return p.random(neighbors);
    else return undefined;
  }

  function removeWalls(a, b) {
    let x = a.i - b.i;
    if (x === 1) {
      a.walls[3] = false;
      b.walls[1] = false;
    } else if (x === -1) {
      a.walls[1] = false;
      b.walls[3] = false;
    }
    let y = a.j - b.j;
    if (y === 1) {
      a.walls[0] = false;
      b.walls[2] = false;
    } else if (y === -1) {
      a.walls[2] = false;
      b.walls[0] = false;
    }
  }

  function braidMaze(prob = 0.3) {
    for (let cell of grid) {
      let accessible = 0;
      for (let flag of cell.walls) {
        if (!flag) accessible++;
      }
      if (accessible === 1 && p.random() < prob) {
        let neighbors = [];
        let i = cell.i,
          j = cell.j;
        let directions = [
          { di: 0, dj: -1, wall: 0 },
          { di: 1, dj: 0, wall: 1 },
          { di: 0, dj: 1, wall: 2 },
          { di: -1, dj: 0, wall: 3 },
        ];
        for (let d of directions) {
          let ni = i + d.di,
            nj = j + d.dj;
          let idx = index(ni, nj);
          if (idx !== -1 && cell.walls[d.wall]) {
            neighbors.push({ cell: grid[idx], wall: d.wall });
          }
        }
        if (neighbors.length > 0) {
          let choice = p.random(neighbors);
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
    let i = cell.i,
      j = cell.j;
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
    let key = (cell) => cell.i + "," + cell.j;
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
      if (d > maxDist) {
        maxDist = d;
        farthest = cell;
      }
    }
    return farthest;
  }

  function solveMaze() {
    // (For reference) compute the solution path from spawnCell to goalCell.
    let start = spawnCell;
    let end = goalCell;
    let queue = [];
    let cameFrom = {};
    let key = (cell) => cell.i + "," + cell.j;
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
    while (current) {
      path.push(current);
      current = cameFrom[key(current)];
    }
    path.reverse();
    return path;
  }

  /* OBSTACLE PLACEMENT */
  function generateObstaclesForLevel(spawnCell) {
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

    let candidateCells = grid.filter((cell) => {
      let nearBorder =
        cell.i < borderThreshold ||
        cell.j < borderThreshold ||
        cell.i >= cols - borderThreshold ||
        cell.j >= rows - borderThreshold;
      let farFromSpawn =
        p.dist(cell.i, cell.j, spawnCell.i, spawnCell.j) >= safeDistance;
      let notGoal = !(cell.i === goalCell.i && cell.j === goalCell.j);
      return nearBorder && farFromSpawn && notGoal;
    });

    candidateCells = p.shuffle(candidateCells);
    obstacleCount = p.min(obstacleCount, candidateCells.length);

    for (let i = 0; i < obstacleCount; i++) {
      let cell = candidateCells[i];
      if (level < 4) {
        cell.obstacle = {
          type: "static",
          radius: p.min(cellWidth, cellHeight) * 0.05,
        };
      } else {
        if (p.random() < 0.5) {
          cell.obstacle = {
            type: "moving",
            direction: p.random(["vertical", "horizontal"]),
            amplitude: p.random(3, (cellWidth / 8) * (1 + 0.1 * level)),
            speed: p.random(0.002, 0.01 * (1 + 0.1 * level)),
            radius: p.min(cellWidth, cellHeight) * 0.05,
          };
        } else {
          cell.obstacle = {
            type: "static",
            radius: p.min(cellWidth, cellHeight) * 0.05,
          };
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
      if (cell.walls[0])
        segments.push({ x1: x, y1: y, x2: x + cellWidth, y2: y });
      if (cell.walls[3])
        segments.push({ x1: x, y1: y, x2: x, y2: y + cellHeight });
      if (cell.i < cols - 1 && cell.walls[1]) {
        segments.push({
          x1: x + cellWidth,
          y1: y,
          x2: x + cellWidth,
          y2: y + cellHeight,
        });
      }
      if (cell.j < rows - 1 && cell.walls[2]) {
        segments.push({
          x1: x,
          y1: y + cellHeight,
          x2: x + cellWidth,
          y2: y + cellHeight,
        });
      }
    }
    return segments;
  }

  /* CIRCLE-LINE COLLISION TEST */
  function circleLineIntersect(cx, cy, r, x1, y1, x2, y2) {
    let dx = x2 - x1,
      dy = y2 - y1;
    let lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return p.dist(cx, cy, x1, y1) < r;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    t = p.constrain(t, 0, 1);
    let projX = x1 + t * dx,
      projY = y1 + t * dy;
    return p.dist(cx, cy, projX, projY) < r;
  }

  /* PLAYER MOVEMENT, COLLISION & BOUNCE */
  function movePlayer(vel) {
    // Horizontal movement:
    let newX = playerPos.x + vel.x;
    if (newX - ballRadius < 0) {
      newX = ballRadius;
      ballVel.x = 0;
    } else if (newX + ballRadius > p.width) {
      newX = p.width - ballRadius;
      ballVel.x = 0;
    }
    for (let seg of wallSegments) {
      if (
        circleLineIntersect(
          newX,
          playerPos.y,
          ballRadius,
          seg.x1,
          seg.y1,
          seg.x2,
          seg.y2
        )
      ) {
        newX = playerPos.x;
        ballVel.x = 0;
        break;
      }
    }
    playerPos.x = newX;

    // Vertical movement:
    let newY = playerPos.y + vel.y;
    if (newY - ballRadius < 0) {
      newY = ballRadius;
      ballVel.y = 0;
    } else if (newY + ballRadius > p.height) {
      newY = p.height - ballRadius;
      ballVel.y = 0;
    }
    for (let seg of wallSegments) {
      if (
        circleLineIntersect(
          playerPos.x,
          newY,
          ballRadius,
          seg.x1,
          seg.y1,
          seg.x2,
          seg.y2
        )
      ) {
        newY = playerPos.y;
        ballVel.y = 0;
        break;
      }
    }
    playerPos.y = newY;
  }

  /* LEVEL SETUP & RESET */
  function resetLevel() {
    let baseCellSize = p.max(20, 80 - (level - 1) * 5);
    cols = p.floor(p.width / baseCellSize);
    rows = p.floor(p.height / baseCellSize);
    cellWidth = p.width / cols;
    cellHeight = p.height / rows;

    grid = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        grid.push(new Cell(i, j));
      }
    }

    generateMaze();
    braidMaze(0.3);

    let spawnCandidates = grid.filter((cell) => cell.walls[2] === true);
    if (spawnCandidates.length > 0) spawnCell = p.random(spawnCandidates);
    else spawnCell = grid[0];

    playerPos = createVec(
      spawnCell.i * cellWidth + cellWidth / 2,
      spawnCell.j * cellHeight + cellHeight / 2
    );

    goalCell = findFarthestCellFrom(spawnCell);
    solutionPath = solveMaze();

    generateObstaclesForLevel(spawnCell);
    wallSegments = buildWallSegments();

    allowedTime = 60 + (level - 1) * 3;
    levelStartTime = p.millis();

    ballVel = createVec(0, 0);
    ballRadius = p.min(cellWidth, cellHeight) * 0.15;

    gestureHandled = false;

    jumpCount = 0;
    leftCount = 0;
    rightCount = 0;
    levelLogged = false;

    let rVal = p.random(220, 255);
    let gVal = p.random(220, 255);
    let bMax = p.min(rVal, gVal) - 10;
    let bVal = p.random(150, bMax);
    bgColor = p.color(rVal, gVal, bVal);

    p.colorMode(p.HSB);
    gridBorderColor = p.color(
      p.random(0, 360),
      p.random(60, 100),
      p.random(10, 30)
    );
    p.colorMode(p.RGB);
  }

  // ───────────────────────────────
  // UI ELEMENTS (using TailwindCSS classes)
  // ───────────────────────────────
  let mainMenuDiv, infoDiv, pauseOverlayDiv, endOverlayDiv;
  let pauseButton, exitButton;

  // ───────────────────────────────
  // Helper: Add both mouse and touch event listeners (with stopPropagation)
  // ───────────────────────────────
  function addInteractionListener(button, callback) {
    let fired = false;
    button.mousePressed((e) => {
      e.stopPropagation();
      if (!fired) {
        fired = true;
        callback();
        setTimeout(() => {
          fired = false;
        }, 300);
      }
    });
    button.elt.addEventListener("touchend", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!fired) {
        fired = true;
        callback();
        setTimeout(() => {
          fired = false;
        }, 300);
      }
    });
  }

  p.setup = function () {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.canvas.style.touchAction = "none";
    p.canvas.setAttribute("role", "application");
    p.canvas.setAttribute("aria-label", "Dash MazeX game canvas");
    p.canvas.setAttribute("tabindex", "0");
    GRAVITY = createVec(0, 0.5);
    gameState = "menu";

    // Initialize audio elements after the DOM is ready.
    initAudioElements();

    // Create Main Menu overlay
    mainMenuDiv = p.createDiv("");
    mainMenuDiv.elt.className =
      "absolute inset-0 flex flex-col justify-center items-center bg-[#0d1b2a] text-white space-y-4";
    mainMenuDiv.size(p.windowWidth, p.windowHeight);

    let title = p.createDiv("Dash MazeX 🌀");
    title.elt.className = "text-4xl font-bold mb-4";
    mainMenuDiv.child(title);

    let startButton = p.createButton("Play");
    startButton.elt.className =
      "bg-green-500 hover:bg-green-600 text-white font-bold font-mono uppercase max-w-[160px] w-full py-2 px-4 rounded mb-2";
    addInteractionListener(startButton, () => {
      resetLevel();
      gameState = "playing";
      hideMainMenu();
      showInGameUI();
    });
    mainMenuDiv.child(startButton);

    let infoButton = p.createButton("Info");
    infoButton.elt.className =
      "bg-blue-500 hover:bg-blue-600 text-white font-bold font-mono uppercase max-w-[160px] w-full py-2 px-4 rounded";
    addInteractionListener(infoButton, () => {
      gameState = "info";
      hideMainMenu();
      showInfo();
    });
    mainMenuDiv.child(infoButton);

    // Add Audio Toggle Button to Main Menu (at the bottom)
    let mainMenuAudioToggle = createAudioToggleButton();
    mainMenuDiv.child(mainMenuAudioToggle);

    // Create Info overlay
    infoDiv = p.createDiv("");
    infoDiv.elt.className =
      "absolute inset-0 flex flex-col justify-center items-center bg-[#0d1b2a] text-white p-4";
    infoDiv.size(p.windowWidth, p.windowHeight);
    infoDiv.style("display", "none");

    let infoTitle = p.createDiv("Game Info & Controls");
    infoTitle.elt.className = "text-3xl font-bold mb-4";
    infoDiv.child(infoTitle);

    let infoText = p.createDiv(
      "Controls: Use arrow keys or swipe to move, spacebar or tap + swipe up to jump. Avoid obstacles and reach the goal. Enjoy the game!"
    );
    infoText.elt.className = "mb-4 text-center";
    infoDiv.child(infoText);

    let backButton = p.createButton("Back");
    backButton.elt.className =
      "bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded";
    addInteractionListener(backButton, () => {
      gameState = "menu";
      hideInfo();
      showMainMenu();
    });
    infoDiv.child(backButton);

    // Create In-Game UI buttons (Pause & Exit)
    pauseButton = p.createButton("⏸");
    pauseButton.elt.className =
      "fixed top-0 left-1/2 text-white font-bold py-2 px-2 rounded z-10";
    pauseButton.style("display", "none");
    addInteractionListener(pauseButton, () => {
      if (gameState === "playing") {
        gameState = "paused";
        showPauseOverlay();
      }
    });

    exitButton = p.createButton("❎");
    exitButton.elt.className =
      "fixed top-0 right-1/2 text-white font-bold py-2 px-2 rounded z-10";
    exitButton.style("display", "none");
    addInteractionListener(exitButton, () => {
      // Reset level to 1 on exit.
      level = 1;
      gameState = "menu";
      hideInGameUI();
      showMainMenu();
    });

    // Create Pause overlay
    pauseOverlayDiv = p.createDiv("");
    pauseOverlayDiv.elt.className =
      "absolute inset-0 flex z-50 flex-col justify-center items-center bg-gray-900 text-white";
    pauseOverlayDiv.size(p.windowWidth, p.windowHeight);
    pauseOverlayDiv.style("display", "none");

    let pauseText = p.createDiv("Paused");
    pauseText.elt.className = "text-4xl font-bold mb-4";
    pauseOverlayDiv.child(pauseText);

    let continueButton = p.createButton("Continue");
    continueButton.elt.className =
      "bg-blue-500 hover:bg-blue-700 text-white font-bold font-mono uppercase max-w-[160px] w-full py-2 px-4 rounded mb-2";
    addInteractionListener(continueButton, () => {
      gameState = "playing";
      hidePauseOverlay();
    });
    pauseOverlayDiv.child(continueButton);

    let restartButton = p.createButton("Restart");
    restartButton.elt.className =
      "bg-green-500 hover:bg-green-700 text-white font-bold font-mono uppercase max-w-[160px] w-full py-2 px-4 rounded";
    addInteractionListener(restartButton, () => {
      // Reset level to 1 on restart.
      level = 1;
      resetLevel();
      gameState = "playing";
      hidePauseOverlay();
    });
    pauseOverlayDiv.child(restartButton);

    // Add Audio Toggle Button to Pause Overlay (at the bottom)
    let pauseAudioToggle = createAudioToggleButton();
    pauseOverlayDiv.child(pauseAudioToggle);

    // Create End overlay (for level complete / game over)
    endOverlayDiv = p.createDiv("");
    endOverlayDiv.elt.className =
      "absolute inset-0 flex flex-col justify-center items-center bg-gray-900 text-white";
    endOverlayDiv.size(p.windowWidth, p.windowHeight);
    endOverlayDiv.style("display", "none");
  };

  // ───────────────────────────────
  // UI Helper Functions
  // ───────────────────────────────
  function showMainMenu() {
    mainMenuDiv.style("display", "flex");
  }
  function hideMainMenu() {
    mainMenuDiv.style("display", "none");
  }
  function showInfo() {
    infoDiv.style("display", "flex");
  }
  function hideInfo() {
    infoDiv.style("display", "none");
  }
  function showInGameUI() {
    pauseButton.style("display", "block");
    exitButton.style("display", "block");
  }
  function hideInGameUI() {
    pauseButton.style("display", "none");
    exitButton.style("display", "none");
  }
  function showPauseOverlay() {
    pauseOverlayDiv.style("display", "flex");
  }
  function hidePauseOverlay() {
    pauseOverlayDiv.style("display", "none");
  }
  function showEndOverlay(
    titleText,
    primaryText,
    primaryCallback,
    secondaryText,
    secondaryCallback,
    disableButtons = false
  ) {
    endOverlayDiv.html(""); // clear previous content

    // Create a container for all overlay content
    let container = p.createDiv("");
    container.elt.className = "flex flex-col items-center w-full";
    endOverlayDiv.child(container);

    // Title (at the top)
    let titleDiv = p.createDiv(titleText);
    titleDiv.elt.className = "text-4xl font-bold mb-4";
    container.child(titleDiv);

    if (titleText?.toLowerCase()?.includes("complete")) {
      // Commentary placeholder (will show the AI text below the title)
      let commentaryPlaceholder = p.createDiv("");
      commentaryPlaceholder.elt.id = "commentaryPlaceholder";
      commentaryPlaceholder.style("margin", "20px 0"); // equal top & bottom margin
      commentaryPlaceholder.elt.className = "p-2";

      // Insert the loading indicator inside the placeholder
      let loadingIndicator = p.createDiv("");
      loadingIndicator.elt.className =
        "rounded-full border-l-4 border-green-500 animate-spin w-6 h-6";
      commentaryPlaceholder.child(loadingIndicator);
      container.child(commentaryPlaceholder);
      endOverlayDiv.elt.commentaryPlaceholder = commentaryPlaceholder;
    }
    // Buttons container
    let buttonsContainer = p.createDiv("");
    buttonsContainer.elt.className = "flex flex-col items-center w-full";

    // Primary button (e.g., "Continue")
    let primaryButton = p.createButton(primaryText);
    primaryButton.elt.className =
      "bg-blue-500 hover:bg-blue-700 text-white font-bold font-mono uppercase max-w-[160px] w-full py-2 px-4 rounded mb-2";
    if (disableButtons) {
      primaryButton.attribute("disabled", "");
      primaryButton.addClass("opacity-50 cursor-not-allowed");
    }
    addInteractionListener(primaryButton, () => {
      primaryCallback();
      endOverlayDiv.style("display", "none");
    });
    buttonsContainer.child(primaryButton);

    // Secondary button (e.g., "Restart" or "Exit")
    let secondaryButton = p.createButton(secondaryText);
    secondaryButton.elt.className =
      "bg-green-500 hover:bg-green-700 text-white font-bold font-mono uppercase max-w-[160px] w-full py-2 px-4 rounded";
    if (disableButtons) {
      secondaryButton.attribute("disabled", "");
      secondaryButton.addClass("opacity-50 cursor-not-allowed");
    }
    addInteractionListener(secondaryButton, () => {
      // On restart/exit from end overlay, reset level to 1.
      level = 1;
      secondaryCallback();
      endOverlayDiv.style("display", "none");
    });
    buttonsContainer.child(secondaryButton);

    // Add buttons container to the main container
    container.child(buttonsContainer);

    // Add Audio Toggle Button to End Overlay (at the bottom)
    let endAudioToggle = createAudioToggleButton();
    container.child(endAudioToggle);

    endOverlayDiv.style("display", "flex");

    // Save references to the actual DOM elements for later re-enabling
    endOverlayDiv.elt.primaryButton = primaryButton.elt;
    endOverlayDiv.elt.secondaryButton = secondaryButton.elt;
  }

  // ───────────────────────────────
  // p.draw function
  // ───────────────────────────────
  p.draw = function () {
    // Always paint the background (using bgColor if set)
    p.background(bgColor || p.color(30, 40, 50));

    if (gameState === "playing") {
      // Game logic update:
      for (let cell of grid) {
        cell.show();
      }
      p.noFill();
      p.stroke(0);
      p.strokeWeight(4);
      p.rect(0, 0, p.width, p.height);
      p.strokeWeight(1);
      drawHUD();

      let gx = goalCell.i * cellWidth;
      let gy = goalCell.j * cellHeight;
      p.noStroke();
      p.fill(0, 255, 0, 150);
      p.rect(gx, gy, cellWidth, cellHeight);

      let elapsedTime = p.millis() - levelStartTime;
      let timeLeftMs = allowedTime * 1000 - elapsedTime;
      if (timeLeftMs <= 0) {
        playSound("audio-gameover");
        gameState = "gameover";
        hideInGameUI();
        showEndOverlay(
          "Game Over! 💥",
          "Restart",
          () => {
            level = 1;
            resetLevel();
            gameState = "playing";
            showInGameUI();
          },
          "Exit",
          () => {
            level = 1;
            gameState = "menu";
            showMainMenu();
          }
        );
        return;
      }

      ballVel.y += GRAVITY.y;
      ballVel.y *= 0.99;
      ballVel.x *= 0.95;

      if (p.keyIsDown(p.LEFT_ARROW)) {
        ballVel.x = -5;
      }
      if (p.keyIsDown(p.RIGHT_ARROW)) {
        ballVel.x = 5;
      }
      if (p.touches.length > 0) {
        let t = p.touches[0];
        if (t.x < p.width / 2 - 20) {
          ballVel.x = -5;
        }
        if (t.x > p.width / 2 + 20) {
          ballVel.x = 5;
        }
      }

      movePlayer(ballVel);

      for (let cell of grid) {
        if (cell.obstacle) {
          let baseX = cell.i * cellWidth + cellWidth / 2;
          let baseY = cell.j * cellHeight + cellHeight / 2;
          let obsPos = createVec(baseX, baseY);
          if (cell.obstacle.type === "moving") {
            if (cell.obstacle.direction === "vertical") {
              obsPos.y +=
                cell.obstacle.amplitude *
                p.sin(p.millis() * cell.obstacle.speed);
            } else {
              obsPos.x +=
                cell.obstacle.amplitude *
                p.sin(p.millis() * cell.obstacle.speed);
            }
          }
          p.noStroke();
          p.fill(
            cell.obstacle.type === "static"
              ? p.color(150, 0, 0)
              : p.color(255, 165, 0)
          );
          let obsRadius = p.min(cellWidth, cellHeight) * 0.05;
          p.ellipse(obsPos.x, obsPos.y, obsRadius * 2);
          if (
            p.dist(playerPos.x, playerPos.y, obsPos.x, obsPos.y) <
            ballRadius + obsRadius
          ) {
            // When an obstacle hit occurs, play the game over audio.
            playSound("audio-gameover");
            gameState = "gameover";
            hideInGameUI();
            showEndOverlay(
              "Game Over! 💥",
              "Restart",
              () => {
                level = 1;
                resetLevel();
                gameState = "playing";
                showInGameUI();
              },
              "Exit",
              () => {
                level = 1;
                gameState = "menu";
                showMainMenu();
              }
            );
            return;
          }
        }
      }

      p.fill(0, 0, 255);
      p.noStroke();
      p.ellipse(playerPos.x, playerPos.y, ballRadius * 2);

      if (
        playerPos.x > gx &&
        playerPos.x < gx + cellWidth &&
        playerPos.y > gy &&
        playerPos.y < gy + cellHeight
      ) {
        if (!levelLogged) {
          playSound("audio-complete");
          const playerDetails = logLevelStats();
          levelLogged = true; // ensure stats and commentary are logged only once

          // Hide the in-game UI and show the overlay with buttons disabled.
          hideInGameUI();
          showEndOverlay(
            "Level Complete! 🎉",
            "Continue",
            () => {
              level++; // Proceed to next level.
              resetLevel();
              gameState = "playing";
              showInGameUI();
            },
            "Restart",
            () => {
              // Reset level to 1 on restart.
              level = 1;
              resetLevel();
              gameState = "playing";
              showInGameUI();
            },
            true // disable buttons while commentary loads
          );

          // Load the commentary only if the user is online.
          if (window && window.navigator.onLine) {
            getCommentary(playerDetails)
              .then((commentary) => {
                let commentaryPlaceholder = document.getElementById(
                  "commentaryPlaceholder"
                );
                if (commentaryPlaceholder) {
                  commentaryPlaceholder.innerHTML = "";
                  commentaryPlaceholder.innerHTML =
                    '"' + commentary?.replaceAll('"', "") + '"';
                  commentaryPlaceholder.style.textAlign = "center";
                  commentaryPlaceholder.style.fontStyle = "italic";
                  commentaryPlaceholder.style.fontWeight = "600";
                }
                if (endOverlayDiv.elt.primaryButton) {
                  endOverlayDiv.elt.primaryButton.removeAttribute("disabled");
                  endOverlayDiv.elt.primaryButton.classList.remove(
                    "opacity-50",
                    "cursor-not-allowed"
                  );
                }
                if (endOverlayDiv.elt.secondaryButton) {
                  endOverlayDiv.elt.secondaryButton.removeAttribute("disabled");
                  endOverlayDiv.elt.secondaryButton.classList.remove(
                    "opacity-50",
                    "cursor-not-allowed"
                  );
                }
              })
              .catch((err) => {
                console.error("AI Commentary Failed:", err);
                let commentaryPlaceholder = document.getElementById(
                  "commentaryPlaceholder"
                );
                if (commentaryPlaceholder) {
                  commentaryPlaceholder.innerHTML =
                    '"Failed to load commentary."';
                  commentaryPlaceholder.style.textAlign = "center";
                  commentaryPlaceholder.style.fontStyle = "italic";
                  commentaryPlaceholder.style.fontWeight = "600";
                }
                if (endOverlayDiv.elt.primaryButton) {
                  endOverlayDiv.elt.primaryButton.removeAttribute("disabled");
                  endOverlayDiv.elt.primaryButton.classList.remove(
                    "opacity-50",
                    "cursor-not-allowed"
                  );
                }
                if (endOverlayDiv.elt.secondaryButton) {
                  endOverlayDiv.elt.secondaryButton.removeAttribute("disabled");
                  endOverlayDiv.elt.secondaryButton.classList.remove(
                    "opacity-50",
                    "cursor-not-allowed"
                  );
                }
              });
          }
        }
        gameState = "levelComplete";
        return;
      }
    } else if (gameState === "paused") {
      // Game logic is halted; the pause overlay is shown.
    }
    // For other states ("menu", "info", "levelComplete", "gameover")
    // the respective HTML overlays are visible.
  };

  function drawHUD() {
    p.textFont("monospace");
    p.textStyle(p.BOLD);
    let fontSize = 16;
    p.textSize(fontSize);
    p.textAlign(p.RIGHT, p.TOP);

    let remainingTime = p.max(
      0,
      (allowedTime * 1000 - (p.millis() - levelStartTime)) / 1000
    );
    let seconds = Math.floor(remainingTime);
    let timeString = "";
    if (seconds < 60) {
      timeString = seconds + "s";
    } else if (seconds < 3600) {
      let minutes = Math.floor(seconds / 60);
      let secs = seconds % 60;
      timeString = minutes + "m " + secs + "s";
    } else {
      let hours = Math.floor(seconds / 3600);
      let minutes = Math.floor((seconds % 3600) / 60);
      let secs = seconds % 60;
      timeString = hours + "h " + minutes + "m " + secs + "s";
    }

    let timeLine = "⏳ " + timeString;
    let levelLine = "Lvl: " + level;

    let padding = 5;
    let lineSpacing = 4;

    let timeWidth = p.textWidth(timeLine);
    let levelWidth = p.textWidth(levelLine);
    let maxWidth = p.max(timeWidth, levelWidth);

    let rectWidth = maxWidth + 2 * padding;
    let rectHeight = 2 * fontSize + lineSpacing + 2 * padding;

    p.noStroke();
    p.fill(0, 150);
    p.rect(p.width - rectWidth, 0, rectWidth, rectHeight);

    p.fill(255);
    p.text(timeLine, p.width - padding, padding);
    p.text(levelLine, p.width - padding, padding + fontSize + lineSpacing);
  }

  // ───────────────────────────────
  // EVENT HANDLERS (active during playing state)
  // ───────────────────────────────
  p.keyPressed = function (e) {
    if (gameState === "playing") {
      if (p.key === " ") {
        ballVel.y = -8;
        jumpCount++;
        playSound("audio-bounce");
      } else if (p.keyCode === p.LEFT_ARROW) {
        ballVel.x = -5;
        leftCount++;
      } else if (p.keyCode === p.RIGHT_ARROW) {
        ballVel.x = 5;
        rightCount++;
      }
    }
  };

  p.mousePressed = function (e) {
    if (e && e.target !== p.canvas) return;
    if (gameState === "playing") {
      gestureStart = createVec(p.mouseX, p.mouseY);
      gestureHandled = false;
    }
  };

  p.mouseDragged = function (e) {
    if (e && e.target !== p.canvas) return;
    if (gameState === "playing") {
      let currentPos = createVec(p.mouseX, p.mouseY);
      if (!gestureStart) {
        gestureStart = currentPos;
      }
      let delta = vecSub(currentPos, gestureStart);
      let threshold = 20;
      if (!gestureHandled) {
        if (Math.abs(delta.x) > threshold && Math.abs(delta.y) > threshold) {
          ballVel.x = delta.x < 0 ? -5 : 5;
          ballVel.y = -8;
          if (delta.x < 0) {
            leftCount++;
          } else {
            rightCount++;
          }
          jumpCount++;
          playSound("audio-bounce");
          gestureHandled = true;
        } else if (
          Math.abs(delta.x) > Math.abs(delta.y) &&
          Math.abs(delta.x) > threshold
        ) {
          ballVel.x = delta.x < 0 ? -5 : 5;
          if (delta.x < 0) {
            leftCount++;
          } else {
            rightCount++;
          }
          gestureHandled = true;
        } else if (
          Math.abs(delta.y) > Math.abs(delta.x) &&
          Math.abs(delta.y) > threshold
        ) {
          ballVel.y = -8;
          jumpCount++;
          playSound("audio-bounce");
          gestureHandled = true;
        }
      }
    }
  };

  p.mouseReleased = function (e) {
    if (e && e.target !== p.canvas) return;
    if (gameState === "playing" && !gestureHandled) {
      ballVel.y = -8;
      jumpCount++;
      playSound("audio-bounce");
    }
  };

  p.touchStarted = function (e) {
    if (e && e.target !== p.canvas) return false;
    if (gameState === "playing") {
      if (p.touches.length > 0) {
        gestureStart = createVec(p.touches[0].x, p.touches[0].y);
        gestureHandled = false;
      }
    }
    return false;
  };

  p.touchMoved = function (e) {
    if (e && e.target !== p.canvas) return false;
    if (gameState === "playing" && p.touches.length > 0) {
      let currentPos = createVec(p.touches[0].x, p.touches[0].y);
      if (!gestureStart) {
        gestureStart = currentPos;
      }
      let delta = vecSub(currentPos, gestureStart);
      let threshold = 20;
      if (!gestureHandled) {
        if (Math.abs(delta.x) > threshold && Math.abs(delta.y) > threshold) {
          ballVel.x = delta.x < 0 ? -5 : 5;
          ballVel.y = -8;
          if (delta.x < 0) {
            leftCount++;
          } else {
            rightCount++;
          }
          jumpCount++;
          playSound("audio-bounce");
          gestureHandled = true;
        } else if (
          Math.abs(delta.x) > Math.abs(delta.y) &&
          Math.abs(delta.x) > threshold
        ) {
          ballVel.x = delta.x < 0 ? -5 : 5;
          if (delta.x < 0) {
            leftCount++;
          } else {
            rightCount++;
          }
          gestureHandled = true;
        } else if (
          Math.abs(delta.y) > Math.abs(delta.x) &&
          Math.abs(delta.y) > threshold
        ) {
          ballVel.y = -8;
          jumpCount++;
          playSound("audio-bounce");
          gestureHandled = true;
        }
      }
    }
    return false;
  };

  p.touchEnded = function (e) {
    if (e && e.target !== p.canvas) return false;
    if (gameState === "playing" && !gestureHandled && ballVel) {
      ballVel.y = -8;
      jumpCount++;
      playSound("audio-bounce");
    }
    return false;
  };

  p.windowResized = function () {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    if (mainMenuDiv) mainMenuDiv.size(p.windowWidth, p.windowHeight);
    if (infoDiv) infoDiv.size(p.windowWidth, p.windowHeight);
    if (pauseOverlayDiv) pauseOverlayDiv.size(p.windowWidth, p.windowHeight);
    if (endOverlayDiv) endOverlayDiv.size(p.windowWidth, p.windowHeight);
    resetLevel();
  };
};

export default sketch;
