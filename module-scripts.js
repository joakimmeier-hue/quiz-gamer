// module-scripts
  import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
  import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
  import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js";

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
  const functions = getFunctions(app);
  const completeProfileFn = httpsCallable(functions, "completeProfile");
  const changeUsernameFn = httpsCallable(functions, "changeUsername");
  const startGameFn = httpsCallable(functions, "startGame");
  const gradeGameFn = httpsCallable(functions, "gradeGame");

  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
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

// Ensure currentSlug exists for routing (must be defined before routeGuard runs)
if (typeof currentSlug === 'undefined') {
  let derived = (window.location.pathname || '/').replace(/^\/+|\/+$/g, '');
  if (!derived) {
    // default for root
    derived = 'lobby';
  } else {
    // take the last path segment and strip .html if present
    derived = derived.split('/').pop().replace(/\.html$/i, '');
  }
  // expose as globals so existing code that uses `currentSlug` works
  window.currentSlug = derived;
  currentSlug = derived;
}

function updateAuthUI(user) {
    if (user) {
      // ANVÄNDARE ÄR INLOGGAD
      document.body.classList.add("user-logged-in");
      if (userDisplayName) userDisplayName.textContent = user.displayName || user.email;
      
    } else {
      // ANVÄNDARE ÄR UTLOGGAD
      document.body.classList.remove("user-logged-in");
      
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
    createProfileEl.style.opacity = '0';
    createProfileEl.style.transition = 'opacity 250ms ease-out';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        createProfileEl.style.opacity = '1';

        // Ensure the create input is NOT focused when the modal opens.
        // This keeps the modal "neutral" until the user actually taps it.
        setTimeout(() => {
          try {
            if (typeof createUsernameInput !== 'undefined' && createUsernameInput) {
              // blur to guarantee neutral start
              createUsernameInput.blur();
            }
          } catch (err) { /* non-fatal */ }
        }, 0);

      });
    });
  }
}

  function hideCreateProfile() {
    const createProfileEl = document.getElementById('create-profile') || document.querySelector('.create-profile');
    if (createProfileEl) {
      createProfileEl.style.transition = 'opacity 250ms ease-out';
      createProfileEl.style.opacity = '0';
      
      setTimeout(() => {
        if (createProfileEl.style.opacity === '0') {
          createProfileEl.style.display = 'none';
           // NYTT: Återställ fältet till placeholder för nästa användare
          if (typeof createUsernameInput !== 'undefined' && createUsernameInput) {
              createUsernameInput.textContent = createDefaultPlaceholder;
              createUsernameInput.style.color = "rgba(255, 255, 255, 0.35)";
          }
          if (typeof createProfileSubmitBtn !== 'undefined' && createProfileSubmitBtn) {
              createProfileSubmitBtn.classList.remove('is-active');
              createProfileSubmitBtn.style.pointerEvents = 'none';
          }
          if (typeof errorMsgEl !== 'undefined' && errorMsgEl) {
              errorMsgEl.style.display = 'none';
              errorMsgEl.innerHTML = "";
          }
        }
      }, 250);
    }
  }
  
  // Görs tillgänglig globalt så att create-profile-flödets "klar/spara"-knapp
  // (var den nu ligger) kan anropa hideCreateProfile() + resolvePendingAction()
  // när användaren är klar med sin profil.
  window.hideCreateProfile = hideCreateProfile;
  window.resolvePendingAction = resolvePendingAction;

  // ── LÖS DET SOM ANVÄNDAREN FÖRSÖKTE GÖRA INNAN INLOGGNING KRÄVDES ──
 function resolvePendingAction() {
   console.log("resolvePendingAction() utlöst. Aktiv handling:", pendingAction);
   if (!pendingAction) {
     console.log("Ingen handling låg i kö.");
     return;
   }

   if (pendingAction === 'INVENTORY') { 
     const overlay = document.querySelector('.inventory-overlay');
     console.log("Försöker öppna inventory-overlay:", overlay);
     if (overlay && !window.lobbyInvOpen) {
       openLobbyInventory(overlay);
     }
   } else {
     // pendingAction är en URL (spel-länk)
     console.log("Navigerar vidare till spel-länk:", pendingAction);
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

// Robust close for the profile-pic dropdown / pp-grid
function hidePPDropdown() {
  try {
    // 1) Find any visible pp-grid using bounding rect (works inside overlays)
    const openGrid = Array.from(document.querySelectorAll('.pp-grid')).find(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && (rect.width > 0 || rect.height > 0);
    });
    if (openGrid) {
      const dropdown = openGrid.closest('.pp-dropdown');
      const closer = dropdown?.querySelector('.pp-dropdown-closer');
      if (closer) {
        // native closer exists → click it (triggers Webflow component interactions)
        closer.click();
        return;
      }
    }

    // 2) Try Webflow ix3 custom event (pp-dropdown-hide) if available
    try {
      if (window.Webflow && typeof Webflow.require === 'function') {
        const wfx = Webflow.require('ix3');
        if (wfx && typeof wfx.emit === 'function') {
          wfx.emit('pp-dropdown-hide');
          return;
        }
      }
    } catch (err) {
      console.warn('hidePPDropdown: ix3 emit failed', err);
    }

    // 3) Last-resort fallback: hide any .pp-grid element (non-destructive)
    const anyGrid = document.querySelector('.pp-grid');
    if (anyGrid) anyGrid.style.display = 'none';
  } catch (err) {
    console.warn('hidePPDropdown error', err);
  }
}

// ── STATE TRACKERS ──
  window.lobbyInvOpen = false; 
  window.isGameInvAnimating = false;

  // ── BARA FÖR LOBBYN: Animationer ──
  function openLobbyInventory(overlay) {
    // Close any open profile-pic dropdowns first, so inventory opens in a clean state
    hidePPDropdown();
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
  window.lobbyInvOpen = false;
  overlay.style.transition = 'opacity 160ms ease-out';
  overlay.style.opacity = '0';
  setTimeout(() => {
      if (!window.lobbyInvOpen) overlay.style.display = 'none';
  }, 200);
}
// ── TANGENTBORDS-LYSSNARE (I, TAB, ESC) ──
document.addEventListener('keydown', (e) => {
  if (e.repeat) return; // Stoppar buggar om man håller inne knappen

  const key = (e.key || '').toLowerCase();

  // --- 1) PP-GRID PRIORITY: ESC should close any open pp-grid first ---
  if (key === 'escape') {
    const openGrid = Array.from(document.querySelectorAll('.pp-grid')).find(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && (rect.width > 0 || rect.height > 0);
    });
    if (openGrid) {
      e.preventDefault();
      e.stopPropagation();
      hidePPDropdown();
      return; // stop further handling — pp-grid closed
    }
  }

  // Allow ESC to operate even if user is typing
  if (key !== 'escape' && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  // --- BRILJANT SPÄRR: Kolla om någon modal/overlay ligger i vägen ---
  const blockingSelectors = [
    '.login-modal-wrapper',
    '.create-profile',
    '.change-username',
    '.intro-overlay-grp'
  ];

  let visibleModal = null;
  for (let selector of blockingSelectors) {
    const el = document.querySelector(selector);
    if (el && window.getComputedStyle(el).display !== 'none') {
      visibleModal = el;
      break;
    }
  }

  if (visibleModal) {
    if (key === 'escape' && visibleModal.classList.contains('change-username')) {
      visibleModal.click();
    }
    if (key === 'escape' && visibleModal.classList.contains('login-modal-wrapper')) {
      hideLoginModal();
    }
    return;
  }

  const isGameSide = document.body.dataset.page === 'game';

  if (isGameSide) {
    if (key === 'i' || key === 'tab' || key === 'escape') {
      const arrowBtn = document.querySelector('.i-btn-arrow');
      const crossBtn = document.querySelector('.i-btn-cross');

      if (!arrowBtn || !crossBtn) return;
      if (window.isGameInvAnimating) return;

      const isOpen = window.getComputedStyle(crossBtn).display !== 'none';

      const triggerClick = (btn) => {
        window.isGameInvAnimating = true;
        btn.click();
        setTimeout(() => { window.isGameInvAnimating = false; }, 150);
      };

      if (key === 'escape') {
        if (isOpen) {
          e.preventDefault();
          e.stopPropagation();
          triggerClick(crossBtn);
        }
        return;
      } else if (key === 'i' || key === 'tab') {
        e.preventDefault();
        if (isOpen) triggerClick(crossBtn);
        else triggerClick(arrowBtn);
      }
    }
    return;
  } else {
   if (key === 'i' || key === 'tab') {
  e.preventDefault();

  if (!currentUser) {
    pendingAction = 'INVENTORY';
    showLoginModal();
    return;
  }

  const overlay = document.querySelector('.inventory-overlay');

  // Close pp-dropdown first, then toggle inventory after a short delay
  hidePPDropdown();
  setTimeout(() => {
    if (window.lobbyInvOpen) {
      if (overlay) closeLobbyInventory(overlay);
    } else {
      if (overlay) openLobbyInventory(overlay);
    }
  }, 40);
}

    if (key === 'escape') {
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
     if (isAuthenticating) return; // Skydd mot dubbla samtidiga inloggningsförsök
     isAuthenticating = true;
     
     try {
       console.log("Initierar Google Sign-In Popup...");
       const result = await signInWithPopup(auth, googleProvider);
       currentUser = result.user; 
       console.log("Inloggning lyckades för:", currentUser.displayName);
       
       hideLoginModal(); 

       // Skapa en säkerhetsspärr för Firestore-läsningen
       let isFirstTime = false;
       try {
         const userDocRef = doc(db, "users", currentUser.uid);
         const userDoc = await getDoc(userDocRef);
         if (!userDoc.exists()) {
           isFirstTime = true;
         }
       } catch (firestoreError) {
         console.warn("Kunde inte läsa från Firestore (kolla regler/molnstatus):", firestoreError.message);
         // FALLBACK: Om databasen nekar oss, blocka inte spelaren. Kör vidare!
       }

       if (isFirstTime) {
         console.log("Ny spelare upptäckt. Visar profilskaparen...");
         setTimeout(() => {
             showCreateProfile();
         }, 350);
       } else {
         console.log("Återkommande spelare. Verkställer sparad handling...");
         resolvePendingAction();
       }

     } catch (error) {
       console.error("Inloggning avbruten eller misslyckades helt:", error.message);
     } finally {
       isAuthenticating = false; 
     }
   });
 }

  // ── GLOBAL KLICKLYSSNARE ──
  document.addEventListener('click', async (e) => {
    const isGameSide = document.body.dataset.page === 'game';
   
    // -- ÖPPNA CHANGE USERNAME MODAL --
    const usernameLabel = e.target.closest('.player-info.username');
    if (usernameLabel) {
        const changeModal = document.querySelector('.change-username');
        if (changeModal) {
            changeModal.style.display = 'flex';
            changeModal.style.opacity = '0';
            // Liten delay så display:flex hinner registreras innan opacity animeras
            setTimeout(() => {
              changeModal.style.transition = 'opacity 200ms ease';
              changeModal.style.opacity = '1';
          }, 10);
        }
        return;
    }

// -- STÄNG CHANGE USERNAME MODAL (Klick på bakgrunden) --
    const changeModalTarget = e.target.closest('.change-username');
    if (changeModalTarget && e.target === changeModalTarget) {
        changeModalTarget.style.transition = 'opacity 200ms ease';
        changeModalTarget.style.opacity = '0';
        setTimeout(() => {
            changeModalTarget.style.display = 'none';
            
            // POINT 1: Återställ fältet när modalen stängs (om de inte är permanent låsta)
            if (changeUsernameInput && changeUsernameInput.getAttribute('contenteditable') !== 'false') {
                changeUsernameInput.textContent = changeDefaultPlaceholder;
                changeUsernameInput.style.color = "rgba(255, 255, 255, 0.35)";
                
                if (changeProfileSubmitBtn) {
                    changeProfileSubmitBtn.classList.remove('is-active');
                    changeProfileSubmitBtn.style.pointerEvents = 'none';
                }
                if (changeErrorMsgEl) {
                    changeErrorMsgEl.style.display = 'none';
                    changeErrorMsgEl.innerHTML = "";
                }
            }
        }, 200);
        return;
    }
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

// 3. BYT PROFILBILD (Uppdaterad för att ändra alla instanser av klassen)
const option = e.target.closest('.profile-pic-option');
if (option && !isGameSide) {
  const selectedSrc = option.src;
  const currentAvatars = document.querySelectorAll('.current-profile-pic');

  if (selectedSrc && currentAvatars.length > 0) {
    // Uppdatera ALLA profilbilder i UI direkt (Lobby, dropdown, etc.)
    currentAvatars.forEach(img => img.src = selectedSrc);

    // Spara valet till Firestore
    await saveUserAvatar(selectedSrc);

    // Close the pp-dropdown if still open (robust: closer click → ix3 event → fallback)
    hidePPDropdown();
  }

  // Stop further click handling for this event
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
   const currentAvatars = document.querySelectorAll('.current-profile-pic');
   const defaultAvatar = "https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a43d799e6705e122388ffdc_ppic0.svg";
   
   try {
     const userDocRef = doc(db, "users", uid);
     const userDoc = await getDoc(userDocRef);
     
     if (userDoc.exists()) {
       const data = userDoc.data();
       
       // 1. HANTERA PROFILBILD FÖR EXISTERANDE ANVÄNDARE
       if (currentAvatars.length > 0) {
         if (data.profilePicUrl) {
           currentAvatars.forEach(img => img.src = data.profilePicUrl);
         } else {
           currentAvatars.forEach(img => img.src = defaultAvatar);
         }
       }
       
       // Uppdatera resten av UI med sparad data
       if (userLevelEl) userLevelEl.textContent = "Level " + (data.level || 1);
       if (userScoreEl) userScoreEl.textContent = (data.totalScore || 0);
       if (userRankEl) userRankEl.textContent = (data.rank || 0);
       if (userDisplayName) userDisplayName.textContent = data.username || "Player";
       // NYTT: Tvinga ut namnet till alla UI-element när sidan laddas
        const uiNameElements = document.querySelectorAll('.player-info.username');
        uiNameElements.forEach(el => {
            el.textContent = data.username || "Player";
        });
       

       // NYTT: Kolla om användaren redan bytt namn en gång
       if (data.hasChangedUsername) {
           lockOutNameChangeUI(); // Låser UI:t (funktionen skapar vi längre ner)
       }

     } else {
      // 2. HELT NY SPELARE
      if (currentAvatars.length > 0) {
      currentAvatars.forEach(img => img.src = defaultAvatar);
      }
      
      if (userLevelEl) userLevelEl.textContent = "Level 1";
      if (userScoreEl) userScoreEl.textContent = "0";
      if (userRankEl) userRankEl.textContent = "0";
      
      if (userDisplayName) userDisplayName.textContent = "New Player";
      
      console.log("Ny användare detekterad. Vänter på profilskapare...");
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

  // ── FIREBASE AUTH OBSERVER ── & ── INCOMPLETE ACCOUNT RECOVERY ──
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateAuthUI(user);

  if (!user) {
    // Not signed in
    routeGuard(false);
    return;
  }

  // Signed in — ensure Firestore user doc exists and is complete
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.log("🔴 NEW USER - Showing create profile");
      showCreateProfile();
      routeGuard(false);
      return;
    }

    const userData = userDoc.data();
    const hasUsername = userData.username && userData.username.trim() !== "";
    const hasProfilePic = userData.profilePicUrl && userData.profilePicUrl !== "";

    if (!hasUsername || !hasProfilePic) {
      console.log("🟡 INCOMPLETE PROFILE - Forcing create profile");
      showCreateProfile();
      routeGuard(false);
      return;
    }

    // User is complete
    loadUserData(user.uid);
    routeGuard(true);
  } catch (err) {
    console.warn("Firestore error:", err.message || err);
    showCreateProfile();
    routeGuard(false);
  }
});

// ── ROUTE GUARD SYSTEM ──────────────────────────────────────────────
let routeGuardHasRun = false;

function routeGuard(isLoggedIn) {
    if (routeGuardHasRun) return;

    const PUBLIC_PAGES = ['lobby', 'terms', 'privacy'];
    if (!isLoggedIn && !PUBLIC_PAGES.includes(currentSlug)) {
        window.location.replace('/');
        return;
    }
    if (!isLoggedIn) return;

    routeGuardHasRun = true;

    const cameFrom = sessionStorage.getItem('navFrom');
    sessionStorage.removeItem('navFrom');
    if (currentSlug === 'score') {
        const authorized = sessionStorage.getItem('scoreAuthorized') === 'true';
        sessionStorage.removeItem('scoreAuthorized');
        if (!authorized) {
            window.location.replace('/');
            return;
        }
    }
    const gameMatch = currentSlug.match(/^([a-z]+)-game-(\d+)$/);
    if (gameMatch) {
        const theme = gameMatch[1];
        const validPrevious = `${theme}-start`;
        if (cameFrom !== validPrevious) {
            window.location.replace('/' + validPrevious);
            return;
        }
    }
}


// ==========================================
// ── 1. DELAD KOMPONENT FÖR TEXTFÄLT ──
// ==========================================
// Denna funktion fungerar som en komponent. Den ger båda fälten exakt samma beteende.
function setupUsernameInput(inputEl, btnEl, defaultPlaceholder) {
    if (!inputEl || !btnEl) return;
    // store placeholder on element so focus helper can detect it reliably
    inputEl.dataset.defaultPlaceholder = defaultPlaceholder;
    // -- START-UTSEENDE --
    if (inputEl.textContent.trim() === defaultPlaceholder || inputEl.textContent.trim() === "") {
        inputEl.textContent = defaultPlaceholder;
        inputEl.style.color = "rgba(255, 255, 255, 0.35)";
    }
    // -- FOKUS --
    inputEl.addEventListener('focus', () => {
        if (inputEl.textContent.trim() === defaultPlaceholder) {
            inputEl.textContent = "";
        }
        inputEl.style.color = "rgba(255, 255, 255, 1)";
    });
    // -- BLUR --
    inputEl.addEventListener('blur', () => {
        inputEl.textContent = inputEl.textContent.trim();
        if (inputEl.textContent === "") {
            inputEl.textContent = defaultPlaceholder;
            inputEl.style.color = "rgba(255, 255, 255, 0.35)";
        }
    });
    // -- TANGENTTRYCK (Enter, Mellanslag, Max 14) --
    inputEl.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'];
        const currentText = inputEl.textContent || "";
        const selection = window.getSelection().toString(); 
        
        // ENTER: Hindra radbyte och klicka på fältets tillhörande knapp
        if (e.key === 'Enter') { 
            e.preventDefault(); 
            const btnStyle = window.getComputedStyle(btnEl);    
            if (btnStyle.pointerEvents !== 'none') {
                btnEl.click(); 
            }
            return; 
        }
        // MELLANSLAG: Stoppa endast om det är det allra första tecknet. 
        if (e.key === ' ' && currentText.length === 0) {
            e.preventDefault(); 
            return; 
        }
        
        // MAX 14 TECKEN (Fysisk spärr, tillåter navigering/radering)
        if (currentText.length >= 14 && selection.length === 0 && !allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
            e.preventDefault(); 
        }
    });
    // -- KLISTRA IN (Tvätta bort radbrytningar) --
    inputEl.addEventListener('paste', (e) => {
        e.preventDefault();
        let pasteText = (e.clipboardData || window.clipboardData).getData('text');
        pasteText = pasteText.replace(/[\r\n]+/g, '');
        document.execCommand('insertText', false, pasteText);
    });
    // -- VÄCK KNAPPEN NÄR MAN SKRIVER --
    inputEl.addEventListener('input', () => {
    let rawText = inputEl.textContent || "";

    // FIX: iOS Safari race condition — occasionally the very first keystroke
    // lands INSIDE the placeholder before 'focus' has cleared it (typically
    // right after the modal's fade-in), producing e.g. "jMr Smart" instead
    // of clearing to "" first. If that's happened, the text will still
    // CONTAIN the placeholder as a substring (even though it no longer
    // EQUALS it, which is why the focus-handler's check missed it).
    // Strip just the placeholder portion out, keeping whatever was typed.
    if (rawText !== defaultPlaceholder && rawText.includes(defaultPlaceholder)) {
        const cleaned = rawText.split(defaultPlaceholder).join('');
        inputEl.textContent = cleaned;
        inputEl.style.color = "rgba(255, 255, 255, 1)";

        try {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(inputEl);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (err) { /* non-fatal */ }

        rawText = cleaned;
    }

    if (rawText.trim().length > 0 && rawText.trim() !== defaultPlaceholder) {
        btnEl.classList.add('is-active');
        btnEl.style.pointerEvents = 'auto';
    } else {
        btnEl.classList.remove('is-active');
        btnEl.style.pointerEvents = 'none';
    }
  });
}
// helper: focus a contenteditable and place caret at end
// Also clears a stored data-default-placeholder if the element currently contains it.
function focusContentEditableAtEnd(el) {
  if (!el) return;
  try {
    // Ensure element is focusable
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');

    // If the element contains the stored placeholder text, clear it now
    const storedPlaceholder = el.dataset.defaultPlaceholder;
    if (storedPlaceholder && el.textContent.trim() === storedPlaceholder) {
      el.textContent = "";
      el.style.color = "rgba(255, 255, 255, 1)";
    }

    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // caret at end
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (err) {
    // non-fatal, fail silently
    console.warn('focusContentEditableAtEnd error', err);
  }
}
// -- DELAD VALIDERINGS-KOMPONENT --
function validateUsernameRules(rawName) {
    let errors = [];
    const letterCount = (rawName.match(/[a-zA-ZåäöÅÄÖ]/g) || []).length;
    if (rawName.length < 3 || letterCount < 1) {
        errors.push("Minimum 3 characters including 1 letter");
    }
    if (rawName.length > 14) errors.push("Maximum 14 characters");
    const spaceCount = (rawName.match(/ /g) || []).length;
    if (spaceCount > 1) errors.push("Only one space allowed");
    const invalidCharRegex = /[^a-zA-Z0-9åäöÅÄÖ\-_ ]/; 
    if (rawName.length > 0 && invalidCharRegex.test(rawName)) {
        errors.push("Ops, invalid character");
    }
    return errors;
}

// ==========================================
// ── 2. CREATE PROFILE LOGIC ──
// ==========================================
const createProfileSubmitBtn = document.getElementById('cp-create-btn'); 
const createUsernameInput = document.getElementById('cp-username-input'); 
const errorMsgEl = document.getElementById('cp-error-msg');
const createDefaultPlaceholder = "Mr Smart";
// Make sure the create input is focusable (fallback if Webflow didn't add tabindex)
if (typeof createUsernameInput !== 'undefined' && createUsernameInput && !createUsernameInput.hasAttribute('tabindex')) {
  createUsernameInput.setAttribute('tabindex', '0');
}

// Ensure single-tap focus on mobile/desktop: only focus when the user actually taps/clicks.
// We add touchstart and mousedown handlers which call the same focus helper used elsewhere.
if (typeof createUsernameInput !== 'undefined' && createUsernameInput) {
  const cpUserFirstInteraction = (e) => {
    // If already focused, do nothing
    if (document.activeElement === createUsernameInput) return;
    // Focus and place caret at end (also clears placeholder if matches)
    focusContentEditableAtEnd(createUsernameInput);
    // Let the browser continue; do NOT preventDefault here — we want normal input behavior afterwards.
  };

  // touchstart ensures immediate focus on mobile; mousedown helps desktop first-click cases.
  createUsernameInput.addEventListener('touchstart', cpUserFirstInteraction, { passive: true });
  createUsernameInput.addEventListener('mousedown', cpUserFirstInteraction);
  // as a fallback, ensure click also focuses if nothing else did
  createUsernameInput.addEventListener('click', (e) => {
    if (document.activeElement !== createUsernameInput) focusContentEditableAtEnd(createUsernameInput);
  });
}
if (createProfileSubmitBtn && createUsernameInput) {
  
  // 1. Koppla fältet till vår nya gemensamma funktion
  setupUsernameInput(createUsernameInput, createProfileSubmitBtn, createDefaultPlaceholder);

  // 2. Klick på Create
  createProfileSubmitBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (errorMsgEl) {
        errorMsgEl.style.display = 'none';
        errorMsgEl.innerHTML = "";
    }
    let errors = [];

    // NEW: Safety check - ensure user is authenticated
    if (!currentUser || !currentUser.uid) {
        console.error("❌ User not authenticated!");
        if (errorMsgEl) {
            errorMsgEl.innerHTML = "■ Authentication error. Please log in again.";
            errorMsgEl.style.display = 'block';
        }
        return;
    }

    // -- PROFILBILDS-KOLL --
    const currentAvatarSrc = document.querySelector('.current-profile-pic')?.src || "";
    const defaultAvatarUrl = "https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a43d799e6705e122388ffdc_ppic0.svg";
    if (currentAvatarSrc.includes("ppic0.svg") || currentAvatarSrc === defaultAvatarUrl || currentAvatarSrc === "") {
        errors.push("Please select a profile picture");
    }

    let rawName = (createUsernameInput.textContent || "").replace(/\u00A0/g, ' ').trim();
    if (rawName === createDefaultPlaceholder) rawName = "";
    
    // -- KÖR DELAD VALIDERING --
    errors = errors.concat(validateUsernameRules(rawName));

    // -- VISA FELMEDDELANDEN (client-side instant feedback) --
    if (errors.length > 0) {
       if (errorMsgEl) {
         errorMsgEl.innerHTML = "■ " + errors.join("<br>■ ");
         errorMsgEl.style.display = 'block';
       }
       return; 
    }

    // -- ALLT GODKÄNT - SPARA (server-side via Cloud Function) --
    try {
      createProfileSubmitBtn.textContent = "Saving...";
      createProfileSubmitBtn.style.pointerEvents = 'none';

      const result = await completeProfileFn({
        username: rawName,
        profilePicUrl: currentAvatarSrc
      });

      setTimeout(() => {
        createProfileSubmitBtn.textContent = "Create";
        createProfileSubmitBtn.style.pointerEvents = 'auto';
        const savedName = result.data.username;
        const uiNameElements = document.querySelectorAll('.player-info.username');
        uiNameElements.forEach(el => el.textContent = savedName);
        if (typeof userDisplayName !== 'undefined' && userDisplayName) userDisplayName.textContent = savedName;
        if (typeof hideCreateProfile === 'function') hideCreateProfile();
        if (typeof resolvePendingAction === 'function') resolvePendingAction();
      }, 700);

    } catch (error) {
      console.error("Gick inte att spara profilen:", error.message);
      if (errorMsgEl) {
         errorMsgEl.innerHTML = "■ " + (error.message || "Database error. Please try again.");
         errorMsgEl.style.display = 'block';
      }
      createProfileSubmitBtn.textContent = "Create";
      createProfileSubmitBtn.style.pointerEvents = 'auto';
    }
  });
}

// ==========================================
// ── 3. CHANGE USERNAME LOGIC ──
// ==========================================
const changeProfileSubmitBtn = document.getElementById('cp-change-btn'); 
const changeUsernameInput = document.getElementById('change-username-input'); 
// Ensure changeUsernameInput exists and is focusable if needed
if (changeUsernameInput) {
  if (!changeUsernameInput.hasAttribute('tabindex')) {
    changeUsernameInput.setAttribute('tabindex', '0');
  }

  const chUserFirstInteraction = (e) => {
    // If the field is locked (contenteditable false) or explicitly flagged as locked, do nothing.
    if (changeUsernameInput.getAttribute('contenteditable') === 'false' || changeUsernameInput.dataset.locked === 'true') return;
    // If already focused, nothing to do
    if (document.activeElement === changeUsernameInput) return;
    // Otherwise focus & place caret
    focusContentEditableAtEnd(changeUsernameInput);
  };

  changeUsernameInput.addEventListener('touchstart', chUserFirstInteraction, { passive: true });
  changeUsernameInput.addEventListener('mousedown', chUserFirstInteraction);
  changeUsernameInput.addEventListener('click', (e) => {
    if (changeUsernameInput.getAttribute('contenteditable') === 'false' || changeUsernameInput.dataset.locked === 'true') return;
    if (document.activeElement !== changeUsernameInput) focusContentEditableAtEnd(changeUsernameInput);
  });
}

const changeErrorMsgEl = document.getElementById('cp-error-msg-change');
const changeInfoText = document.getElementById('cp-change-info'); 
const changeDefaultPlaceholder = "New username";

function lockOutNameChangeUI() {
    if (changeUsernameInput) {
        // Make non-editable and non-interactive
        changeUsernameInput.setAttribute('contenteditable', 'false');
        changeUsernameInput.style.pointerEvents = 'none';
        changeUsernameInput.textContent = changeDefaultPlaceholder;
        changeUsernameInput.style.color = "rgba(255, 255, 255, 0.35)";

        // Ensure it cannot be focused (remove tabindex), blur if focused,
        // and mark it so handlers can quickly short-circuit.
        try {
          changeUsernameInput.blur();
        } catch (err) { /* ignore */ }
        changeUsernameInput.removeAttribute('tabindex');
        changeUsernameInput.dataset.locked = 'true';
    }
    if (changeInfoText) {
        changeInfoText.textContent = "Username already changed once, sorry!";
    }
    if (changeProfileSubmitBtn) {
        changeProfileSubmitBtn.textContent = "Change";
        changeProfileSubmitBtn.classList.remove('is-active');
        changeProfileSubmitBtn.style.pointerEvents = 'none';
    }
}

if (changeProfileSubmitBtn && changeUsernameInput) {
  
  // 1. Koppla fältet till vår nya gemensamma funktion (samma som för Create!)
  setupUsernameInput(changeUsernameInput, changeProfileSubmitBtn, changeDefaultPlaceholder);

  // 2. Klick på Change
  changeProfileSubmitBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (changeErrorMsgEl) {
        changeErrorMsgEl.style.display = 'none';
        changeErrorMsgEl.innerHTML = "";
    }

    let rawName = (changeUsernameInput.textContent || "").replace(/\u00A0/g, ' ').trim();
    if (rawName === changeDefaultPlaceholder) rawName = "";
    
    // -- KÖR DELAD VALIDERING (client-side instant feedback) --
    let errors = validateUsernameRules(rawName);

    // -- VISA FELMEDDELANDEN --
    if (errors.length > 0) {
       if (changeErrorMsgEl) {
         changeErrorMsgEl.innerHTML = "■ " + errors.join("<br>■ ");
         changeErrorMsgEl.style.display = 'block';
       }
       return; 
    }

    // -- ALLT GODKÄNT - SPARA (server-side via Cloud Function) --
    try {
      changeProfileSubmitBtn.textContent = "Saving...";
      changeProfileSubmitBtn.style.pointerEvents = 'none';

      const result = await changeUsernameFn({ username: rawName });

      lockOutNameChangeUI();

      setTimeout(() => {
        const changeModal = document.querySelector('.change-username');
        if (changeModal) {
            changeModal.style.transition = 'opacity 200ms ease';
            changeModal.style.opacity = '0';
            setTimeout(() => {
                changeModal.style.display = 'none';
            }, 200);
        }
        const savedName = result.data.username;
        const uiNameElements = document.querySelectorAll('.player-info.username');
        uiNameElements.forEach(el => el.textContent = savedName);
        if (typeof userDisplayName !== 'undefined' && userDisplayName) userDisplayName.textContent = savedName;
      }, 1000);

    } catch (error) {
      console.error("Gick inte att spara nya namnet:", error.message);
      if (changeErrorMsgEl) {
         changeErrorMsgEl.innerHTML = "■ " + (error.message || "Database error. Please try again.");
         changeErrorMsgEl.style.display = 'block';
      }
      changeProfileSubmitBtn.textContent = "Change";
      changeProfileSubmitBtn.style.pointerEvents = 'auto';
    }
  });
}

