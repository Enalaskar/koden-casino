
const loginMusic = new Audio('music2.mp3');
loginMusic.loop = true;
loginMusic.volume = 0.4;

function tryPlayMusic() {
    loginMusic.play().catch(() => {});
}

window.addEventListener('load', tryPlayMusic);
window.addEventListener('click', tryPlayMusic, { once: true });
window.addEventListener('keydown', tryPlayMusic, { once: true });