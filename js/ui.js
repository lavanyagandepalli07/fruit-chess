function updateUI() {
    document.getElementById("status").textContent =
        (turn === CHESS.W ? PLAYER_W : PLAYER_B) + "'s Turn";
}
