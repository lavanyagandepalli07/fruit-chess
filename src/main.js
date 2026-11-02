import * as THREE from "three";
import "./style.css";
import { ChessGame } from "./chess-game.js";

const CHESS_STATE = { W: "w", B: "b" };
let MODE = "hotseat", PLAYER_W = "Strawberry", PLAYER_B = "Blueberry", HUMAN_SIDE = "w";
let game = new ChessGame();
let board = game.board;
let turn = game.turn;
let winner = null, gameOver = false, selected = null, capturedW = [], capturedB = [];
let darkMode = false;
let claimedDraw = null;
let pendingPromotion = null;
let engineWorker = null, engineReady = false, aiBusy = false, aiStopPending = false, aiPending = false;
let aiRequestRevision = null, gameRevision = 0, aiError = "";

const squareAt = (row, column) => `${String.fromCharCode(97 + column)}${8 - row}`;
const rowAt = (square) => 8 - Number(square[1]);
const columnAt = (square) => square.charCodeAt(0) - 97;

function getLegalMoves(_position, row, column, side) {
    if (!board[row][column] || side !== game.turn) return [];
    return [...new Set(game.legalMoves(squareAt(row, column)).map((move) => move.to))]
        .map((square) => [rowAt(square), columnAt(square)]);
}

function syncGameState() {
    board = game.board;
    turn = game.turn;
    const outcome = game.outcome;
    gameOver = Boolean(outcome) || Boolean(claimedDraw);
    winner = outcome?.winner ?? null;
    return outcome;
}
/* ===================================================
   THREE.JS SETUP
=================================================== */
const canvas = document.getElementById("game");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xfff1f4);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
camera.position.set(0, 75, 80);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

function resize() {
    const w = Math.min(800, window.innerWidth - 32);
    renderer.setSize(w, w * 0.75);
    camera.aspect = w / (w * 0.75);
    camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

const amb = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(40, 100, 30);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
scene.add(sun);

const boardGroup = new THREE.Group();
const pieceGroup = new THREE.Group();
const uiGroup = new THREE.Group();
scene.add(boardGroup, pieceGroup, uiGroup);

const CELL_SIZE = 10, BOARD_OFFSET = 35;

for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
        const isDark = (r + c) % 2 === 1;
        const mat = new THREE.MeshStandardMaterial({
            color: isDark ? 0xffced4 : 0xffffff,
            roughness: 0.2,
            metalness: 0.1
        });
        const geo = new THREE.BoxGeometry(CELL_SIZE - 0.2, 2, CELL_SIZE - 0.2);
        const sq = new THREE.Mesh(geo, mat);
        sq.position.set(c * CELL_SIZE - BOARD_OFFSET, -1, r * CELL_SIZE - BOARD_OFFSET);
        sq.receiveShadow = true;
        sq.userData = { r, c, isDark };
        boardGroup.add(sq);
    }
}

function updateTheme() {
    const gameStarted = !document.getElementById("game-ui").classList.contains("hidden");
    const setupMode = document.getElementById("mode").value;
    const side = gameStarted
        ? MODE === "hotseat" ? turn : HUMAN_SIDE
        : setupMode === "ai" ? HUMAN_SIDE : CHESS_STATE.W;
    document.body.classList.toggle("dark-mode", darkMode);
    document.body.dataset.side = side;
    document.body.dataset.screen = gameStarted ? "game" : "setup";
    const background = !gameStarted
        ? darkMode ? 0x193322 : 0xf0f8f0
        : darkMode
            ? side === CHESS_STATE.W ? 0x321923 : 0x17284b
            : side === CHESS_STATE.W ? 0xfff1f4 : 0xeff5ff;
    scene.background.setHex(background);

    for (const square of boardGroup.children) {
        const colors = darkMode
            ? side === CHESS_STATE.W
                ? [0x6b2638, 0x48202d]
                : [0x25477f, 0x1b315a]
            : side === CHESS_STATE.W
                ? [0xf4cbd2, 0xfff7f8]
                : [0xd4e1f8, 0xf6f9ff];
        square.material.color.setHex(colors[square.userData.isDark ? 0 : 1]);
    }

    const toggle = document.getElementById("theme-toggle");
    const icon = document.getElementById("theme-icon");
    const label = document.getElementById("theme-label");
    toggle.setAttribute("aria-label", darkMode ? "Switch to light mode" : "Switch to dark mode");
    toggle.setAttribute("aria-pressed", String(darkMode));
    icon.textContent = darkMode ? "☀️" : "🌙";
    label.textContent = darkMode ? "Light mode" : "Dark mode";
}

