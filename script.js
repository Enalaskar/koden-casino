
const activeUser = localStorage.getItem('active_session');

if (!activeUser && !window.location.href.includes('auth.html')) {
    window.location.href = 'auth.html';
}

let db = JSON.parse(localStorage.getItem('koden_db')) || {};
let balance = 0;
let stats = { totalProfit: 0, rounds: 0, wins: 0 };
let isSyncFinished = false; 
let lastRank = localStorage.getItem('persisted_rank') || null;
let lastKnownRank = null;

function showNotification(message, type = "info") {
    const container = document.getElementById('notification-container');
    if(!container) return;

    const toast = document.createElement('div');
    const colors = { success: "#22c55e", error: "#ef4444", info: "#8b5cf6" };
    
    toast.className = "bg-[#141417] border-l-4 px-6 py-4 rounded-xl flex items-center gap-4 pointer-events-auto min-w-[300px] shadow-2xl mb-2 transition-all duration-500";
    toast.style.borderColor = colors[type];
    toast.style.transform = "translateY(0)";
    toast.style.opacity = "1";

    toast.innerHTML = `
        <div class="flex-1">
            <p class="text-[10px] font-black uppercase tracking-widest" style="color: ${colors[type]}">
                ${type === 'success' ? 'SYSTEM' : 'SYSTEM'}
            </p>
            <p class="text-xs font-bold text-white">${message}</p>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function getRankValue(rankName) {
    // Ajout de ULTIMATE à la fin pour qu'il soit considéré comme le rang suprême
    const ranks = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "CHAMPION"];
    return ranks.indexOf(rankName);
}

function playSound(filename) {
    const audio = new Audio(filename);
    audio.volume = 0.5;
    audio.play().catch(e => console.log("Audio bloqué :", e));
}

function addToLogs(message, color = "#a78bfa") {
    const container = document.getElementById('logs-container');
    if (!container) return;
    const log = document.createElement('div');
    log.className = "flex justify-between border-b border-zinc-900 pb-1 animate-fadeIn";
    log.innerHTML = `<span style="color: ${color}">[${new Date().toLocaleTimeString()}]</span><span class="font-bold text-zinc-300 text-[10px]">${message}</span>`;
    container.prepend(log);
}


async function syncToFirebase(username, data) {
    if (!window.db_online || !window.fs) return;
    try {
        const { doc, setDoc } = window.fs;
        const userRef = doc(window.db_online, "users", username);
        await setDoc(userRef, data, { merge: true });
        console.log(`Cloud_Sync: ${username} mis à jour.`);
    } catch (e) { console.error("Erreur sync Firebase:", e); }
}

async function getFirebaseData(username) {
    if (!window.db_online || !window.fs) return null;
    try {
        const { doc, getDoc } = window.fs;
        const userRef = doc(window.db_online, "users", username);
        const userSnap = await getDoc(userRef);
        return userSnap.exists() ? userSnap.data() : null;
    } catch (e) { return null; }
}

function saveData() {
    if (!db[activeUser]) db[activeUser] = {};
    db[activeUser].coins = balance;
    db[activeUser].stats = stats;
    localStorage.setItem('koden_db', JSON.stringify(db));
    
    syncToFirebase(activeUser, {
        balance: Number(balance),
        stats: stats,
        lastUpdate: Date.now()
    });
}


async function refreshUserData() {
    if (!activeUser) return;
    try {
        const cloudData = await getFirebaseData(activeUser);
        if (cloudData) {
            balance = Number(cloudData.balance) || 0;
            
            if (cloudData.stats) {
                stats = {
                    totalProfit: Number(cloudData.stats.totalProfit) || 0,
                    rounds: Number(cloudData.stats.rounds) || 0,
                    wins: Number(cloudData.stats.wins) || 0,
                    profilePic: cloudData.stats.profilePic || "",
                    lastDailyClaim: cloudData.stats.lastDailyClaim || 0
                };
            }
            
            isSyncFinished = false; 
            displayStats();
            updateBalanceDisplay(balance);

            if (stats.profilePic) applyPP(stats.profilePic);

            checkDailyStatus();
            
            if (!window.dailyIntervalSet) {
                setInterval(checkDailyStatus, 60000);
                window.dailyIntervalSet = true;
            }

            setTimeout(() => {
                isSyncFinished = true;
                checkDailyStatus();
            }, 1500);
        }
    } catch (e) {
        console.error("Erreur refresh:", e);
        isSyncFinished = true;
    }
}

function updateBalanceDisplay(amount) {
    document.querySelectorAll('.balance-display, .balance-amount').forEach(display => {
        display.innerText = parseFloat(amount).toLocaleString(undefined, {
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2
        });
    });
}

function updateBalance(newAmount) {
    const oldRank = lastRank; 
    
    balance = newAmount;
    saveData();
    updateBalanceDisplay(balance);
    
    displayStats(); 
}

async function updateLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    // Si Firebase n'est pas encore chargé, on attend 1 seconde et on recommence
    if (!window.db_online || !window.fs || !window.fs.getDocs) {
        console.log("Leaderboard: En attente de Firebase...");
        setTimeout(updateLeaderboard, 1000);
        return;
    }

    try {
        const { collection, getDocs } = window.fs;
        const querySnapshot = await getDocs(collection(window.db_online, "users"));
        
        let players = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            players.push({ 
                name: doc.id, 
                amount: Number(data.balance) || 0,
                profilePic: data.stats ? data.stats.profilePic : null 
            });
        });

        players.sort((a, b) => b.amount - a.amount);
        players.sort((a, b) => b.amount - a.amount);
        if (players.length > 0) window.topPlayerId = players[0].name;

        container.innerHTML = players.slice(0, 10).map((p, i) => {
            const isMe = p.name === activeUser;
            
            let pRank = "BRONZE";
            let pColor = "#803f19";
            if (p.amount >= 100) { pRank = "CHAMPION"; pColor = "#cc1e1e"; }
            else if (p.amount >= 75) { pRank = "DIAMOND"; pColor = "#7760fa"; }
            else if (p.amount >= 50) { pRank = "PLATINUM"; pColor = "#34d399"; }
            else if (p.amount >= 25) { pRank = "GOLD"; pColor = "#fbbf24"; }
            else if (p.amount > 10) { pRank = "SILVER"; pColor = "#a0a0a0"; }

            const playerPP = p.profilePic ? 
                `<img src="${p.profilePic}" class="w-full h-full object-cover">` : 
                `<span class="text-[10px] opacity-40">👤</span>`;

            const isChampion = pRank === "CHAMPION";
            const championEffects = isChampion ? 'animate-pulse shadow-[0_0_10px_rgba(204,30,30,0.4)] border-[#cc1e1e]/50' : 'border-white/5';

            return `
                <div class="flex items-center justify-between py-2 px-2 border-b border-white/5 last:border-0 transition-all w-full
                    ${isMe ? 'bg-white/[0.04] rounded-xl' : ''}">
                    
                    <div class="flex items-center gap-3 overflow-hidden">
                        <span class="text-[10px] font-black w-4 shrink-0 ${i === 0 ? 'text-[#fbbf24]' : 'text-zinc-600'}">
                            ${(i+1)}
                        </span>
                        
                        <div class="flex items-center gap-3 shrink-0">
                            <div class="w-8 h-8 rounded-lg bg-[#0F0F12] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                ${playerPP}
                            </div>
                            <div class="flex flex-col leading-tight overflow-hidden">
                                <div class="flex items-center gap-2">
                                    <span class="text-[11px] font-bold uppercase tracking-tight truncate ${isMe ? 'text-[#8b5cf6]' : 'text-white/90'}">
                                        ${p.name}
                                    </span>
                                    
                                    <span class="text-[7px] font-black italic px-1.5 py-0.5 rounded bg-black/40 border ${championEffects} transition-all" style="color: ${pColor}">
                                        ${pRank}
                                    </span>
                                </div>
                                <span class="text-[7px] text-zinc-600 font-bold uppercase tracking-widest">
                                    ${i === 0 ? 'Top 1' : 'Player'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0 ml-2">
                        <span class="text-[10px] font-mono font-bold text-[#fbbf24]">
                            ${p.amount.toFixed(2)}
                        </span>
                        <img src="coin.png" class="w-3 h-3 animate-pulse" alt="coin">
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        container.innerHTML = "<div class='text-red-500 text-[9px] font-black p-4 text-center'>SYNC_ERROR</div>";
    }
}

