const colors = { red: "#cc1e1e", black: "#1a1a1e", green: "#22c55e" };
const wheelOrder = [0, 11, 5, 10, 6, 9, 7, 8, 1, 14, 2, 13, 3, 12, 4];
const cardWidth = 80;
let isSpinning = false;
let currentBet = { amount: 0, color: null };
let currentRoundId = "";
let lastFirebaseData = null; // Stocke les dernières infos reçues
let lastTickAngle = 0;
let isProcessingBet = false;
let lastBetTimestamp = 0;
let hasPlacedBetThisRound = false;

window.addEventListener('DOMContentLoaded', () => {
    generateWheel();
    initRouletteSync();
    setTimeout(initBetsListener, 1000);
});

async function initRouletteSync() {
    if (!window.fs || !window.db_online) return setTimeout(initRouletteSync, 500);
    const rouletteRef = window.fs.doc(window.db_online, "games", "roulette");

    // 1. Initialisation auto
    try {
        const docSnap = await window.fs.getDoc(rouletteRef);
        if (!docSnap.exists()) {
            await window.fs.setDoc(rouletteRef, {
                timeLeft: 15, status: "betting", winningNumber: 0,
                lastUpdate: Date.now(), currentRoundId: "INIT-" + Date.now()
            });
        }
    } catch (e) { console.error(e); }

    let lastHandledRoundId = ""; // Variable locale pour suivre les changements de tour

    window.fs.onSnapshot(rouletteRef, (doc) => {
        const data = doc.data();
        if (!data) return;
        lastFirebaseData = data; 
        
        currentRoundId = data.currentRoundId;
        updateTimerUI(data.timeLeft, data.status);
        
        // GESTION DU SPIN
        if (data.status === "spinning" && !isSpinning) {
            startSpin(data.winningNumber);
        }

        // GESTION DU NOUVEAU TOUR (RESET)
        // On ne reset que si l'ID du round a changé sur Firebase
        if (data.status === "betting" && data.currentRoundId !== lastHandledRoundId) {
            lastHandledRoundId = data.currentRoundId; // On mémorise le nouveau tour
            
            // 1. Libération des sécurités locales
            isSpinning = false;
            hasPlacedBetThisRound = false; 
            currentBet = { amount: 0, color: null };

            // 2. Réactivation physique des boutons de mise
            const betButtons = document.querySelectorAll('button[onclick^="placeBet"]');
            betButtons.forEach(btn => {
                btn.style.pointerEvents = "auto";
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";
                
                // Restauration de l'action si elle avait été supprimée
                if (btn.getAttribute('data-onclick')) {
                    btn.setAttribute('onclick', btn.getAttribute('data-onclick'));
                }
            });

            // 3. Nettoyage de l'interface des gagnants
            const list = document.getElementById('winners-list');
            if (list) {
                list.classList.add('opacity-0', 'scale-95');
                setTimeout(() => {
                    const container = document.getElementById('winners-container');
                    if(container) container.innerHTML = '';
                }, 500);
            }
        }
    });

    // 3. LA BOUCLE MAGIQUE (S'exécute toutes les secondes localement)
    setInterval(() => {
        if (lastFirebaseData) {
            const now = Date.now();
            // Si les données datent de plus de 1 seconde, on gère le temps
            if (now - lastFirebaseData.lastUpdate >= 1000) {
                handleMasterTimer(lastFirebaseData);
            }
        }
    }, 1000);
}

async function handleMasterTimer(data) {
    let newTime = data.timeLeft - 1;
    let newStatus = data.status;
    let winningNumber = data.winningNumber || 0;
    let newRoundId = data.currentRoundId;

    if (newTime <= 0) {
        if (newStatus === "betting") {
            newStatus = "spinning";
            newTime = 10;
            winningNumber = wheelOrder[Math.floor(Math.random() * wheelOrder.length)];
        } else {
            newStatus = "betting";
            newTime = 15;
            newRoundId = "RD-" + Date.now();
            clearFirebaseBets();
        }
    }

    // On met à jour Firebase (ce qui déclenchera le onSnapshot de tout le monde)
    await window.fs.updateDoc(window.fs.doc(window.db_online, "games", "roulette"), {
        timeLeft: newTime,
        status: newStatus,
        winningNumber: winningNumber,
        currentRoundId: newRoundId,
        lastUpdate: Date.now()
    });
}

