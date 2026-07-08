// module-scripts

  import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
  import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
  const firebaseConfig = {
    apiKey: "AIzaSyAfZQM3H5XAYkEt2ARInoA1Xs-Qd1DXL_s",
    authDomain: "auth.quizgamer.se",
    projectId: "quizgamer-web-app",
    storageBucket: "quizgamer-web-app.firebasestorage.app",
    messagingSenderId: "229730753032",
    appId: "1:229730753032:web:723d0c4334058a47084fbd",
    measurementId: "G-TNBLZFSFG6"
  };
  
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const googleProvider = new GoogleAuthProvider();
  let currentUser = null;
  let pendingAction = null; 
  let isAuthenticating = false; // NYTT: skydd mot dubbla samtidiga inloggningsförsök
  // DOM Elements
  const loginModal = document.getElementById('login-modal');
  const googleLoginBtn = document.getElementById('google-login-btn');
  const userDisplayName = document.getElementById('user-display-name');
  const userLevelEl = document.getElementById('user-level');
  const userScoreEl = document.getElementById('user-total-score');
  const userRankEl = document.getElementById('user-rank');

  function updateAuthUI(user) {
    const logoutBtns = document.querySelectorAll('#logout-btn, .logout-btn');
    
    if (user) {
      // ANVÄNDARE ÄR INLOGGAD
      document.body.classList.add("user-logged-in");
      if (userDisplayName) userDisplayName.textContent = user.displayName || user.email;
      
      // Visa utloggningsknappen (utan några skumma animationer)
      logoutBtns.forEach(btn => {
        btn.style.display = 'flex'; 
      });
      
    } else {
      // ANVÄNDARE ÄR UTLOGGAD
      document.body.classList.remove("user-logged-in");
      
      // Dölj utloggningsknappen direkt
      logoutBtns.forEach(btn => {
        btn.style.display = 'none';
      });
      
      // Stäng inventoryt omedelbart om det råkar vara öppet när man loggar ut
      const overlay = document.querySelector('.inventory-overlay');
      if (overlay && window.lobbyInvOpen) {
          closeLobbyInventory(overlay);
      }
    }
  }
  function showLoginModal() {
    if (currentUser) return; // NYTT: redan inloggad - visa aldrig login-modalen igen
    if (loginModal) {
      loginModal.style.display = 'flex';
      loginModal.style.opacity = '0';
      loginModal.style.transition = 'opacity 250ms ease-out';
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          loginModal.style.opacity = '1';
        });
      });
    }
  }
  function hideLoginModal() {
    if (loginModal) {
      loginModal.style.transition = 'opacity 250ms ease-out';
      loginModal.style.opacity = '0';
      
      setTimeout(() => {
        if (loginModal.style.opacity === '0') {
          loginModal.style.display = 'none';
        }
      }, 250);
    }
  }
  // ── CREATE PROFILE (First-time users) ──
  function showCreateProfile() {
    const createProfileEl = document.getElementById('create-profile') || document.querySelector('.create-profile');
    if (createProfileEl) {
      createProfileEl.style.display = 'flex';
    }
  }
  function hideCreateProfile() {
    const createProfileEl = document.getElementById('create-profile') || document.querySelector('.create-profile');
    if (createProfileEl) {
      createProfileEl.style.display = 'none';
    }
  }
  // Görs tillgänglig globalt så att create-profile-flödets "klar/spara"-knapp
  // (var den nu ligger) kan anropa hideCreateProfile() + resolvePendingAction()
  // när användaren är klar med sin profil.
  window.hideCreateProfile = hideCreateProfile;
  window.resolvePendingAction = resolvePendingAction;

  // ── LÖS DET SOM ANVÄNDAREN FÖRSÖKTE GÖRA INNAN INLOGGNING KRÄVDES ──
  function resolvePendingAction() {
    if (!pendingAction) return;

    if (pendingAction === 'INVENTORY') {
      const overlay = document.querySelector('.inventory-overlay');
      if (overlay && !window.lobbyInvOpen) {
        openLobbyInventory(overlay);
      }
    } else {
      // pendingAction är annars en URL (spel-länk)
      if (typeof window.triggerPageExit === 'function') {
        window.triggerPageExit(pendingAction, false);
      } else {
        window.location.href = pendingAction;
      }
    }

    pendingAction = null;
  }
  // ── HJÄLPFUNKTION: Kollar om en knapp faktiskt syns ──
  function isVisible(el) {
    return el && window.getComputedStyle(el).display !== 'none';
  }
  // ── STATE TRACKERS ──
  window.gameInvOpen = false;  
  window.lobbyInvOpen = false; 
  // Uppdatera staten om användaren klickar med musen på game-knapparna
  document.addEventListener('click', (e) => {
      if (e.target.closest('#i-game-btn-show')) window.gameInvOpen = true;
      if (e.target.closest('#i-game-btn-hide')) window.gameInvOpen = false;
  }, true);
  // ── BARA FÖR LOBBYN: Animationer ──
  function openLobbyInventory(overlay) {
      window.lobbyInvOpen = true;
      overlay.style.transition = 'none';
      overlay.style.opacity = '0';
      overlay.style.display = 'flex';
      requestAnimationFrame(() => {
          requestAnimationFrame(() => {
              overlay.style.transition = 'opacity 160ms ease-out';
              overlay.style.opacity = '1';
          });
      });
  }
  function closeLobbyInventory(overlay) {
   // 1. Trigga Webflows interna animationsmotor för att stänga pp
  try {
    const wfIx = Webflow.require("ix3");
    wfIx.emit("pp-dropdown-hide");
    console.log("Webflow IX3-event 'pp-dropdown-hide' skickat.");
  } catch (error) {
    console.error("Gick inte att köra Webflows custom event:", error);
  }
      window.lobbyInvOpen = false;
      overlay.style.transition = 'opacity 160ms ease-out';
      overlay.style.opacity = '0';
      setTimeout(() => {
          if (!window.lobbyInvOpen) overlay.style.display = 'none';
      }, 160);
  }
  // ── TANGENTBORDS-LYSSNARE (I, TAB, ESC) ──
