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
  // ── STATE TRACKERS ──
  window.gameInvOpen = false;  
  window.lobbyInvOpen = false; 
  window.lobbyReady = false; // NYTT: Håller inventory låst under introt
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
    const cpModal = document.getElementById('create-profile'); // Hindra i och tab under cp.  din huvud-div här
    // Om create profile-rutan är synlig (inte har display: none), avbryt knapptrycket:
    if (cpModal && getComputedStyle(cpModal).display !== 'none') {
    return; 
}
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
          if (!window.lobbyReady) return; // NYTT: Avbryt om introt fortfarande körs
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

    // NYTT: Starta 4-sekunders upplåsning när man klickar på introt
    const welcomeScreen = e.target.closest('.welcome-text-container');
    if (welcomeScreen && !window.lobbyReady) {
        setTimeout(() => {
            window.lobbyReady = true;
            console.log("Lobby är nu redo! Inventory upplåst.");
        }, 4000); // 4000 millisekunder = 4 sekunder
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
 if (option) {        
     const selectedSrc = option.src;
     const currentAvatars = document.querySelectorAll('.current-profile-pic');
     
     if (selectedSrc && currentAvatars.length > 0) {
         // Uppdatera ALLA profilbilder i UI direkt (Lobby, dropdown, etc.)
         currentAvatars.forEach(img => {
             img.src = selectedSrc;
         }); 
         
         // Spara valet till Firestore
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

      if (!window.lobbyReady) return; // NYTT: Avbryt musklicket om introt körs
      
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
           // Användaren har valt och sparat en bild tidigare
           currentAvatars.forEach(img => img.src = data.profilePicUrl);
         } else {
           // Dokumentet finns men fältet saknas -> Fallback till "?"
           currentAvatars.forEach(img => img.src = defaultAvatar);
         }
       }
       
       // Uppdatera resten av UI med sparad data
       if (userLevelEl) userLevelEl.textContent = "Level " + (data.level || 1);
       if (userScoreEl) userScoreEl.textContent = (data.totalScore || 0);
       if (userRankEl) userRankEl.textContent = (data.rank || 0);
       if (userDisplayName) userDisplayName.textContent = data.username || "Player";

     } else {
      // 2. HELT NY SPELARE
      if (currentAvatars.length > 0) {
      currentAvatars.forEach(img => img.src = defaultAvatar);
      }
      
      if (userLevelEl) userLevelEl.textContent = "Level 1";
      if (userScoreEl) userScoreEl.textContent = "0";
      if (userRankEl) userRankEl.textContent = "0";
      
      // HÄR ÄNDRAR VI: Använd inte Googles display name längre, dölj det tills profilen är klar
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

  // ── FIREBASE AUTH OBSERVER ──
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUI(user);
    if (user) {
      loadUserData(user.uid);
    }
  });

// Hämta elementen
const createProfileSubmitBtn = document.getElementById('cp-create-btn'); 
const createUsernameInput = document.getElementById('cp-username-input'); 
const errorMsgEl = document.getElementById('cp-error-msg');

