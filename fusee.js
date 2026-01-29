let multiplier = 1.00;
let isCrashed = false;
let isPlaying = false;
let currentBet = 0;
let stars = [];
let isWaitingDecision = false;
let isProcessing = false;

const steps = [1.25, 1.50, 2.00, 3.00, 5.00, 10.0, 50.0];
let currentStepIndex = 0;

const multDisplay = document.getElementById('multiplier');
const betBtn = document.getElementById('bet-btn');
const betInput = document.getElementById('bet-amount');
const canvas = document.getElementById('crash-chart');
const ctx = canvas ? canvas.getContext('2d') : null;

window.addEventListener('DOMContentLoaded', async () => {
    if (typeof refreshUserData === "function") {
        await refreshUserData();
    }
});

function initStars() {
    stars = [];
    if (!canvas) return;
    for(let i = 0; i < 150; i++) {
        stars.push({
            x: Math.random() * canvas.clientWidth, 
            y: Math.random() * canvas.clientHeight,
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * 4 + 1,
            opacity: Math.random()
        });
    }
}

function drawStars() {
    if (!ctx) return;
    ctx.fillStyle = "white";
    stars.forEach(star => {
        ctx.globalAlpha = star.opacity;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
        if (isPlaying && !isWaitingDecision && !isCrashed) {
            star.y += star.speed * (multiplier * 1.2);
            star.x -= star.speed * (multiplier * 0.8);
        } else if (isWaitingDecision) {
            star.y += 0.4;
            star.x -= 0.2;
        }
        if (star.y > canvas.height) { star.y = 0; star.x = Math.random() * (canvas.width + 200); }
        if (star.x < 0) { star.x = canvas.width; star.y = Math.random() * canvas.height; }
    });
    ctx.globalAlpha = 1.0;
}

function drawRocket() {
    if (!ctx) return;
    const centerX = canvas.width / 2;
    const centerY = canvas.height * 0.6; 
    let shakeX = 0, shakeY = 0;
    if (isPlaying && !isWaitingDecision && !isCrashed) {
        shakeX = (Math.random() - 0.5) * (multiplier * 3);
        shakeY = (Math.random() - 0.5) * (multiplier * 3);
    }
    ctx.save();
    ctx.translate(centerX + shakeX, centerY + shakeY);
    ctx.font = "100px serif"; 
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (isCrashed) {
        ctx.shadowBlur = 50;
        ctx.shadowColor = "#ff0000";
        ctx.fillText("💥", 0, 0);
    } else {
        if (isPlaying) {
            ctx.shadowBlur = 30 + (multiplier * 10);
            ctx.shadowColor = "#8b5cf6";
        }
        ctx.fillText("🚀", 0, 0); 
    }
    ctx.restore();
}

function updateGame() {
    // Si on a crashé ou qu'on n'est plus en jeu, on arrête la logique
    if (isCrashed || !isPlaying) return;

    // Si on attend une décision, on ne calcule plus le multiplicateur 
    // MAIS on laisse la boucle de dessin (draw) tourner
    if (isWaitingDecision) return;

    let targetMultiplier = steps[currentStepIndex];
    multiplier += 0.007; 
    
    if (multDisplay) multDisplay.innerText = multiplier.toFixed(2) + "X";
    
    // Crash aléatoire
    if (Math.random() > 0.992) { 
        triggerCrash(); 
        return; 
    }
    
    // Atteinte du palier
    if (multiplier >= targetMultiplier) {
        multiplier = targetMultiplier;
        isWaitingDecision = true;
        setupDecisionUI();
        return; // Ici on arrête la LOGIQUE de montée, pas le DESSIN
    }
    
    requestAnimationFrame(updateGame);
}

function draw() {
    if (!ctx || !canvas) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width);
    grad.addColorStop(0, isCrashed ? "#3d0000" : "#1a1033");
    grad.addColorStop(1, "#0F0F12");
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawStars();
    drawRocket();
    
    // --- CONDITION CORRIGÉE ---
    // On continue de dessiner tant que le jeu est lancé ou en attente
    if (isPlaying || isCrashed || isWaitingDecision) {
        requestAnimationFrame(draw);
    }
}

