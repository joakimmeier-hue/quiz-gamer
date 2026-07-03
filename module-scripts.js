  import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
  import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
  import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyAfZQM3H5XAYkEt2ARInoA1Xs-Qd1DXL_s",
    authDomain: "auth.quizgamer.se",
    projectId: "quizgamer-web-app",
    storageBucket: "quizgamer-web-app.firebasestorage.app",
    messagingSenderId: "229730753032",
    appId: "1:229730753032:web:723d0c4334058a47084fbd",
    measurementId: "G-TNBLZFSFG6"
  };

  //Ny create profile från Claude här?. men character limit i WF !!!!!????!!!
  
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const googleProvider = new GoogleAuthProvider();

  let currentUser = null;
  let pendingAction = null; 

  // DOM Elements
  const loginModal = document.getElementById('login-modal');
  const googleLoginBtn = document.getElementById('google-login-btn');
  const userDisplayName = document.getElementById('user-display-name');
  const userLevelEl = document.getElementById('user-level');
  const userScoreEl = document.getElementById('user-total-score');
  const userRankEl = document.getElementById('user-rank');

  function updateAuthUI(user) {
    const dropdownToggle = document.querySelector('.w-dropdown-toggle');
    const logoutBtns = document.querySelectorAll('#logout-btn, .logout-btn');
    const loginBtns = document.querySelectorAll('#login-btn, .login-btn');

    if (user) {
      document.body.classList.add("user-logged-in");
      if (userDisplayName) userDisplayName.textContent = user.displayName || user.email;
      
      logoutBtns.forEach(btn => {
        btn.style.transition = 'none'; 
        btn.style.transform = 'scale(1)';
        btn.style.opacity = '1';
        btn.style.display = 'flex';
      });
      
      loginBtns.forEach(btn => btn.style.display = 'none');
      
      } else {
      document.body.classList.remove("user-logged-in");
      
      logoutBtns.forEach(btn => {
        if (btn.style.display !== 'none') {
          btn.style.transition = 'transform 110ms ease-out';
          btn.style.transform = 'scale(1.4)';
          
          setTimeout(() => {
            btn.style.transition = 'transform 110ms ease-in';
            btn.style.transform = 'scale(1)';
            
            setTimeout(() => {
              btn.style.transition = 'opacity 400ms ease';
              btn.style.opacity = '0';
              
              setTimeout(() => {
                btn.style.display = 'none';
                
                const overlay = document.querySelector('.inventory-overlay');
                if (overlay && window.lobbyInvOpen) {
                    closeLobbyInventory(overlay);
                }
                
              }, 400);
              
            }, 200);
            
          }, 110);
        }
      });
      
      loginBtns.forEach(btn => {
        btn.style.transition = 'none';
        btn.style.opacity = '1';
        btn.style.display = 'flex';
      });
    }
  }

  function showLoginModal() {
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
   // 1. Trigga Webflows interna animationsmotor för att stänga profilbilds-gridden
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

    // --- GAME-SIDAN: Robust "Reality Check" ---
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
      try {
        const result = await signInWithPopup(auth, googleProvider);
        currentUser = result.user; 
        hideLoginModal(); 
        
        if (googleLoginBtn) {
  googleLoginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const result = await signInWithPopup(auth, googleProvider);
      currentUser = result.user; 
      hideLoginModal(); 

      // Kolla om det är en first-time user
      const userDocRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // First-time -> visa create-profile, pendingAction ligger kvar orörd
        setTimeout(() => {
            showCreateProfile();
        }, 350);
      } else {
        // Återkommande user -> vanligt flöde
        resolvePendingAction();
      }

    } catch (error) {
      console.error("Inloggning avbruten eller misslyckades:", error.message);
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

    // 2. GENERISK LOGIN-KNAPP
    const loginBtn = e.target.closest('#login-btn, .login-btn');
    const isGoogleBtn = e.target.closest('#google-login-btn'); 
    
    if (loginBtn && !isGoogleBtn) {
      e.preventDefault();
      pendingAction = 'INVENTORY';
      showLoginModal();
      return;
    }

 // 3. BYT PROFILBILD (Helt rensad på gamla dropdown-hacks)
    const option = e.target.closest('.profile-pic-option');
    if (option) {
        e.stopPropagation(); // Stoppar klicket från att bubbla och störa andra stängnings-lyssnare
        
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
    const gameBtn = e.target.closest('.games-link-block');
    if (gameBtn && !currentUser) {
      e.preventDefault();
      e.stopPropagation();
      pendingAction = gameBtn.href; 
      showLoginModal();
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