function updateTimerUI(time, status) {
    const text = document.getElementById('timer-text');
    const bar = document.getElementById('timer-bar');
    if (!text || !bar) return;

    text.innerText = time;
    
    // Définition du temps maximum selon la phase (15s mises, 10s spin)
    const maxTime = status === "betting" ? 15 : 10;
    
    // Calcul précis de l'offset pour un cercle de rayon 50 (Circonférence = 314.16)
    // On veut que la barre soit pleine (offset 0) à maxTime et vide (offset 314.16) à 0
    const progress = time / maxTime;
    const offset = 314.16 * (1 - progress);
    
    bar.style.strokeDashoffset = offset;
    
    // Changement de couleur dynamique : violet pour les mises, rouge pour le spin
    if (status === "betting") {
        bar.style.stroke = "#8b5cf6"; // Violet
        bar.parentElement.classList.remove('opacity-50');
    } else {
        bar.style.stroke = "#ef4444"; // Rouge
        bar.parentElement.classList.add('opacity-50'); // On estompe un peu pendant le spin
    }
}

function startSpin(winningNumber) {
    if (isSpinning) return;
    isSpinning = true;

    const wheel = document.getElementById('wheel-container');
    const sliceAngle = 360 / wheelOrder.length;
    const index = wheelOrder.indexOf(winningNumber);
    
    // --- 1. RESET INSTANTANÉ (Le secret est ici) ---
    wheel.style.transition = "none"; // On coupe l'animation
    wheel.style.transform = "rotate(0deg)"; // On remet à zéro direct
    
    // On force le navigateur à valider le changement immédiatement
    void wheel.offsetWidth; 

    // --- 2. CALCUL DE LA ROTATION ---
    const extraSpins = 10 * 360; // 10 tours pour la vitesse
    // On aligne le chiffre gagnant sous la flèche (270° = haut du cercle)
    const finalRotation = extraSpins + (270 - (index * sliceAngle) - (sliceAngle / 2));

    // --- 3. LANCEMENT DE L'ANIMATION RÉELLE ---
    wheel.style.transition = "transform 8s cubic-bezier(0.15, 0, 0.1, 1)";
    wheel.style.transform = `rotate(${finalRotation}deg)`;

    requestAnimationFrame(monitorWheelTick);

    setTimeout(() => {
        checkGains(winningNumber);
    }, 8500);
}

function resetWheelUI() {
    isSpinning = false;
    const wheel = document.getElementById('wheel-container');
    if (wheel) {
        wheel.style.transition = "none";
        wheel.style.transform = "rotate(0deg)";
    }
}

function checkGains(winningNumber) {
    if (currentBet.amount <= 0 || winningNumber === null) return;

    const winColor = winningNumber === 0 ? "green" : (winningNumber % 2 === 0 ? "black" : "red");
    
    // On calcule le profit net
    let profit = 0;
    let isWin = false;

    if (currentBet.color === winColor) {
        const multiplier = winColor === "green" ? 14 : 2;
        const payout = currentBet.amount * multiplier;
        profit = payout - currentBet.amount; // Gain réel au-delà de la mise
        isWin = true;

        updateBalance(balance + payout);
        showNotification(`GAGNÉ ! +${payout.toFixed(0)}`, "success");
        playSound('rank-up-2.mp3');
        addWinnerBubble(activeUser, payout.toFixed(0));
    } else {
        profit = -currentBet.amount; // On a perdu la mise
        isWin = false;
        showNotification(`PERDU !`, "error");
    }

    // --- MISE À JOUR DES STATS GLOBALES (Inspiré de chicken.js) ---
    if (typeof updateGlobalStats === "function") {
        updateGlobalStats(profit, isWin, true); // (profit, est-ce un win, compter le round)
    }
}