document.getElementById("theme-toggle").addEventListener("click", () => {
    darkMode = !darkMode;
    updateTheme();
});
updateTheme();

const pieceMaterials = {
    gold: new THREE.MeshStandardMaterial({ color: 0xf0c66c, roughness: 0.3, metalness: 0.35 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x287a4b, roughness: 0.58, side: THREE.DoubleSide }),
    seed: new THREE.MeshStandardMaterial({ color: 0xffefb5, roughness: 0.52 }),
    strawberry: new THREE.MeshStandardMaterial({ color: 0xe51e3d, roughness: 0.38 }),
    blueberry: new THREE.MeshStandardMaterial({ color: 0x4757c9, roughness: 0.44 })
};

const strawberryProfile = [
    [0, 0], [0.35, 0.05], [0.7, 0.2], [1.05, 0.48],
    [1.38, 0.9], [1.62, 1.38], [1.7, 1.8], [1.58, 2.2],
    [1.25, 2.55], [0.78, 2.78], [0.28, 2.88], [0, 2.9]
].map(([radius, height]) => new THREE.Vector2(radius, height));

function createBerry(side, scale) {
    const berry = new THREE.Group();
    berry.scale.setScalar(scale);
    if (side === "w") {
        berry.add(new THREE.Mesh(
            new THREE.LatheGeometry(strawberryProfile, 32),
            pieceMaterials.strawberry
        ));

        const seedGeometry = new THREE.SphereGeometry(0.09, 7, 5);
        for (let i = 0; i < 22; i++) {
            const t = 0.14 + (i % 11) * 0.072;
            const angle = i * 2.399963;
            const radius = 1.72 * Math.sin(Math.min(1, t + 0.05) * Math.PI / 2)
                * (1 - 0.52 * Math.pow(t, 6));
            const seed = new THREE.Mesh(seedGeometry, pieceMaterials.seed);
            seed.position.set(Math.cos(angle) * radius, t * 2.9, Math.sin(angle) * radius);
            seed.scale.set(0.75, 1.15, 0.75);
            berry.add(seed);
        }

        const leaf = new THREE.SphereGeometry(0.8, 8, 6);
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const sepal = new THREE.Mesh(leaf, pieceMaterials.leaf);
            sepal.scale.set(1, 0.18, 0.38);
            sepal.position.set(Math.cos(angle) * 0.55, 2.83, Math.sin(angle) * 0.55);
            sepal.rotation.y = -angle;
            berry.add(sepal);
        }
    } else {
        const fruit = new THREE.Mesh(
            new THREE.SphereGeometry(1.48, 32, 24),
            pieceMaterials.blueberry
        );
        fruit.position.y = 1.42;
        fruit.scale.set(1, 0.92, 1);
        berry.add(fruit);

        const calyx = new THREE.Mesh(
            new THREE.ConeGeometry(0.46, 0.48, 5),
            pieceMaterials.leaf
        );
        calyx.position.y = 2.76;
        calyx.rotation.y = Math.PI / 5;
        berry.add(calyx);
        const bloom = new THREE.Mesh(
            new THREE.TorusGeometry(0.46, 0.075, 8, 24),
            pieceMaterials.leaf
        );
        bloom.rotation.x = Math.PI / 2;
        bloom.position.y = 2.58;
        berry.add(bloom);
    }
    return berry;
}

