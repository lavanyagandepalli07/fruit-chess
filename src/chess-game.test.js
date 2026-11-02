import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { ChessGame } from "./chess-game.js";

function perft(chess, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    nodes += perft(chess, depth - 1);
    chess.undo();
  }
  return nodes;
}

describe("ChessGame standard chess rules", () => {
  it("matches the standard initial-position perft counts", () => {
    const chess = new Chess();
    expect(perft(chess, 1)).toBe(20);
    expect(perft(chess, 2)).toBe(400);
    expect(perft(chess, 3)).toBe(8902);
  });

  it("matches a castling, check, and en-passant perft position", () => {
    const chess = new Chess("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    expect(perft(chess, 1)).toBe(48);
    expect(perft(chess, 2)).toBe(2039);
  });

  it("matches the standard en-passant and rook-endgame perft position", () => {
    const chess = new Chess("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
    expect(perft(chess, 1)).toBe(14);
    expect(perft(chess, 2)).toBe(191);
    expect(perft(chess, 3)).toBe(2812);
  });

  it("exposes all four promotion choices and promotes as requested", () => {
    const game = new ChessGame("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    expect(game.legalMoves("a7").filter((move) => move.promotion).map((move) => move.promotion).sort())
      .toEqual(["b", "n", "q", "r"]);
    expect(game.move("a7", "a8", "n").promotion).toBe("n");
    expect(game.board[0][0]).toBe("wN");
  });

  it("recognizes checkmate and stalemate", () => {
    const checkmate = new ChessGame("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
    expect(checkmate.outcome)
      .toEqual({ type: "checkmate", winner: "w" });
    expect(() => checkmate.move("h8", "h7")).toThrow("The game is already over.");
    expect(new ChessGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").outcome)
      .toEqual({ type: "stalemate", winner: null });
  });

  it("supports threefold claims and automatic fivefold repetition", () => {
    const repeated = new ChessGame();
    for (const [from, to] of [
      ["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"],
      ["g1", "f3"], ["g8", "f6"], ["f3", "g1"],
    ]) repeated.move(from, to);
    expect(repeated.canClaimDrawAfterMove("f6", "g8")).toBe("threefold-repetition");
    repeated.move("f6", "g8");
    expect(repeated.canClaimDraw).toBe("threefold-repetition");
    expect(repeated.outcome).toBeNull();
    for (const [from, to] of [
      ["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"],
      ["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"],
    ]) repeated.move(from, to);
    expect(repeated.outcome?.type).toBe("fivefold-repetition");
  });

  it("supports fifty-move claims and the automatic seventy-five-move draw", () => {
    const rookPosition = "4k2r/8/8/8/8/8/8/4K2R w - -";
    expect(new ChessGame(`${rookPosition} 100 51`).canClaimDraw).toBe("fifty-move-rule");
    expect(new ChessGame(`${rookPosition} 99 50`).canClaimDrawAfterMove("h1", "h2"))
      .toBe("fifty-move-rule");
    expect(new ChessGame(`${rookPosition} 150 76`).outcome?.type).toBe("seventy-five-move-rule");
  });

  it("recognizes insufficient material", () => {
    expect(new ChessGame("8/8/8/8/8/8/4K3/6Bk w - - 0 1").outcome?.type)
      .toBe("insufficient-material");
  });

  it("does not mutate the board when an illegal move is rejected", () => {
    const game = new ChessGame();
    const initialPosition = game.fen;
    expect(() => game.move("e2", "e5")).toThrow();
    expect(game.fen).toBe(initialPosition);
  });
});