// ── GAME SESSION: START + GRADE ─────────────────────────────────
let currentGameSessionId = null;

(function initGameSession() {
  const gameMatch = currentSlug.match(/^([a-z]+)-game-(\d+)$/);
  if (!gameMatch) return; // not a game page

  const topic = gameMatch[1];
  const level = parseInt(gameMatch[2], 10);

  // If the start page already created the session, use it (one-time)
  const persistedSession = sessionStorage.getItem('currentGameSessionId');
  if (persistedSession) {
    currentGameSessionId = persistedSession;
    sessionStorage.removeItem('currentGameSessionId'); // optional: don't reuse it later
    console.log("Using sessionId from start button:", currentGameSessionId);
    return;
  }

  // Fallback: original behavior — start session once auth is available
  const tryStart = async () => {
    if (!currentUser) {
      setTimeout(tryStart, 200);
      return;
    }
    try {
      const result = await startGameFn({ topic, level });
      currentGameSessionId = result.data.sessionId;
      console.log("Game session started:", currentGameSessionId);
    } catch (err) {
      console.error("Failed to start game session:", err.message);
    }
  };
  tryStart();
})();

// runOnReady helper (define once in the file; omit if already present)
function runOnReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

runOnReady(() => {
// Attach start-button behavior for any .game-start-btn on the page
const startButtons = document.querySelectorAll('.game-start-btn');
if (!startButtons || startButtons.length === 0) return;

startButtons.forEach(startBtn => {
  let startInProgress = false;

  startBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (startInProgress) return;
    startInProgress = true;
    startBtn.style.pointerEvents = 'none';

    // Derive topic+level: prefer explicit data attrs, then level selector, then href, then page slug, then fallback level=1
    let topic = startBtn.dataset.topic || null;
    let level = startBtn.dataset.level ? parseInt(startBtn.dataset.level, 10) : null;

    // 1) If there's a level control on the page, prefer that value (useful for a dropdown)
    if ((!level || isNaN(level)) && typeof document !== 'undefined') {
      const levelEl = document.getElementById('start-level');
      if (levelEl) {
        const lv = parseInt(levelEl.value, 10);
        if (!isNaN(lv)) level = lv;
      }
    }

    // 2) Try to parse the button href (e.g. /gma-game-1)
    if (!topic || !level) {
      const href = startBtn.getAttribute('href') || startBtn.dataset.href || window.location.pathname;
      const match = (href || '').match(/\/?([a-z]+)-game-(\d+)/i);
      if (match) {
        topic = topic || match[1].toLowerCase();
        level = level || parseInt(match[2], 10);
      }
    }

    // 3) Fallback: derive topic from the page slug (e.g. gma-start)
    if (!topic && typeof currentSlug !== 'undefined') {
      const pageMatch = currentSlug.match(/^([a-z]+)-start$/);
      if (pageMatch) topic = pageMatch[1];
    }

    // 4) Final fallback: default level = 1
    if (!level || isNaN(level)) level = 1;

    try {
      const result = await startGameFn({ topic, level });
      const sessionId = result?.data?.sessionId;
      if (sessionId) {
        sessionStorage.setItem('currentGameSessionId', sessionId);
      }

      // record where we came from so routeGuard accepts the navigation
      sessionStorage.setItem('navFrom', `${topic}-start`);

      const targetHref = startBtn.getAttribute('href') || `/${topic}-game-${level}`;
      setTimeout(() => window.location.href = targetHref, 150);
    } catch (err) {
      console.error("Failed to start game session:", err?.message || err);
      startBtn.style.pointerEvents = 'auto';
      startInProgress = false;
    }
  }, { passive: false });
});
// ── ADD PAGESHOW LISTENER HERE -- start btn works when go back  ─────────────────────────────────
  window.addEventListener('pageshow', () => {
    // Re-enable pointer events on all start buttons if restored from cache/back-button
    startButtons.forEach(startBtn => {
      startBtn.style.pointerEvents = 'auto';
    });

    // Clear lingering session data from the previous/aborted run
    sessionStorage.removeItem('currentGameSessionId');
  });
});