function displayStats() {
    const pDisp = document.getElementById('stat-total-profit');
    const rDisp = document.getElementById('stat-total-rounds');
    const wDisp = document.getElementById('stat-win-rate');
    const rankDisp = document.getElementById('user-rank');
    if (!pDisp || !rankDisp) return;

    const profit = Number(stats.totalProfit) || 0;
    pDisp.innerText = (profit >= 0 ? "+" : "") + profit.toFixed(2);
    pDisp.style.color = profit >= 0 ? '#22c55e' : '#ef4444';
    rDisp.innerText = stats.rounds || 0;
    wDisp.innerText = (stats.rounds > 0 ? ((stats.wins / stats.rounds) * 100).toFixed(1) : 0) + "%";

    let currentRank = "BRONZE";
    let rankColor = "#803f19";

    if (balance >= 100) { currentRank = "CHAMPION"; rankColor = "#cc1e1e"; }
    else if (balance >= 75) { currentRank = "DIAMOND"; rankColor = "#1900ff"; }
    else if (balance >= 50) { currentRank = "PLATINUM"; rankColor = "#34d399"; }
    else if (balance >= 25) { currentRank = "GOLD"; rankColor = "#fbbf24"; }
    else if (balance > 10) { currentRank = "SILVER"; rankColor = "#a0a0a0"; }

    if (currentRank === "CHAMPION") {
        rankDisp.classList.add('animate-pulse');
        rankDisp.style.textShadow = "0 0 15px #cc1e1e"; 
    } else {
        rankDisp.classList.remove('animate-pulse');
        rankDisp.style.textShadow = "none";
    }
    lastRank = currentRank;
    rankDisp.innerText = currentRank;
    rankDisp.style.color = rankColor;

    if (stats.profilePic) {
        applyPP(stats.profilePic);
    }

    if (isSyncFinished && lastRank !== null && currentRank !== lastRank) {
        const isUp = getRankValue(currentRank) > getRankValue(lastRank);
        
        showNotification(
            `${isUp ? 'UPGRADE' : 'DOWNGRADE'} : ${currentRank}`, 
            isUp ? "success" : "error"
        );
        
        playSound(isUp ? 'rank-up-2.mp3' : 'rank-up-2.mp3');
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    if (activeUser) {
        const nameDisplay = document.getElementById('nav-username');
        if (nameDisplay) nameDisplay.innerText = activeUser;
        
        await refreshUserData(); 
        updateLeaderboard();
        setInterval(updateLeaderboard, 30000);
    }
});