function createPieceGeo(side, type) {
    const piece = new THREE.Group();
    const isStrawberry = side === "w";
    const baseColor = isStrawberry ? 0x542a34 : 0x242943;
    const baseMaterial = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.4 });

    const addCylinder = (top, bottom, height, y, material, segments = 40) => {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(top, bottom, height, segments),
            material
        );
        mesh.position.y = y;
        piece.add(mesh);
    };

    addCylinder(1.92, 2.16, 0.34, 0.22, baseMaterial);
    addCylinder(1.4, 1.98, 0.28, 0.53, baseMaterial);

    for (const [radius, y] of [[1.98, 0.41], [1.46, 0.68]]) {
        const trim = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 0.05, 8, 40),
            pieceMaterials.gold
        );
        trim.rotation.x = Math.PI / 2;
        trim.position.y = y;
        piece.add(trim);
    }

    const fruitScale = { P: 1.02, R: 1.12, N: 1.08, B: 1.12, Q: 1.16, K: 1.16 }[type];
    const fruitBase = 0.72;
    const fruit = createBerry(side, fruitScale);
    fruit.position.y = fruitBase;
    piece.add(fruit);
    const fruitTop = fruitBase + (isStrawberry ? 2.9 : 2.82) * fruitScale;

    if (type === "R") {
        const tower = new THREE.Group();
        tower.position.y = fruitTop - 0.1;
        tower.add(new THREE.Mesh(
            new THREE.CylinderGeometry(1.35, 1.12, 0.34, 8),
            pieceMaterials.gold
        ));
        const battlement = new THREE.BoxGeometry(0.72, 1.05, 0.72);
        for (const [x, z] of [[-0.82, -0.82], [-0.82, 0.82], [0.82, -0.82], [0.82, 0.82]]) {
            const merlon = new THREE.Mesh(battlement, pieceMaterials.gold);
            merlon.position.set(x, 0.58, z);
            tower.add(merlon);
        }
        piece.add(tower);
    } else if (type === "N") {
        const horse = new THREE.Shape();
        horse.moveTo(-0.8, -0.8);
        horse.quadraticCurveTo(-0.1, -0.52, 0.12, -0.08);
        horse.lineTo(0.18, 0.42);
        horse.lineTo(-0.5, 1.5);
        horse.lineTo(0.28, 1.18);
        horse.lineTo(0.72, 0.62);
        horse.lineTo(1.35, 0.34);
        horse.lineTo(0.88, 0.02);
        horse.lineTo(0.82, -0.52);
        horse.lineTo(0.38, -0.92);
        horse.closePath();
        const knight = new THREE.Mesh(
            new THREE.ExtrudeGeometry(horse, { depth: 0.55, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1 }),
            pieceMaterials.gold
        );
        knight.scale.set(1.3, 1.75, 1);
        knight.position.set(-0.55, fruitTop - 0.45, 0.72);
        piece.add(knight);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), baseMaterial);
        eye.position.set(0.31, fruitTop + 1.2, 1.24);
        piece.add(eye);
    } else if (type === "B") {
        const mitre = new THREE.Mesh(
            new THREE.ConeGeometry(1.12, 3.1, 4),
            pieceMaterials.gold
        );
        mitre.position.y = fruitTop + 1.2;
        mitre.rotation.y = Math.PI / 4;
        piece.add(mitre);
        const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.82, 0.12, 8, 24),
            baseMaterial
        );
        band.position.y = fruitTop + 0.16;
        piece.add(band);
        const slit = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 1.25, 0.22),
            baseMaterial
        );
        slit.position.set(0.08, fruitTop + 1.2, 0.98);
        slit.rotation.z = -0.38;
        piece.add(slit);
    } else if (type === "Q") {
        const crown = new THREE.Group();
        crown.position.y = fruitTop;
        const band = new THREE.Mesh(
            new THREE.TorusGeometry(1.02, 0.14, 10, 32),
            pieceMaterials.gold
        );
        band.rotation.x = Math.PI / 2;
        crown.add(band);
        const spikeGeometry = new THREE.ConeGeometry(0.28, 1.6, 8);
        const jewelGeometry = new THREE.SphereGeometry(0.25, 12, 10);
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const x = Math.cos(angle) * 0.9;
            const z = Math.sin(angle) * 0.9;
            const spike = new THREE.Mesh(spikeGeometry, pieceMaterials.gold);
            spike.position.set(x, 0.72, z);
            crown.add(spike);
            const jewel = new THREE.Mesh(jewelGeometry, pieceMaterials.gold);
            jewel.position.set(x, 1.55, z);
            crown.add(jewel);
        }
        piece.add(crown);
    } else if (type === "K") {
        const cross = new THREE.Group();
        cross.position.set(0, fruitTop, 0);
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.5, 0.42), pieceMaterials.gold);
        const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.42), pieceMaterials.gold);
        crossbar.position.y = 0.5;
        cross.add(upright, crossbar);
        piece.add(cross);
    }

    return piece;
}

function clearGroup(group) {
    const geometries = new Set();
    const materials = new Set();
    group.traverse(node => {
        if (node.geometry) geometries.add(node.geometry);
        if (node.material) {
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!Object.values(pieceMaterials).includes(material)) {
                    materials.add(material);
                }
            }
        }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    group.clear();
}