// Wire up visual level rows inside a dropdown so clicking a row sets the start button level/href
runOnReady(() => {
  // container selector for your start-page dropdown
  const dropdownContainers = document.querySelectorAll('.dropdown-gamelevel');
  if (!dropdownContainers || dropdownContainers.length === 0) return;

  dropdownContainers.forEach(container => {
    // find the Start button on the page (first match)
    const startBtn = document.querySelector('.game-start-btn');
    if (!startBtn) return;

    // find all level rows inside this container (supports <a>, <div>, etc.)
    const levelRows = container.querySelectorAll('.game-level');
    if (!levelRows || levelRows.length === 0) return;

    levelRows.forEach(row => {
      row.addEventListener('click', (e) => {
        e.preventDefault(); // we handle navigation via the Start button

        // Read attributes from the clicked row
        const levelAttr = row.dataset.level;
        const hrefAttr = row.dataset.href || row.getAttribute('href') || null;

        // Normalize level
        const level = levelAttr ? parseInt(levelAttr, 10) : (hrefAttr ? (hrefAttr.match(/-game-(\d+)/i) || [])[1] : null);

        // If we have a level, set it on the Start button dataset (so start handler uses it)
        if (level && !isNaN(level)) {
          startBtn.dataset.level = String(level);
        } else {
          // remove dataset if invalid
          delete startBtn.dataset.level;
        }

        // If row provided an explicit href, set it on the Start button.
        // Otherwise try to infer from page slug (topic-start -> topic)
        if (hrefAttr) {
          startBtn.setAttribute('href', hrefAttr);
        } else if (level && !isNaN(level)) {
          // attempt to infer topic from page path or currentSlug
          const topicMatch = (window.location.pathname || '').match(/\/?([a-z]+)-start/i) || (typeof currentSlug !== 'undefined' && currentSlug.match(/^([a-z]+)-start$/));
          const topic = (topicMatch && topicMatch[1]) ? topicMatch[1] : null;
          if (topic) startBtn.setAttribute('href', `/${topic}-game-${level}`);
        }

        // Visual selection: mark this row as selected
        levelRows.forEach(r => r.classList.remove('is-selected'));
        row.classList.add('is-selected');

        // Optional: if you want the start button to auto-navigate immediately when selecting a row,
        // you can trigger startBtn.click() here (uncomment to enable).
        // startBtn.click();
      }, { passive: false });
    });
  });
});