function logout() {
    localStorage.removeItem('active_session');
    window.location.href = 'auth.html';
}

async function deleteAccount() {
    if (confirm("⚠️ Action irréversible. Continuer ?")) {
        const { doc, deleteDoc } = window.fs;
        await deleteDoc(doc(window.db_online, "users", activeUser));
        delete db[activeUser];
        localStorage.setItem('koden_db', JSON.stringify(db));
        logout();
    }
}

function toggleProfileCard() {
    const card = document.getElementById('profile-card');
    if (!card) return;

    if (card.classList.contains('hidden')) {
        card.classList.remove('hidden');
        setTimeout(() => {
            window.addEventListener('click', closeOnClickOutside);
        }, 10);
    } else {
        card.classList.add('hidden');
        window.removeEventListener('click', closeOnClickOutside);
    }
}

function closeOnClickOutside(event) {
    const card = document.getElementById('profile-card');
    const button = document.querySelector('button[onclick="toggleProfileCard()"]');
    
    if (card && !card.contains(event.target) && !button.contains(event.target)) {
        card.classList.add('hidden');
        window.removeEventListener('click', closeOnClickOutside);
    }
}


async function changePP() {
    const url = prompt("Colle le lien (URL) de ton image (ex: https://image.com/maphoto.jpg) :");
    
    if (url && url.startsWith('http')) {
        if (!stats.profilePic) stats.profilePic = "";
        stats.profilePic = url;
        
        saveData();
        
        applyPP(url);
        showNotification("Photo de profil mise à jour !", "success");
    } else if (url) {
        showNotification("Lien invalide (doit commencer par http)", "error");
    }
}