function drawBoard() {
    clearGroup(pieceGroup);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;
            const container = new THREE.Group();
            const visuals = createPieceGeo(p[0], p[1]);
            visuals.traverse(node => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            container.add(visuals);
            container.position.set(c * CELL_SIZE - BOARD_OFFSET, 0, r * CELL_SIZE - BOARD_OFFSET);
            container.userData = { r, c };
            pieceGroup.add(container);
            if (selected && selected.r === r && selected.c === c) {
                const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(4.5, 0.4, 8, 32),
                    new THREE.MeshBasicMaterial({ color: 0x10b981 })
                );
                ring.rotation.x = Math.PI/2;
                ring.position.y = 0.5;
                container.add(ring);
            }
        }
    }
}

function drawUI() {
    clearGroup(uiGroup);
    if (!selected) return;
    getLegalMoves(board, selected.r, selected.c, turn).forEach(([mr, mc]) => {
        const dot = new THREE.Mesh(
            new THREE.CircleGeometry(2.2, 24),
            new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.4 })
        );
        dot.rotation.x = -Math.PI/2;
        dot.position.set(mc * CELL_SIZE - BOARD_OFFSET, 0.2, mr * CELL_SIZE - BOARD_OFFSET);
        uiGroup.add(dot);
    });
}

/* ===================================================
   GAMEPLAY, PROMOTION, AND STOCKFISH
=================================================== */
let currentTheta = Math.PI / 2;
let targetTheta = Math.PI / 2;
const FIXED_PHI = 0.9;
const RADIUS = 135;

function updateCameraTurn() {
    targetTheta = MODE === "hotseat"
        ? turn === CHESS_STATE.W ? Math.PI / 2 : -Math.PI / 2
        : HUMAN_SIDE === CHESS_STATE.W ? Math.PI / 2 : -Math.PI / 2;
    updateTheme();
}

const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const promotionDialog = document.getElementById("promotion-dialog");

function closePromotionDialog() {
    promotionDialog.classList.add("hidden");
    promotionDialog.classList.remove("flex");
    pendingPromotion = null;
}

function getAvailableDrawClaim() {
    if (claimedDraw) return null;
    if (game.canClaimDraw) return { type: game.canClaimDraw, move: null };
    if (!selected) return null;
    const from = squareAt(selected.r, selected.c);
    for (const move of game.legalMoves(from)) {
        const type = game.canClaimDrawAfterMove(from, move.to, move.promotion || "q");
        if (type) return { type, move: { from, to: move.to } };
    }
    return null;
}

function showPromotionDialog(from, to) {
    pendingPromotion = { from, to };
    promotionDialog.classList.remove("hidden");
    promotionDialog.classList.add("flex");
    promotionDialog.querySelector("[data-promotion='q']").focus();
}

function setAiError(message) {
    aiError = message;
    const errorElement = document.getElementById("ai-error");
    errorElement.textContent = message;
    errorElement.classList.remove("hidden");
    document.getElementById("status").textContent = "Stockfish is unavailable";
}

function clearAiError() {
    aiError = "";
    const errorElement = document.getElementById("ai-error");
    errorElement.textContent = "";
    errorElement.classList.add("hidden");
}

function startEngine() {
    if (engineWorker) return;
    try {
        engineWorker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
    } catch (error) {
        setAiError(`Could not start Stockfish: ${error.message}`);
        return;
    }

    engineWorker.addEventListener("message", ({ data }) => {
        const line = String(data).trim();
        if (line === "uciok") {
            engineWorker.postMessage("isready");
        } else if (line === "readyok") {
            engineReady = true;
            clearAiError();
            if (MODE === "ai" && turn !== HUMAN_SIDE) requestAiMove();
        } else if (line.startsWith("bestmove ")) {
            if (aiStopPending) {
                aiStopPending = false;
                aiBusy = false;
                if (aiPending) requestAiMove();
                return;
            }
            if (aiRequestRevision === null) return;
            const requestedRevision = aiRequestRevision;
            aiRequestRevision = null;
            aiBusy = false;
            if (requestedRevision !== gameRevision || gameOver || turn === HUMAN_SIDE) return;

            const bestMove = line.split(/\s+/)[1];
            if (!bestMove || bestMove === "(none)" || bestMove === "0000") {
                setAiError("Stockfish returned no move for a position that is not over.");
                return;
            }
            try {
                makeMove(bestMove.slice(0, 2), bestMove.slice(2, 4), bestMove[4] || "q");
            } catch (error) {
                setAiError(`Stockfish returned an invalid move: ${error.message}`);
            }
        }
    });
    engineWorker.addEventListener("error", (event) => {
        aiBusy = false;
        aiRequestRevision = null;
        setAiError(`Stockfish failed to load: ${event.message || "unknown worker error"}`);
    });
    engineWorker.postMessage("uci");
}