async function triggerCrash() {
    isCrashed = true;
    isPlaying = false;
    isWaitingDecision = false;
    
    if (typeof updateGlobalStats === "function") {
        // On envoie 0 car on a déjà déduit la mise au départ. 
        // true en 3ème paramètre pour compter le round.
        updateGlobalStats(0, false, true); 
    }

    // 1. DÉBIT RÉEL DANS FIREBASE
    try {
        const user = window.auth?.currentUser;
        if (user) {
            // Utilisation de window.fs pour la cohérence avec ton bridge
            const userRef = window.fs.doc(window.db_online, "users", user.uid);
            await window.fs.updateDoc(userRef, {
                balance: window.fs.increment(-currentBet)
            });
        }
    } catch (error) {
        console.error("Erreur lors du débit :", error);
    }

    if (typeof addToLogs === "function") {
        addToLogs(`ROCKET CRASHED (-${currentBet.toFixed(2)} COINS)`, "#ef4444");
    }

    if (typeof balance !== 'undefined') {
        balance -= currentBet; 
        updateBalance(balance); 
    }
    
    if (multDisplay) {
        multDisplay.style.color = "#ef4444";
        multDisplay.innerText = "EXPLOSION";
    }

    betBtn.disabled = false;
    betBtn.innerText = "LANCER LA FUSÉE";
    betBtn.style.backgroundColor = "#22c55e";

    const cBtn = document.getElementById('cashout-btn-step');
    if (cBtn) cBtn.remove();

    draw(); 

    setTimeout(() => {
        resetGame();
    }, 1000);
}

function resetGame() {
    multiplier = 1.00; isCrashed = false; isPlaying = false; isWaitingDecision = false; currentStepIndex = 0;
    if (multDisplay) { multDisplay.style.color = "white"; multDisplay.innerText = "1.00X"; }
    betBtn.disabled = false; 
    betBtn.innerText = "LANCER LA FUSÉE";
    betBtn.style.backgroundColor = "#22c55e";
    const cashoutBtn = document.getElementById('cashout-btn-step');
    if (cashoutBtn) cashoutBtn.remove();
    initStars(); 
    draw();
}

function setupDecisionUI() {
    betBtn.disabled = false;
    betBtn.innerText = `CONTINUER VERS ${steps[currentStepIndex + 1]}X`;
    betBtn.style.backgroundColor = "#8b5cf6";

    let cashoutBtn = document.getElementById('cashout-btn-step');
    if (!cashoutBtn) {
        cashoutBtn = document.createElement('button');
        cashoutBtn.id = 'cashout-btn-step';
        cashoutBtn.className = "w-full bg-[#fbbf24] text-black font-black py-4 rounded-xl uppercase italic text-sm mt-3 shadow-lg";
        betBtn.parentNode.appendChild(cashoutBtn);
    }
    cashoutBtn.style.display = 'block';
    
    const winDisplay = (currentBet * multiplier).toFixed(2);
    cashoutBtn.innerText = `ENCAISSER ${winDisplay} COINS`;
    
    cashoutBtn.onclick = async () => {
        if (!isPlaying || isProcessing) return;
        isProcessing = true;
        isPlaying = false; 

        const win = currentBet * multiplier; 
        const profit = win - currentBet;  
        
        try {
            const user = window.auth?.currentUser;
            if (user) {
                const userRef = window.fs.doc(window.db_online, "users", user.uid);
                await window.fs.updateDoc(userRef, {
                    balance: window.fs.increment(profit)
                });
            }
        } catch (e) {
            console.error("Erreur cashout base:", e);
        }

        balance += profit; 
        updateBalance(balance);
        
        if (typeof addToLogs === "function") {
            addToLogs(`ROCKET WIN (+${profit.toFixed(2)} COINS)`, "#fbbf24");
        }

        if (typeof updateGlobalStats === "function") {
            updateGlobalStats(win, true, true);
        }

        if (typeof window.publishWinToChat === "function") {
            window.publishWinToChat("Rocket Space", win, multiplier);
        }
        
        await saveData();
        isProcessing = false;
        resetGame();
    };
}

betBtn.addEventListener('click', async () => {
    if (isCrashed || isProcessing) return;

    if (!isPlaying) {
        const amount = parseFloat(betInput.value);
        if (amount > 0 && amount <= balance) {
            isProcessing = true;
            currentBet = amount;

            // --- LIAISON STATS INDEX ---
            if (typeof updateGlobalStats === "function") {
                // IMPORTANT: Le 3ème paramètre est "false" pour ne pas compter 2 rounds
                updateGlobalStats(-currentBet, false, false);
            }

            // Sauvegarde du solde
            await saveData();

            // Logs
            if (typeof addToLogs === "function") {
                addToLogs(`ROCKET MISSION STARTED (-${currentBet.toFixed(2)} COINS)`, "#8b5cf6");
            }

            isPlaying = true;
            isWaitingDecision = false;
            currentStepIndex = 0;
            
            betBtn.innerText = "DÉCOLLAGE...";
            betBtn.disabled = true;

            initStars();
            draw();
            updateGame();
            isProcessing = false;
        } else {
            alert("Solde insuffisant !");
        }
    } else if (isWaitingDecision) {
        // Logique d'accélération
        currentStepIndex++;
        isWaitingDecision = false;
        betBtn.innerText = "ACCÉLÉRATION...";
        betBtn.disabled = true;
        
        const cashoutBtn = document.getElementById('cashout-btn-step');
        if (cashoutBtn) cashoutBtn.style.display = 'none';
        
        updateGame();
    }
});

window.onload = () => { initStars(); draw(); };