function addWinnerBubble(username, amount) {
    const list = document.getElementById('winners-list');
    const container = document.getElementById('winners-container');
    if (!list || !container) return;

    // Affiche le conteneur
    list.classList.remove('opacity-0', 'scale-95');

    const bubble = document.createElement('div');
    bubble.className = "flex items-center gap-3 bg-[#141417]/80 backdrop-blur-md border border-green-500/30 px-4 py-2 rounded-xl animate-fadeInLeft";
    bubble.innerHTML = `
        <div class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
        <span class="text-[11px] font-black uppercase text-white/90">${username}</span>
        <span class="text-[11px] font-mono font-bold text-green-400">+${amount}</span>
    `;

    container.appendChild(bubble);
}

async function placeBet(color) {
    const input = document.getElementById('roulette-bet-input');
    const amount = parseFloat(input.value);

    // BLOCAGE STRICT : Si on a déjà misé durant ce round, on sort direct
    if (hasPlacedBetThisRound || isSpinning || lastFirebaseData?.status !== "betting") {
        return showNotification("Action impossible", "error");
    }

    if (isNaN(amount) || amount <= 0 || amount > balance) {
        return showNotification("Montant invalide", "error");
    }

    // ON VERROUILLE IMMÉDIATEMENT
    hasPlacedBetThisRound = true;

    // Effet visuel immédiat (les boutons deviennent gris et incliquables)
    const betButtons = document.querySelectorAll('button[onclick^="placeBet"]');
    betButtons.forEach(btn => {
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
    });

    try {
        currentBet = { amount, color };
        updateBalance(balance - amount);
        await saveData();
        
        await window.fs.addDoc(window.fs.collection(window.db_online, "roulette_bets"), {
            user: activeUser, 
            amount: amount, 
            color: color,
            profilePic: stats.profilePic || "", 
            timestamp: window.fs.serverTimestamp()
        });
        
        showNotification("Mise acceptée !", "success");
    } catch (error) {
        // Uniquement en cas d'erreur réseau, on redonne la main
        hasPlacedBetThisRound = false;
        currentBet = { amount: 0, color: null };
        updateBalance(balance + amount);
        betButtons.forEach(btn => {
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
        });
    }
}

function initBetsListener() {
    if (!window.fs || !window.fs.query) return setTimeout(initBetsListener, 500);
    
    const q = window.fs.query(
        window.fs.collection(window.db_online, "roulette_bets"), 
        window.fs.orderBy("timestamp", "desc"), 
        window.fs.limit(10)
    );

    window.fs.onSnapshot(q, (snapshot) => {
        const log = document.getElementById('all-bets-log');
        if (!log) return;
        log.innerHTML = '';

        snapshot.forEach(doc => {
            const bet = doc.data();
            const colorClass = bet.color === 'red' ? 'bg-[#cc1e1e]' : (bet.color === 'green' ? 'bg-[#22c55e]' : 'bg-zinc-800');
            
            log.innerHTML += `
                <div class="flex items-center justify-between bg-[#0F0F12] p-2.5 rounded-xl border border-white/5 animate-fadeIn">
                    <div class="flex items-center gap-2">
                        <div class="w-1.5 h-6 ${colorClass} rounded-full shadow-lg"></div>
                        <div class="flex flex-col">
                            <span class="text-[9px] font-bold text-white uppercase tracking-tighter">${bet.user}</span>
                            <span class="text-[7px] text-zinc-500 font-bold uppercase tracking-widest">${bet.color}</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] font-black text-[#fbbf24] font-mono">${bet.amount}</span>
                    </div>
                </div>
            `;
        });
    });
}

