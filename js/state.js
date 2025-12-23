const CHESS = { W: "w", B: "b" };

let MODE = "hotseat";
let PLAYER_W = "Strawberry";
let PLAYER_B = "Blueberry";
let HUMAN_SIDE = "w";

let turn = CHESS.W;
let selected = null;
let winner = null;

let board = [
    ["bR","bN","bB","bQ","bK","bB","bN","bR"],
    ["bP","bP","bP","bP","bP","bP","bP","bP"],
    ...Array(4).fill(Array(8).fill(null)),
    ["wP","wP","wP","wP","wP","wP","wP","wP"],
    ["wR","wN","wB","wQ","wK","wB","wN","wR"]
];