function setupGameFinishListener() {
  const finishBtn = document.getElementById('finish-btn');
  if (!finishBtn) return;

  // <-- ADDED 1: Declare the flag outside the click event
  let gameSubmitInProgress = false; 

  finishBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    

    // <-- ADDED 2: Hard stop if a submission is already running, otherwise lock it
    if (gameSubmitInProgress) return; 
    gameSubmitInProgress = true;      

    if (!currentGameSessionId) {
      console.error("No active game session — cannot submit.");
      // <-- ADDED 3: Unlock the flag if we fail early
      gameSubmitInProgress = false; 
      return;
    }

    const gameMatch = currentSlug.match(/^([a-z]+)-game-(\d+)$/);
    if (!gameMatch) {
      gameSubmitInProgress = false; // (Bonus protection if slug fails)
      return;
    }
    
    const topic = gameMatch[1];
    const level = parseInt(gameMatch[2], 10);

    // Collect answers from every question block on the page
    const questionWrappers = document.querySelectorAll('[data-question-id]');
    const answers = Array.from(questionWrappers).map((wrapper) => {
      const questionId = wrapper.getAttribute('data-question-id');
      const activeRow = wrapper.querySelector('.alternative-row .checkbox.is-active')?.closest('[data-choice]');
      // FIX: Konvertera strängen från HTML till en riktig siffra med Number()
      const choice = activeRow ? Number(activeRow.getAttribute('data-choice')) : null;
      return { questionId, choice };
    });
    console.log("DEBUG - Mina svar:", answers);

    const finishText1 = finishBtn.querySelector('.finish-btn-text1');
    const finishText2 = finishBtn.querySelector('.finish-btn-text2');

    finishBtn.style.pointerEvents = 'none';
    if (finishText1 && finishText2) {
      finishText1.style.display = 'none';
      finishText2.style.display = 'flex';
    }

    try {
      const result = await gradeGameFn({
        topic,
        level,
        answers,
        sessionId: currentGameSessionId,
      });
      sessionStorage.setItem('lastGameResult', JSON.stringify(result.data));
      sessionStorage.setItem('scoreAuthorized', 'true');

      const scoreHref = finishBtn.getAttribute('href') || '/score';
      if (typeof window.triggerPageExit === 'function') {
        window.triggerPageExit(scoreHref, true, true);
      } else {
        window.location.href = scoreHref;
      }

    } catch (err) {
      console.error("Gick inte att skicka in spelet:", err.message);
      finishBtn.style.pointerEvents = 'auto';
      if (finishText1 && finishText2) {
        finishText1.style.display = 'flex';
        finishText2.style.display = 'none';
      }
      gameSubmitInProgress = false; 
    }
  });
}


