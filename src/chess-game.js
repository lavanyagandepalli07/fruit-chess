import { Chess } from "chess.js";

export class ChessGame {
  constructor(fen) {
    this.chess = fen ? new Chess(fen) : new Chess();
    this.positionCounts = new Map();
    this.recordPosition();
  }

  get turn() {
    return this.chess.turn();
  }

  get fen() {
    return this.chess.fen();
  }

  get history() {
    return this.chess.history({ verbose: true });
  }

  get board() {
    return this.chess.board().map((row) =>
      row.map((piece) => piece ? `${piece.color}${piece.type.toUpperCase()}` : null),
    );
  }

  get isCheck() {
    return this.chess.isCheck();
  }

  get isGameOver() {
    return Boolean(this.outcome);
  }

  get canClaimDraw() {
    if (this.chess.isThreefoldRepetition()) return "threefold-repetition";
    if (this.chess.isDrawByFiftyMoves()) return "fifty-move-rule";
    return null;
  }

  canClaimDrawAfterMove(from, to, promotion = "q") {
    const nextPosition = new Chess(this.fen);
    nextPosition.move({ from, to, promotion });
    if (nextPosition.isDrawByFiftyMoves()) return "fifty-move-rule";
    if ((this.positionCounts.get(this.positionKey(nextPosition)) ?? 0) >= 2) {
      return "threefold-repetition";
    }
    return null;
  }

  get outcome() {
    if (this.chess.isCheckmate()) {
      return { type: "checkmate", winner: this.chess.turn() === "w" ? "b" : "w" };
    }
    if (this.chess.isStalemate()) return { type: "stalemate", winner: null };
    if (this.chess.isInsufficientMaterial()) return { type: "insufficient-material", winner: null };
    if (Number(this.fen.split(" ")[4]) >= 150) return { type: "seventy-five-move-rule", winner: null };
    if (this.currentPositionCount() >= 5) return { type: "fivefold-repetition", winner: null };
    return null;
  }

  legalMoves(square) {
    return this.chess.moves({ square, verbose: true });
  }

  move(from, to, promotion = "q") {
    if (this.outcome) throw new Error("The game is already over.");
    const move = this.chess.move({ from, to, promotion });
    this.recordPosition();
    return move;
  }

  undo() {
    if (this.chess.history().length === 0) return null;
    const currentPosition = this.positionKey();
    const count = this.positionCounts.get(currentPosition);
    if (count === 1) this.positionCounts.delete(currentPosition);
    else if (count > 1) this.positionCounts.set(currentPosition, count - 1);
    return this.chess.undo();
  }

  currentPositionCount() {
    return this.positionCounts.get(this.positionKey()) ?? 0;
  }

  positionKey(chess = this.chess) {
    const [pieces, turn, castling, enPassant] = chess.fen().split(" ");
    const hasEnPassantCapture = chess.moves({ verbose: true }).some((move) => move.flags.includes("e"));
    return `${pieces} ${turn} ${castling} ${hasEnPassantCapture ? enPassant : "-"}`;
  }

  recordPosition() {
    const key = this.positionKey();
    this.positionCounts.set(key, (this.positionCounts.get(key) ?? 0) + 1);
  }
}
