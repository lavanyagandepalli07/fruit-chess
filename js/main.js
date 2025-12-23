document.getElementById("start").onclick = () => {
    MODE = mode.value;
    PLAYER_W = p1.value;
    PLAYER_B = p2.value;

    setup.classList.add("hidden");
    document.getElementById("game-ui").classList.remove("hidden");

    updateUI();
    drawBoard();
    animate();
};