async function clearFirebaseBets() {
    if (!window.fs || !window.fs.getDocs) return;
    const snapshot = await window.fs.getDocs(window.fs.collection(window.db_online, "roulette_bets"));
    snapshot.forEach(d => window.fs.deleteDoc(d.ref));
}

function generateWheel() {
    const canvas = document.getElementById('roulette-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 15; // Un peu plus petit pour laisser de la place au bord
    const sliceAngle = (2 * Math.PI) / wheelOrder.length;

    ctx.clearRect(0, 0, size, size);

    // 1. DESSIN DES SECTIONS AVEC RELIEF
    wheelOrder.forEach((num, i) => {
        const angle = i * sliceAngle;
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(center, center);
        
        // Dégradé pour simuler la profondeur de la case
        const baseColor = num === 0 ? colors.green : (num % 2 === 0 ? colors.black : colors.red);
        const grad = ctx.createRadialGradient(center, center, radius * 0.5, center, center, radius);
        grad.addColorStop(0, baseColor); // Couleur vive au centre de la case
        grad.addColorStop(1, "#000000"); // Bordure noire pour l'ombre

        ctx.fillStyle = grad;
        ctx.arc(center, center, radius, angle, angle + sliceAngle);
        ctx.fill();

        // Séparateurs en "Or" (Lignes fines dorées)
        ctx.strokeStyle = "rgba(251, 191, 36, 0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // CHIFFRES EN RELIEF
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(angle + sliceAngle / 2);
        
        // Effet d'ombre sur le texte
        ctx.shadowBlur = 4;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowOffsetY = 2;
        
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 24px 'Inter', sans-serif"; // Police ultra-grasse
        ctx.fillText(num, radius - 35, 8);
        ctx.restore();
    });

    // 2. CERCLE EXTÉRIEUR (CHROME)
    ctx.beginPath();
    const chromeGrad = ctx.createLinearGradient(0, 0, size, size);
    chromeGrad.addColorStop(0, "#1a1a1e");
    chromeGrad.addColorStop(0.5, "#4a4a4f");
    chromeGrad.addColorStop(1, "#1a1a1e");
    ctx.strokeStyle = chromeGrad;
    ctx.lineWidth = 10;
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 3. MOYEU CENTRAL STYLE "V12"
    // Fond du moyeu
    const hubGrad = ctx.createRadialGradient(center, center, 0, center, center, 60);
    hubGrad.addColorStop(0, "#3f3f46");
    hubGrad.addColorStop(1, "#09090b");
    
    ctx.beginPath();
    ctx.fillStyle = hubGrad;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "black";
    ctx.arc(center, center, 60, 0, Math.PI * 2);
    ctx.fill();

    // Logo ou Point central "Or"
    ctx.beginPath();
    ctx.fillStyle = "#fbbf24";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#fbbf24";
    ctx.arc(center, center, 8, 0, Math.PI * 2);
    ctx.fill();
}

function monitorWheelTick() {
    if (!isSpinning) return;

    const wheel = document.getElementById('wheel-container');
    const style = window.getComputedStyle(wheel);
    const matrix = new WebKitCSSMatrix(style.transform);
    const currentAngle = Math.atan2(matrix.m12, matrix.m11) * (180 / Math.PI);
    
    const sliceAngle = 360 / wheelOrder.length;
    
    // Si on a tourné de la valeur d'une case, on déclenche un effet
    if (Math.abs(currentAngle - lastTickAngle) >= sliceAngle) {
        lastTickAngle = currentAngle;
        
        // Optionnel : On peut ajouter une petite vibration visuelle sur la flèche
        const arrow = document.querySelector('.clip-path-triangle');
        if(arrow) {
            arrow.style.transform = 'translateX(-50%) rotate(-10deg)';
            setTimeout(() => arrow.style.transform = 'translateX(-50%) rotate(0deg)', 50);
        }
        
        // Jouer le son si tu en as un
        // tickSound.play().catch(() => {}); 
    }
    
    requestAnimationFrame(monitorWheelTick);
}