setupGameFinishListener();

// ── GAME-START INFO PANEL ──────────────────────────────────────
(function initGameInfoPanel() {
  const gameMatch = currentSlug.match(/^([a-z]+)-start$/);
  if (!gameMatch) return; // not a start page

  const topic = gameMatch[1];
  // NOTE: level isn't in the slug on start pages — assumes level 1 for now.
  // If start pages later support multiple levels via a dropdown, this needs
  // to read the selected level instead of hardcoding it.
  const level = 1;
  const gameId = `${topic}-l${level}`;

  const tryLoad = async () => {
    if (!currentUser) {
      setTimeout(tryLoad, 200);
      return;
    }
    try {
      const attemptRef = doc(db, "users", currentUser.uid, "attempts", gameId);
      const attemptSnap = await getDoc(attemptRef);
      const preAttempts = attemptSnap.exists() ? attemptSnap.data().attemptCount || 0 : 0;
      const highscore = attemptSnap.exists() ? attemptSnap.data().bestScore || 0 : 0;

      const preAttemptsEl = document.getElementById('pre-attempts');
      if (preAttemptsEl) preAttemptsEl.textContent = preAttempts;
      const highscoreEl = document.getElementById('highscore');
      if (highscoreEl) highscoreEl.textContent = highscore;
    } catch (err) {
      console.error("Failed to load attempt data:", err.message);
    }

    try {
      const getGameInfoFn = httpsCallable(functions, "getGameInfo");
      const result = await getGameInfoFn({ topic, level });
      const lbHighscoreEl = document.getElementById('lb-highscore');
      if (lbHighscoreEl) lbHighscoreEl.textContent = result.data.lbHighscore;
    } catch (err) {
      console.error("Failed to load leaderboard highscore:", err.message);
    }
  };
  tryLoad();
})();