function requestAiMove() {
    if (MODE !== "ai" || gameOver || turn === HUMAN_SIDE) return;
    if (aiBusy) {
        aiPending = true;
        return;
    }
    if (!engineWorker) startEngine();
    if (!engineWorker) return;
    if (!engineReady) {
        document.getElementById("status").textContent = "Loading Stockfish…";
        return;
    }

    aiPending = false;
    aiBusy = true;
    aiRequestRevision = gameRevision;
    document.getElementById("status").textContent = "Stockfish is thinking…";
    const depth = Number(document.getElementById("ai-difficulty").value);
    engineWorker.postMessage(`position fen ${game.fen}`);
    engineWorker.postMessage(`go depth ${depth}`);
}

function makeMove(from, to, promotion = "q") {
    const move = game.move(from, to, promotion);
    if (move.captured) {
        (move.color === CHESS_STATE.W ? capturedB : capturedW).push(move.color === CHESS_STATE.W ? "🫐" : "🍓");
    }
    claimedDraw = null;
    gameRevision++;
    selected = null;
    syncGameState();
    updateCameraTurn();
    updateUI();
    drawBoard();
    drawUI();
    if (!gameOver && MODE === "ai" && turn !== HUMAN_SIDE) setTimeout(requestAiMove, 100);
    return move;
}

canvas.onclick = (event) => {
    if (gameOver || pendingPromotion || (MODE === "ai" && turn !== HUMAN_SIDE)) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);

    const hits = ray.intersectObjects([...pieceGroup.children, ...boardGroup.children], true);
    if (!hits.length) return;
    let target = hits[0].object;
    while (target.parent && target.userData.r === undefined) target = target.parent;
    const { r, c } = target.userData;

    if (board[r][c]?.startsWith(turn)) {
        selected = { r, c };
    } else if (selected) {
        const from = squareAt(selected.r, selected.c);
        const to = squareAt(r, c);
        const move = game.legalMoves(from).find((candidate) => candidate.to === to);
        if (move) {
            if (move.promotion) showPromotionDialog(from, to);
            else makeMove(from, to);
        } else {
            selected = null;
        }
    }
    drawBoard();
    drawUI();
    updateUI();
};

promotionDialog.querySelectorAll("[data-promotion]").forEach((button) => {
    button.addEventListener("click", () => {
        if (!pendingPromotion) return;
        const { from, to } = pendingPromotion;
        const promotion = button.dataset.promotion;
        closePromotionDialog();
        makeMove(from, to, promotion);
    });
});

document.getElementById("undo").addEventListener("click", () => {
    if (pendingPromotion) closePromotionDialog();
    claimedDraw = null;
    if (!game.history.length) return;
    if (aiBusy && engineWorker) {
        aiStopPending = true;
        aiPending = false;
        engineWorker.postMessage("stop");
    }
    const plies = MODE === "ai" && game.history.length > 1 ? 2 : 1;
    for (let i = 0; i < plies; i++) game.undo();
    gameRevision++;
    capturedW = [];
    capturedB = [];
    for (const move of game.history) {
        if (move.captured) (move.color === CHESS_STATE.W ? capturedB : capturedW).push(move.color === CHESS_STATE.W ? "🫐" : "🍓");
    }
    syncGameState();
    updateCameraTurn();
    updateUI();
    drawBoard();
    drawUI();
    if (!gameOver && MODE === "ai" && turn !== HUMAN_SIDE) setTimeout(requestAiMove, 100);
});

document.getElementById("claim-draw").addEventListener("click", () => {
    const claim = getAvailableDrawClaim();
    if (!claim) return;
    claimedDraw = claim.type;
    if (claim.move) {
        const move = game.legalMoves(claim.move.from).find((candidate) => candidate.to === claim.move.to);
        document.getElementById("status").textContent =
            `Draw claimed by ${claim.move.from}-${claim.move.to}${move?.san ? ` (${move.san})` : ""}.`;
    }
    syncGameState();
    updateUI();
});