function applyPP(url) {
    const img = document.getElementById('display-pp');
    const emoji = document.getElementById('display-emoji');
    
    if (url && url.trim() !== "") {
        img.src = url;
        img.classList.remove('hidden');
        emoji.classList.add('hidden');
    } else {
        img.classList.add('hidden');
        emoji.classList.remove('hidden');
    }
}


async function claimDaily() {
    if (!activeUser) return;
    
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    const lastClaim = stats.lastDailyClaim || 0;
    
    if (now - lastClaim < oneDay) {
        const remaining = oneDay - (now - lastClaim);
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        showNotification(`Reviens dans ${hours}h pour ton prochain bonus !`, "error");
        return;
    }

    const reward = Math.floor(Math.random() * 11) + 5;
    
    balance += reward;
    stats.lastDailyClaim = now;
    
    updateBalanceDisplay(balance);
    saveData();
    
    showNotification(`MAGNIFIQUE ! Tu as reçu ${reward} coins !`, "success");
    playSound('rank-up-2.mp3');
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    
    checkDailyStatus();
}

function checkDailyStatus() {
    const btn = document.getElementById('daily-btn');
    const timerText = document.getElementById('daily-timer');
    if (!btn) return;

    if (!isSyncFinished) {
        btn.disabled = true;
        return;
    }

    const lastClaim = stats.lastDailyClaim || 0;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - lastClaim < oneDay) {
        btn.disabled = true;
        btn.classList.remove('animate-bounce');
        
        const remaining = oneDay - (now - lastClaim);
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
    } else {
        btn.disabled = false;
        btn.classList.add('animate-bounce');
    }
}

function updateGlobalStats(profit, win, countRound = true) {
    stats.totalProfit = (Number(stats.totalProfit) || 0) + Number(profit);
    
    // On n'incrémente le round que si countRound est vrai (par défaut c'est vrai)
    if (countRound) {
        stats.rounds = (Number(stats.rounds) || 0) + 1;
    }
    
    if (win) {
        stats.wins = (Number(stats.wins) || 0) + 1;
    }

    saveData();
    // Utilise displayStats() ou updateStatsUI() selon le nom dans ton fichier
    if (typeof displayStats === "function") displayStats();
}

function toggleChangelog() {
    const modal = document.getElementById('changelog-modal');
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        // Optionnel : jouer un petit son d'ouverture
        if (typeof playSound === 'function') playSound('open.mp3'); 
    } else {
        modal.classList.add('hidden');
    }
}

let isChatOpen = false;

// Dans script.js
window.toggleChat = function() {
    const chat = document.getElementById('global-chat');
    if (!chat) return;
    isChatOpen = !isChatOpen;
    chat.style.transform = isChatOpen ? 'translateX(0)' : 'translateX(100%)';
};

