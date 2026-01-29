let chickenActive = false;
let chickenGrid = [];
let chickenProfit = 1.00;
let revealedCount = 0;
let chickenBetAmount = 0;
let isProcessing = false;
const BONES_COUNT = 10; 
let currentBet = 0;

const gridElement = document.getElementById('chicken-grid');
const startBtn = document.getElementById('start-chicken');
const cashoutBtn = document.getElementById('cashout-chicken');
const chickenBetInput = document.getElementById('chicken-bet');

window.addEventListener('DOMContentLoaded', async () => {
    if (typeof refreshUserData === "function") {
        await refreshUserData();
        console.log("Jeu synchronisé avec Firebase. Solde : " + balance);
    }
});

function initGrid() {
    gridElement.innerHTML = '';
    for (let i = 0; i < 25; i++) {
        const dish = document.createElement('div');
        dish.className = "aspect-square bg-[#141417] border border-[#1f1f21] rounded-2xl flex items-center justify-center cursor-pointer hover:border-[#fbbf24]/30 transition-all text-3xl shadow-inner";
        dish.innerHTML = "🍽️";
        gridElement.appendChild(dish);
    }
}

function createGrid() {
    gridElement.innerHTML = '';
    chickenGrid = new Array(25).fill('chicken');
    let placedBones = 0;
    while(placedBones < BONES_COUNT) {
        let idx = Math.floor(Math.random() * 25);
        if(chickenGrid[idx] === 'chicken') { chickenGrid[idx] = 'bone'; placedBones++; }
    }

    chickenGrid.forEach((type, idx) => {
        const dish = document.createElement('div');
        dish.className = "aspect-square bg-[#1c1c21] border border-[#1f1f21] rounded-2xl flex items-center justify-center cursor-pointer hover:bg-[#25252b] transition-all text-3xl shadow-lg";
        dish.innerHTML = "🍽️";
        
        dish.onclick = () => {
            if (!chickenActive || dish.dataset.revealed || isProcessing) return;
            dish.dataset.revealed = true;
            if (type === 'chicken') {
                dish.innerHTML = "🍗";
                revealedCount++;
                chickenProfit *= 1.25; 
                document.getElementById('current-mult').innerText = chickenProfit.toFixed(2) + "x";
                cashoutBtn.innerText = `Cashout ${(chickenBetAmount * chickenProfit).toFixed(2)} COINS`;
            } else {
                dish.innerHTML = "🦴";
                endGame(false);
            }
        };
        gridElement.appendChild(dish);
    });
}

startBtn.addEventListener('click', async () => {
    const amount = parseFloat(chickenBetInput.value);
    if (amount > 0 && amount <= balance && !chickenActive && !isProcessing) {
        isProcessing = true;
        chickenBetAmount = amount;
        
        updateBalance(balance - amount);
        await saveData();
        
        chickenActive = true;
        chickenProfit = 1.00;
        revealedCount = 0;
        startBtn.classList.add('hidden');
        cashoutBtn.classList.remove('hidden');
        document.getElementById('chicken-info').classList.remove('hidden');
        createGrid();
        addToLogs(`SCAN STARTED (-${amount} COINS)`, "#8b5cf6");
        isProcessing = false;
    } else { alert("Solde insuffisant ou action en cours !"); }
});

cashoutBtn.addEventListener('click', async () => {
    if (!chickenActive || isProcessing) return;
    isProcessing = true;
    
    const win = chickenBetAmount * chickenProfit;
    const profit = win - chickenBetAmount;

    if (typeof updateBalance === "function") {
        updateBalance(balance + win);
    }
    
    if (typeof updateGlobalStats === "function") {
        updateGlobalStats(profit, true);
    } else {
        console.warn("GlobalStats non défini, enregistrement direct...");
    }
    
    addToLogs(`CHICKEN WIN (+${profit.toFixed(2)} COINS)`, "#fbbf24");

    if (typeof window.publishWinToChat === "function") {
        window.publishWinToChat("Chicken", win, chickenProfit);
    }

    endGame(true); 

    if (typeof saveData === "function") {
        await saveData();
    }

    isProcessing = false;
});

function endGame(win) {
    chickenActive = false;
    isProcessing = false;
    
    const tiles = gridElement.children;
    chickenGrid.forEach((type, i) => {
        tiles[i].style.opacity = "0.5";
        tiles[i].innerHTML = (type === 'bone') ? "🦴" : "🍗";
    });

    if(!win) {
        addToLogs(`LOST -${chickenBetAmount} COINS`, "#ef4444");
        // On ne met pas saveData() ici car updateGlobalStats le fait déjà
    }

    try {
        if (!win) {
            if (typeof updateGlobalStats === "function") {
                // CORRECTION : On utilise -chickenBetAmount et on ajoute "true" pour le round
                updateGlobalStats(-chickenBetAmount, false, true);
            }
            // Log déjà fait au dessus, mais on garde ta structure
        }
    } catch (e) {
        console.warn("Erreur lors de la mise à jour des stats :", e);
    }

    setTimeout(() => {
        revealedCount = 0;
        chickenProfit = 1.00;
        
        document.getElementById('chicken-info').classList.add('hidden');
        cashoutBtn.classList.add('hidden');
        startBtn.classList.remove('hidden');
        
        initGrid(); 
        
        console.log("Système réinitialisé : Prêt pour une nouvelle partie.");
    }, 1000);
}



initGrid();