function updateUI() {
    const statusLabel = document.getElementById("status");
    const checkStatus = document.getElementById("check-status");
    const indicator = document.getElementById("turn-indicator");
    const outcome = game.outcome;

    indicator.textContent = turn === CHESS_STATE.W ? "🍓" : "🫐";
    const drawClaim = getAvailableDrawClaim();
    if (claimedDraw) {
        statusLabel.textContent = claimedDraw === "threefold-repetition"
            ? "Draw claimed by threefold repetition."
            : "Draw claimed by the 50-move rule.";
    } else if (outcome?.type === "checkmate") {
        statusLabel.textContent = `${winner === CHESS_STATE.W ? PLAYER_W : PLAYER_B} wins by checkmate! 🏆`;
    } else if (outcome) {
        const drawLabels = {
            stalemate: "Draw by stalemate.",
            "threefold-repetition": "Draw by threefold repetition.",
            "fifty-move-rule": "Draw by the 50-move rule.",
            "insufficient-material": "Draw by insufficient material.",
            "seventy-five-move-rule": "Draw by the 75-move rule.",
            "fivefold-repetition": "Draw by fivefold repetition.",
        };
        statusLabel.textContent = drawLabels[outcome.type] || "Draw.";
    } else if (!aiError) {
        const name = turn === CHESS_STATE.W ? PLAYER_W : PLAYER_B;
        statusLabel.textContent = MODE === "ai" && turn !== HUMAN_SIDE
            ? aiBusy ? "Stockfish is thinking…" : "Waiting for Stockfish…"
            : `${name}'s Turn`;
    }
    checkStatus.classList.toggle("hidden", !game.isCheck || gameOver);
    const claimButton = document.getElementById("claim-draw");
    claimButton.classList.toggle("hidden", !drawClaim || gameOver);
    claimButton.textContent = drawClaim?.move
        ? `Claim draw with ${drawClaim.move.from}-${drawClaim.move.to}`
        : "Claim draw";
    document.getElementById("captured-w").innerHTML = capturedW.map(() => `<div class="captured-slot">🍓</div>`).join("");
    document.getElementById("captured-b").innerHTML = capturedB.map(() => `<div class="captured-slot">🫐</div>`).join("");
}

function setSide(side) {
    HUMAN_SIDE = side;
    document.getElementById("btn-w").className = side === "w"
        ? "p-3 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-600 font-bold"
        : "p-3 rounded-xl border-2 border-slate-200 bg-white text-slate-400 font-bold";
    document.getElementById("btn-b").className = side === "b"
        ? "p-3 rounded-xl border-2 border-indigo-500 bg-indigo-50 text-indigo-600 font-bold"
        : "p-3 rounded-xl border-2 border-slate-200 bg-white text-slate-400 font-bold";
    updateCameraTurn();
}

document.getElementById("btn-w").addEventListener("click", () => setSide("w"));
document.getElementById("btn-b").addEventListener("click", () => setSide("b"));
document.getElementById("mode").addEventListener("change", (event) => {
    const againstAi = event.target.value === "ai";
    document.getElementById("side-select").classList.toggle("hidden", !againstAi);
    document.getElementById("difficulty-container").classList.toggle("hidden", !againstAi);
    updateTheme();
});

document.getElementById("start").addEventListener("click", () => {
    MODE = document.getElementById("mode").value;
    PLAYER_W = document.getElementById("p1").value.trim() || "Strawberry";
    PLAYER_B = document.getElementById("p2").value.trim() || "Blueberry";
    document.getElementById("setup").classList.add("hidden");
    document.getElementById("game-ui").classList.remove("hidden");
    updateCameraTurn();
    updateUI();
    drawBoard();
    if (MODE === "ai") {
        startEngine();
        if (turn !== HUMAN_SIDE) requestAiMove();
    }
});

syncGameState();
updateTheme();function animate() {
    requestAnimationFrame(animate);
    const diff = targetTheta - currentTheta;
    let shortest = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(shortest) > 0.001) currentTheta += shortest * 0.08;

    camera.position.x = RADIUS * Math.sin(FIXED_PHI) * Math.cos(currentTheta);
    camera.position.y = RADIUS * Math.cos(FIXED_PHI);
    camera.position.z = RADIUS * Math.sin(FIXED_PHI) * Math.sin(currentTheta);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
}
animate();