document.addEventListener('keydown', (e) => {
    if (e.repeat) return; // Stoppar buggar om man håller inne knappen
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const key = e.key.toLowerCase();
    const isGameSide = document.body.dataset.page === 'game';
    // --- Inventory på GAME-SIDAN: Robust "Reality Check" ---
    if (isGameSide) {
        if (key === 'i' || key === 'tab' || key === 'escape') {
            e.preventDefault();
            
            const showBtn = document.getElementById('i-game-btn-show');
            const hideBtn = document.getElementById('i-game-btn-hide');
            
            // Kolla vad som faktiskt syns i DOM:en just nu
            const isHideVisible = hideBtn && window.getComputedStyle(hideBtn).display !== 'none';
            
            // Om ESC trycks eller om Inventory är öppet (hide-knappen syns) -> Stäng
            if (key === 'escape' || isHideVisible) {
                if (hideBtn) hideBtn.click();
            } 
            // Om Toggle trycks och Inventory är stängt -> Öppna
            else if (key === 'i' || key === 'tab') {
                if (showBtn) showBtn.click();
            }
        }
    } 
    // --- LOBBY-SIDAN: Din original-logik (Orörd) ---
    else {
        // Hantera I och TAB (Toggle)
        if (key === 'i' || key === 'tab') {
            e.preventDefault();
            
            if (!currentUser) {
                pendingAction = 'INVENTORY';
                showLoginModal();
                return;
            }
            const overlay = document.querySelector('.inventory-overlay');
            if (window.lobbyInvOpen) {
                if (overlay) closeLobbyInventory(overlay);
            } else {
                if (overlay) openLobbyInventory(overlay);
            }
        }
        // Hantera ESC (Enbart stäng)
        if (key === 'escape') {
            if (loginModal && window.getComputedStyle(loginModal).display !== 'none') {
                e.preventDefault();
                e.stopPropagation();
                hideLoginModal();
                return;
            } 
            
            if (window.lobbyInvOpen) {
                e.preventDefault();
                const overlay = document.querySelector('.inventory-overlay');
                if (overlay) closeLobbyInventory(overlay);
            }
        }
    }
}, true);
 // ── GOOGLE LOGIN ──
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (isAuthenticating) return; // NYTT: redan på gång - ignorera extra klick under popupen
      isAuthenticating = true;
      try {
        const result = await signInWithPopup(auth, googleProvider);
        currentUser = result.user; 
        hideLoginModal(); 

        // Kolla om det är en first-time user
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          // First-time -> visa create-profile, pendingAction ligger kvar orörd
          // tills profilen är klar (anropa window.resolvePendingAction() därifrån)
          setTimeout(() => {
              showCreateProfile();
          }, 350);
        } else {
          // Återkommande user -> kör vidare med det man försökte göra innan inloggningen
          resolvePendingAction();
        }

      } catch (error) {
        console.error("Inloggning avbruten eller misslyckades:", error.message);
      } finally {
        isAuthenticating = false; // NYTT
      }
    });
  }
  // ── GLOBAL KLICKLYSSNARE ──
  document.addEventListener('click', async (e) => {
    
    // 1. LOGGA UT
    const logoutBtn = e.target.closest('#logout-btn, .logout-btn');
    if (logoutBtn) {
      e.preventDefault();
      try {
        await signOut(auth);
      } catch (error) {
        console.error("Fel vid utloggning:", error);
      }
      return; 
    }

 // 3. BYT PROFILBILD (Helt rensad på gamla dropdown-hacks)
    const option = e.target.closest('.profile-pic-option');
    if (option) {        
        const selectedSrc = option.src;
        const currentAvatarDisplay = document.querySelector('.current-profile-pic');
        if (selectedSrc && currentAvatarDisplay) {
            // Uppdatera bilden i UI direkt
            currentAvatarDisplay.src = selectedSrc; 
            
            // Spara valet till Firestore (all logik körs i bakgrunden)
            await saveUserAvatar(selectedSrc);      
        }
        return;
    }

    // 4. GATEKEEPER FÖR SPEL-LÄNKAR
    // OBS: .games-link-block är nu undantagen i global-scripts.js:s egna
    // länk/transition-hanterare, så ALL navigation för dessa länkar sköts härifrån.
    const gameBtn = e.target.closest('.games-link-block');
    if (gameBtn) {
      e.preventDefault();
      e.stopPropagation();

      if (!currentUser) {
        pendingAction = gameBtn.href;
        showLoginModal();
      } else {
        if (typeof window.triggerPageExit === 'function') {
          window.triggerPageExit(gameBtn.href, false);
        } else {
          window.location.href = gameBtn.href;
        }
      }
      return;
    }

    // 5. GATEKEEPER & ÖPPNA FÖR LOBBY INVENTORY
    const invBtn = e.target.closest('#lobby-inventory-btn');
    if (invBtn) {
      e.preventDefault();
      e.stopPropagation();
      
      if (!currentUser) {
        pendingAction = 'INVENTORY';
        showLoginModal();
      } else {
        const overlay = document.querySelector('.inventory-overlay');
        if (overlay && !window.lobbyInvOpen) {
            openLobbyInventory(overlay);
        }
      }
      return;
    }

    // 5b. STÄNG-KNAPP FÖR LOBBY INVENTORY
    const closeBtn = e.target.closest('#i-lobby-back');
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      
      const overlay = document.querySelector('.inventory-overlay');
      if (overlay && window.lobbyInvOpen) {
          closeLobbyInventory(overlay);
      }
      return;
    }
  }); 

  // HÄMTA DATA (BILD + STATS)
  async function loadUserData(uid) {
    const currentAvatarDisplay = document.querySelector('.current-profile-pic');
    try {
      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (currentAvatarDisplay) {
          if (data.profilePicUrl) {
            // 1. Användaren har en sparad bild i databasen
            currentAvatarDisplay.src = data.profilePicUrl;
          } else if (auth.currentUser && auth.currentUser.photoURL) {
            // 2. Fallback: Användaren har en bild via Google
            currentAvatarDisplay.src = auth.currentUser.photoURL;
          } else {
            // 3. NY SPELARE: Slumpa en bild från dina alternativ i Webflow
            const avatarOptions = document.querySelectorAll('.profile-pic-option');
            
            if (avatarOptions.length > 0) {
              const randomIndex = Math.floor(Math.random() * avatarOptions.length);
              const randomAvatarSrc = avatarOptions[randomIndex].src;
              
              // Sätt bilden i UI
              currentAvatarDisplay.src = randomAvatarSrc;
              
              // Spara den slumpade bilden till Firestore direkt så den låses till spelaren
              await saveUserAvatar(randomAvatarSrc);
              console.log("Ny spelare! Slumpade en avatar: ", randomAvatarSrc);
            }
          }
        }
        if (userLevelEl) userLevelEl.textContent = "Level " + (data.level || 1);
        if (userScoreEl) userScoreEl.textContent = (data.totalScore || 0);
        if (userRankEl) userRankEl.textContent = (data.rank || 0);
        if (userDisplayName) userDisplayName.textContent = data.username || "Player";
      }
    } catch (error) {
      console.error("Failed to load user data:", error);
    }
  }  

  // SPARA PROFILBILD
  async function saveUserAvatar(avatarUrl) {
    if (!currentUser) return;
    try {
      const userDocRef = doc(db, "users", currentUser.uid);
      await setDoc(userDocRef, { 
        profilePicUrl: avatarUrl,
        updatedAt: new Date()
      }, { merge: true });
      
      console.log("Profile picture successfully saved!");
    } catch (error) {
      console.error("Failed to save profile picture to database:", error);
    }
  }

  // ── FIREBASE AUTH OBSERVER ──
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUI(user);
    if (user) {
      loadUserData(user.uid);
    }
  });
