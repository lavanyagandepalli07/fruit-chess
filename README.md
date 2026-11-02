# Fruit Chess

A 3D strawberry-versus-blueberry chess game with full standard chess move
validation, promotion choices, draw detection, and Stockfish analysis in a
Web Worker.

## Run locally

Install Node.js 22 or newer, then run:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Do not open `index.html` directly: the app
uses ES modules and a Stockfish Web Worker that require an HTTP server.

## Rules and features

`chess.js` validates every move, including check, checkmate, stalemate,
castling, en passant, and promotion to a queen, rook, bishop, or knight. Draws
by threefold repetition and the fifty-move rule can be claimed, while fivefold
repetition, the seventy-five-move rule, stalemate, and insufficient material
end the game automatically. The Undo button takes back one local move or the
player's last turn against the AI.

The Stockfish 19 lite single-threaded WebAssembly engine runs locally in the
browser and supports three search-depth settings. The engine is served with the
site; it is not downloaded from a third-party CDN at runtime. Stockfish is
licensed under GPL-3.0; its license is included in
`public/engine/COPYING.txt`. The corresponding engine source is published at
<https://github.com/nmrugg/stockfish.js>.

## Tests and production build

```sh
npm test
npm run build
npm run preview
```

The rule tests include standard perft positions and special-move, promotion,
checkmate, stalemate, and draw-rule cases. Every push to `main` runs these tests
and builds the deployable site. The GitHub Actions workflow deploys it to GitHub
Pages; enable GitHub Pages for the
repository with **Build and deployment → GitHub Actions** in repository
settings.