window.sendChatMessage = async function(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('chat-input');
    
    const msg = input.value.trim();
    if (!msg || !activeUser) return;

    const args = msg.split(" ");
    const command = args[0].toLowerCase();

    // --- COMMANDE /CLEAR ---
    if (command === "/clear" && (activeUser === "kod" || activeUser === "Koden")) {
        try {
            const q = window.fs.query(window.fs.collection(window.db_online, "chat"), window.fs.limit(50));
            const snapshot = await window.fs.getDocs(q);
            const deletePromises = snapshot.docs.map(doc => window.fs.deleteDoc(doc.ref));
            await Promise.all(deletePromises);
            input.value = "";
            return;
        } catch (err) { console.error(err); }
    }

    // --- COMMANDE /HELP ---
    if (command === "/help") {
        const isDev = activeUser === "kod" || activeUser === "Koden";
        
        // Liste des commandes de base
        let helpText = "Commandes disponibles : <br>";
        helpText += "• <b>/tip [pseudo] [montant]</b> : Envoyer des coins à un ami.<br>";
        helpText += "• <b>/help</b> : Afficher cette liste.";

        // Ajout des commandes admin si c'est toi
        if (isDev) {
            helpText += "<br><br><b>[ADMIN COMMANDS]</b> :<br>";
            helpText += "• <b>/clear</b> : Reset les 50 derniers messages.";
        }

        // On affiche ça sous forme de notification ou de message SYSTEM (ici SYSTEM pour que ce soit classe)
        await window.fs.addDoc(window.fs.collection(window.db_online, "chat"), {
            user: "System",
            text: helpText,
            rank: "SYSTEM",
            timestamp: window.fs.serverTimestamp()
        });

        input.value = "";
        return;
    }

    if (command === "/tip") {
        const targetUser = args[1]?.trim();
        const amount = parseFloat(args[2]);

        if (!targetUser || isNaN(amount) || amount <= 0) {
            showNotification("Usage: /tip [pseudo] [montant]", "error");
            return;
        }

        if (balance < amount) {
            showNotification("Solde insuffisant !", "error");
            return;
        }

        try {
            const userRef = window.fs.collection(window.db_online, "users");
            const querySnapshot = await window.fs.getDocs(userRef);
            
            let targetDoc = null;
            let finalName = "";

            querySnapshot.forEach(docSnap => {
                const data = docSnap.data();
                // On vérifie l'ID du document OU le champ username
                const nameInDb = data.username || docSnap.id; 
                
                if (nameInDb.toLowerCase() === targetUser.toLowerCase()) {
                    targetDoc = docSnap;
                    finalName = nameInDb;
                }
            });

            if (!targetDoc) {
                showNotification(`"${targetUser}" est introuvable`, "error");
                return;
            }

            if (finalName === activeUser) {
                showNotification("Action impossible sur soi-même", "error");
                return;
            }

            // Exécution du transfert
            updateBalance(balance - amount);
            await window.fs.updateDoc(targetDoc.ref, {
                balance: window.fs.increment(amount)
            });

            // Annonce SYSTEM sans PP
            await window.fs.addDoc(window.fs.collection(window.db_online, "chat"), {
                user: "SYSTEM",
                text: `💸 @${activeUser} a envoyé ${amount.toFixed(2)} coins à @${finalName} !`,
                rank: "SYSTEM",
                timestamp: window.fs.serverTimestamp()
            });

            showNotification(`Tip envoyé à ${finalName} !`, "success");
            input.value = "";
            return;
        } catch (err) {
            console.error("Tip Error:", err);
            showNotification("Erreur de base de données", "error");
        }
    }

    // --- ENVOI NORMAL ---
    try {
        const currentRank = localStorage.getItem('persisted_rank') || "BRONZE";

        await window.fs.addDoc(window.fs.collection(window.db_online, "chat"), {
            user: activeUser,
            text: msg,
            rank: currentRank, // On utilise la valeur dynamique trouvée au-dessus
            profilePic: stats.profilePic || "",
            timestamp: window.fs.serverTimestamp()
        });
        input.value = "";
    } catch (err) { console.error("Chat Error:", err); }
};

window.getRankColor = function(rank) {
    const colors = { 
        "CHAMPION": "#cc1e1e", // Rouge vif
        "DIAMOND": "#7760fa", 
        "PLATINUM": "#34d399", 
        "GOLD": "#fbbf24", 
        "SILVER": "#a0a0a0", 
        "BRONZE": "#cd7f32",
        "SYSTEM": "#8b5cf6" // Violet pour les annonces
    };
    if (!rank) return "#9ca3af";
    const cleanRank = String(rank).toUpperCase().trim();
    
    return colors[cleanRank] || "#9ca3af";
};