if (createProfileSubmitBtn && createUsernameInput) {
  
  const defaultPlaceholder = "Mr Smart";

  // -- 0. SÄTT START-UTSEENDE (När sidan laddas) --
  if (createUsernameInput.textContent.trim() === defaultPlaceholder || createUsernameInput.textContent.trim() === "") {
    createUsernameInput.textContent = defaultPlaceholder;
    createUsernameInput.style.color = "rgba(255, 255, 255, 0.35)"; // 35% Alpha
  }

  // -- 1. PLACEHOLDER-LOGIK (Fokus) --
  createUsernameInput.addEventListener('focus', () => {
    if (createUsernameInput.textContent.trim() === defaultPlaceholder) {
      createUsernameInput.textContent = "";
    }
    createUsernameInput.style.color = "rgba(255, 255, 255, 1)"; // 100% Alpha när man klickar i rutan
  });

  // -- 2. PLACEHOLDER-LOGIK (Blur / Klick utanför) --
  createUsernameInput.addEventListener('blur', () => {
    // Rensa automatiskt bort mellanslag på slutet om de lämnat ett
    createUsernameInput.textContent = createUsernameInput.textContent.trim();

    if (createUsernameInput.textContent === "") {
      createUsernameInput.textContent = defaultPlaceholder;
      createUsernameInput.style.color = "rgba(255, 255, 255, 0.35)"; // Tillbaka till 35% Alpha
    }
  });

  // -- 3. FYSISK SPÄRR (15 tecken, Enter, och Mellanslag) --
  createUsernameInput.addEventListener('keydown', (e) => {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'];
    const currentText = createUsernameInput.textContent || "";
  
    // 1. Stoppa Enter-knappen
    if (e.key === 'Enter') {
      e.preventDefault();
      return;
    }

    // 2. Spärra olämpliga mellanslag
    if (e.key === ' ') {
      // Spärra mellanslag som allra första tecken
      if (currentText.length === 0) {
        e.preventDefault();
        return;
      }
      // Spärra dubbla mellanslag (om föregående tecken redan är ett mellanslag)
      if (currentText.endsWith(' ')) {
        e.preventDefault();
        return;
      }
    }
  
    // 3. Stoppa inmatning över 15 tecken
    if (currentText.length >= 15 && !allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); 
    }
  });

  // -- 4. VÄCK KNAPPEN NÄR ANVÄNDAREN SKRIVER --
  createUsernameInput.addEventListener('input', () => {
    const rawText = createUsernameInput.textContent || "";
    
    // Knappen hanterar vi fortfarande med standard-opacity
    if (rawText.trim().length > 0 && rawText.trim() !== defaultPlaceholder) {
      createProfileSubmitBtn.style.opacity = '1';
      createProfileSubmitBtn.style.pointerEvents = 'auto';
    } else {
      createProfileSubmitBtn.style.opacity = '0.26';
      createProfileSubmitBtn.style.pointerEvents = 'none';
    }
  });

  // -- 5. LOGIK VID KLICK PÅ CREATE --
  createProfileSubmitBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Återställ felmeddelanden
    if (errorMsgEl) {
        errorMsgEl.style.display = 'none';
        errorMsgEl.innerHTML = "";
    }
    let errors = [];

    let rawName = (createUsernameInput.textContent || "").trim();
    if (rawName === defaultPlaceholder) rawName = ""; 

    const currentAvatarSrc = document.querySelector('.current-profile-pic')?.src || "";
    
    // -- VALIDERINGS-REGLER --
    if (currentAvatarSrc.includes('ppic0.svg')) {
      errors.push("Please choose a profile picture");
    }

    if (rawName.length < 3) {
      errors.push("Minimum 3 characters");
    } else if (rawName.length > 15) {
      errors.push("Maximum 15 characters");
    }

    const validCharRegex = /^[a-zA-Z0-9åäöÅÄÖ\-_ ]+$/;
    if (rawName.length > 0 && !validCharRegex.test(rawName)) {
      errors.push("Ops, invalid character");
    }

    // Säkerhetskoll för mellanslag (ifall de klistrar in inkorrekt text)
    const spaceCount = (rawName.match(/ /g) || []).length;
    if (spaceCount > 1) {
      errors.push("Only one space allowed");
    }

    // -- DATABAS-KOLL --
    if (errors.length === 0 || (!errors.includes("Minimum 3 characters") && !errors.includes("Maximum 15 characters") && !errors.includes("Ops, invalid character"))) {
       try {
         const usersRef = collection(db, "users");
         const q = query(usersRef, where("username", "==", rawName));
         const querySnapshot = await getDocs(q);
         
         let nameTaken = false;
         querySnapshot.forEach((docSnap) => {
             if (docSnap.id !== currentUser.uid) {
                 nameTaken = true;
             }
         });
         
         if (nameTaken) {
             errors.push("Sorry, username in use");
         }
       } catch (err) {
         console.error("Fel vid kontroll av unikt namn:", err);
       }
    }

    // -- SKRIV UT FELMEDDELANDEN --
    if (errors.length > 0) {
       if (errorMsgEl) {
         errorMsgEl.innerHTML = "■ " + errors.join("<br>■ ");
         errorMsgEl.style.display = 'block';
       }
       return; 
    }

    // -- ALLT GODKÄNT - SPARA --
    try {
      createProfileSubmitBtn.textContent = "Saving..."; 
      createProfileSubmitBtn.style.pointerEvents = 'none';

      const userDocRef = doc(db, "users", currentUser.uid);
      await setDoc(userDocRef, { 
        username: rawName,
        profilePicUrl: currentAvatarSrc,
        level: 1,
        totalScore: 0,
        rank: 0,
        updatedAt: new Date()
      }, { merge: true });

      createProfileSubmitBtn.textContent = "Create";
      if (typeof hideCreateProfile === 'function') hideCreateProfile();
      if (typeof resolvePendingAction === 'function') resolvePendingAction(); 

    } catch (error) {
      console.error("Gick inte att spara profilen:", error.message);
      if (errorMsgEl) {
         errorMsgEl.innerHTML = "■ Database error. Please try again.";
         errorMsgEl.style.display = 'block';
      }
      createProfileSubmitBtn.textContent = "Create";
      createProfileSubmitBtn.style.pointerEvents = 'auto';
    }
  });
}