function initChatListener() {
    if (!window.db_online || !window.fs || !window.fs.query) {
        setTimeout(initChatListener, 500); 
        return;
    }

    const q = window.fs.query(
        window.fs.collection(window.db_online, "chat"), 
        window.fs.orderBy("timestamp", "desc"), 
        window.fs.limit(50)
    );
    
    window.fs.onSnapshot(q, (snapshot) => {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const messages = [];
        snapshot.forEach(doc => messages.push(doc.data()));
        
        container.innerHTML = messages.reverse().map(m => {
            const isSystem = m.rank === "SYSTEM";
            
            // Ajoute ton pseudo exact ici (celui enregistré dans Firebase)
            const isDev = (m.user === "kod") && !isSystem;
            

            // Masquer la PP pour le SYSTEM, l'afficher pour les autres
            const ppHtml = isSystem ? '' : `
                <div class="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-white/10 shadow-lg">
                    <img src="${m.profilePic || 'https://ui-avatars.com/api/?name=' + m.user}" class="w-full h-full object-cover">
                </div>
            `;
            const rankName = m.rank || "USER";
            const rankColor = "#b6b6b6";
            return `
            <div class="flex gap-3 items-start animate-fadeIn ${isSystem ? 'bg-[#8b5cf6]/10 border-l-2 border-[#8b5cf6] p-3 rounded-xl my-1' : 'py-1'}">
                ${ppHtml}
                <div class="flex-1 overflow-hidden">
                    <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">

                        ${isDev ? `
                            <span class="bg-[#ef4444] text-white text-[7px] px-1.5 py-0.5 rounded-md font-black italic shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-pulse">
                                DEV
                            </span>
                        ` : ''}
                        
                        <span class="font-black text-[9px] uppercase tracking-tighter" style="color: ${isDev ? '#cc1e1e' : isSystem ? '#8b5cf6' : rankColor}">
                            ${m.user}
                        </span>
                    </div>
                    <p class="${isSystem ? 'text-[#8b5cf6] font-bold italic' : 'text-zinc-400'} text-[12px] leading-tight break-words pl-1">
                        ${m.text}
                    </p>
                </div>
            </div>
        `;
        }).join('');
        container.scrollTop = container.scrollHeight;
    });
}

// Lancer l'écouteur au chargement du DOM
window.addEventListener('DOMContentLoaded', initChatListener);

// Fonction pour annoncer un gain dans le chat
window.publishWinToChat = async function(gameName, amount, multiplier = null) {
    // Vérification de sécurité pour éviter les crashs si Firebase est lent
    if (!activeUser || !window.fs || typeof window.fs.addDoc !== "function") return;

    // Seuil d'annonce (ex: gain > 50 ou multi > 2x)
    if (amount < 49 && (!multiplier || multiplier < 2)) return;

    try {
        const text = multiplier 
            ? `a encaissé ${amount.toFixed(2)} coins (x${multiplier.toFixed(2)}) sur ${gameName} ! 🏆`
            : `a gagné ${amount.toFixed(2)} coins sur ${gameName} ! 🏆`;

        await window.fs.addDoc(window.fs.collection(window.db_online, "chat"), {
            user: "SYSTEM",
            text: `📢 @${activeUser} ${text}`,
            rank: "SYSTEM",
            // Vérification de sécurité avant l'appel
            timestamp: (typeof window.fs.serverTimestamp === 'function') 
                ? window.fs.serverTimestamp() 
                : new Date() 
        });
    } catch (err) { 
        console.error("Annonce Chat Error:", err); 
    }
};

async function resetGlobalChat() {
    const q = window.fs.query(window.fs.collection(window.db_online, "chat"), window.fs.limit(50));
    const snapshot = await window.fs.getDocs(q);
    
    snapshot.forEach(async (chatDoc) => {
        await window.fs.deleteDoc(window.fs.doc(window.db_online, "chat", chatDoc.id));
    });
    console.log("Chat nettoyé avec succès !");
}
resetGlobalChat();