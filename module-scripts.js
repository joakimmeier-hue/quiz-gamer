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
  // ── STATE TRACKERS ──
  window.lobbyInvOpen = false; 
  window.isGameInvAnimating = false;

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

    // --- NY BRILJANT SPÄRR: Kolla om någon modal/overlay ligger i vägen ---
    const blockingSelectors = [
        '.login-modal-wrapper', 
        '.create-profile', 
        '.change-username', 
        '.intro-overlay-grp'
    ];

    let isModalVisible = false;
    for (let selector of blockingSelectors) {
        const el = document.querySelector(selector);
        // Kollar om elementet finns och INTE har display: none
        if (el && window.getComputedStyle(el).display !== 'none') {
            isModalVisible = true;
            break; 
        }
    }

    // Om någon av rutorna är synliga, avbryt inventory-scriptet!
    // (ESC-knappen kommer då hanteras av dina modal-scripts istället)
    if (isModalVisible) {
        return; 
    }

    // De här variablerna används av all logik under dem!
    const key = e.key.toLowerCase();
    const isGameSide = document.body.dataset.page === 'game';

    // --- Inventory på GAME-SIDAN: DOM är Single Source of Truth ---
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
                setTimeout(() => {
                    window.isGameInvAnimating = false;
                }, 150);
            };

            if (key === 'escape') {
                if (isOpen) {
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    triggerClick(crossBtn); 
                }
                // Om inventoryt redan var stängt, gör return inget. 
                // ESC skickas vidare till spelet/knappar under!
                return; 
            } 
            else if (key === 'i' || key === 'tab') {
                e.preventDefault(); 
                
                if (isOpen) {
                    triggerClick(crossBtn);
                } else {
                    triggerClick(arrowBtn);
                }
            }
        }
    }
    
    // --- LOBBY-SIDAN (inkl. UC) ---
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
        
        // Hantera ESC (Enbart stäng). Den kraschande loginModal-koden är nu helt borta!
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
                    changeProfileSubmitBtn.style.opacity = '0.26';
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

  // ── FIREBASE AUTH OBSERVER ──
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUI(user);
    if (user) {
      loadUserData(user.uid);
    }
  });

// CREATE PROFILE
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

// -- 3. FYSISK SPÄRR CREATE (15 tecken, Enter, och Mellanslag) --
  createUsernameInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'];
    const currentText = createUsernameInput.textContent || "";
    const selection = window.getSelection().toString(); 
    
    if (e.key === 'Enter') { e.preventDefault(); return; }

    // BOMBSÄKER MELLANSLAGS-SPÄRR
    if (e.key === ' ') {
      // Förbjud mellanslag i början
      if (currentText.length === 0) { e.preventDefault(); return; }
      // Förbjud fler än 1 mellanslag totalt (såvida man inte har markerat text för att skriva över)
      if ((currentText.includes(' ') || currentText.includes('\u00A0')) && selection.length === 0) {
        e.preventDefault(); 
        return;
      }
    }
    
    if (currentText.length >= 15 && selection.length === 0 && !allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
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
    // -- PROFILBILDS-KOLL --
    const currentAvatarSrc = document.querySelector('.current-profile-pic')?.src || "";
    const defaultAvatarUrl = "https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a43d799e6705e122388ffdc_ppic0.svg";
    
    // Kollar om bilden fortfarande är default
    if (currentAvatarSrc.includes("ppic0.svg") || currentAvatarSrc === defaultAvatarUrl || currentAvatarSrc === "") {
        errors.push("Please select a profile picture");
    }
   // Byt ut non-breaking spaces mot vanliga mellanslag innan vi kollar längd och tecken
    let rawName = (createUsernameInput.textContent || "").replace(/\u00A0/g, ' ').trim();
    if (rawName === defaultPlaceholder) {
    rawName = "";
    }     
// -- VALIDERINGS-REGLER --
    if (rawName.length < 3) {
      errors.push("Minimum 3 characters");
    } else if (rawName.length > 15) {
      errors.push("Maximum 15 characters");
    }

    // 1. Kolla om de skrivit mer än ETT mellanslag
    const spaceCount = (rawName.match(/ /g) || []).length;
    if (spaceCount > 1) {
      errors.push("Only one space allowed");
    }

    // 2. Kolla efter förbjudna tecken (Regex kollar nu om det finns NÅGOT tecken som INTE är tillåtet)
    const invalidCharRegex = /[^a-zA-Z0-9åäöÅÄÖ\-_ ]/; 
    if (rawName.length > 0 && invalidCharRegex.test(rawName)) {
      errors.push("Ops, invalid character");
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
      // Ändra texten till Saving och frys knappen
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

      console.log("Profilen sparades i Firestore!");
      
      // -- TIMEOUT: Vänta 500ms innan vi går vidare --
      setTimeout(() => {
        
        // 1. Återställ knappen i bakgrunden
        createProfileSubmitBtn.textContent = "Create";
        createProfileSubmitBtn.style.pointerEvents = 'auto';

        // 2. UPPDATERA NAMNET DIREKT I UI:t (Lobby/Inventory)
        // Vi letar upp alla element med klassen .player-info.username och trycker in det nya namnet
        const uiNameElements = document.querySelectorAll('.player-info.username');
        uiNameElements.forEach(el => {
            el.textContent = rawName;
        });

        // (Säkerhetsåtgärd ifall du använder variabeln userDisplayName någon annanstans)
        if (typeof userDisplayName !== 'undefined' && userDisplayName) {
            userDisplayName.textContent = rawName;
        }

        // 3. Stäng Create-rutan och verkställ det användaren ville göra (t.ex. öppna Inventory)
        if (typeof hideCreateProfile === 'function') hideCreateProfile();
        if (typeof resolvePendingAction === 'function') resolvePendingAction(); 

      }, 700); // 700 millisekunder

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
// Blockera globala spelevents när change username är öppen
window.addEventListener('keydown', (e) => {
    const changeModal = document.querySelector('.change-username');
    
    // Om rutan är öppen (display: flex)
    if (changeModal && changeModal.style.display === 'flex') {
        const gameKeys = ['i', 'I', 'Escape', 'Tab', 'Enter', ' '];
        
        // Fånga upp tangenten och stoppa den från att nå spelets inventory etc.
        if (gameKeys.includes(e.key)) {
            e.stopPropagation(); 
            
            // --- LÅT ESCAPE STÄNGA MODALEN ---
            if (e.key === 'Escape') {
                e.preventDefault();
                changeModal.style.transition = 'opacity 200ms ease';
                changeModal.style.opacity = '0';
                
                setTimeout(() => {
                    changeModal.style.display = 'none';
                    
                    // Återställ fältet när de backar ur
                    const changeUsernameInput = document.getElementById('change-username-input');
                    const changeProfileSubmitBtn = document.getElementById('cp-change-btn');
                    const changeErrorMsgEl = document.getElementById('cp-error-msg-change');
                    
                    if (changeUsernameInput && changeUsernameInput.getAttribute('contenteditable') !== 'false') {
                        changeUsernameInput.textContent = "New username"; // Återställ placeholder
                        changeUsernameInput.style.color = "rgba(255, 255, 255, 0.35)";
                        
                        if (changeProfileSubmitBtn) {
                            changeProfileSubmitBtn.style.opacity = '0.26';
                            changeProfileSubmitBtn.style.pointerEvents = 'none';
                        }
                        if (changeErrorMsgEl) {
                            changeErrorMsgEl.style.display = 'none';
                            changeErrorMsgEl.innerHTML = "";
                        }
                    }
                }, 200);
                return; // Avbryt vidare kod
            }

            // Vi tillåter Spacebar och Enter att fungera normalt INUTI textfältet 
            // men för 'i' och 'Tab' blockerar vi standardbeteendet
            if (e.key !== ' ' && e.key !== 'Enter') {
                e.preventDefault();
            }
        }
    }
}, true); // "true" betyder capture phase = vi fångar klicket INNAN spelet hinner se det!

// ==========================================
// ── CHANGE USERNAME LOGIC ──
// ==========================================
const changeProfileSubmitBtn = document.getElementById('cp-change-btn'); 
const changeUsernameInput = document.getElementById('change-username-input'); 
const changeErrorMsgEl = document.getElementById('cp-error-msg-change');
const changeInfoText = document.getElementById('cp-change-info'); // FIXED ID
const changeDefaultPlaceholder = "New username";

// Hjälpfunktion för att låsa rutan permanent (Point 3 & 4)
function lockOutNameChangeUI() {
    if (changeUsernameInput) {
        changeUsernameInput.setAttribute('contenteditable', 'false');
        changeUsernameInput.style.pointerEvents = 'none';
        changeUsernameInput.textContent = changeDefaultPlaceholder; // Keep grey placeholder
        changeUsernameInput.style.color = "rgba(255, 255, 255, 0.35)"; 
    }
    if (changeInfoText) {
        changeInfoText.textContent = "Username already changed once, sorry!"; // Point 5 fixed
    }
    if (changeProfileSubmitBtn) {
        changeProfileSubmitBtn.textContent = "Change"; // <-- NY RAD: Återställer texten, "Change" i bakgrunden
        changeProfileSubmitBtn.style.opacity = '0.26'; // Keep it greyed out instead of hiding
        changeProfileSubmitBtn.style.pointerEvents = 'none';
    }
}

if (changeProfileSubmitBtn && changeUsernameInput) {
  const changeDefaultPlaceholder = "New username";

  // -- 0. SÄTT START-UTSEENDE --
  if (changeUsernameInput.textContent.trim() === changeDefaultPlaceholder || changeUsernameInput.textContent.trim() === "") {
    changeUsernameInput.textContent = changeDefaultPlaceholder;
    changeUsernameInput.style.color = "rgba(255, 255, 255, 0.35)"; 
  }

  // -- 1. PLACEHOLDER (Fokus) --
  changeUsernameInput.addEventListener('focus', () => {
    if (changeUsernameInput.textContent.trim() === changeDefaultPlaceholder) {
      changeUsernameInput.textContent = "";
    }
    changeUsernameInput.style.color = "rgba(255, 255, 255, 1)";
  });

  // -- 2. PLACEHOLDER (Blur) --
  changeUsernameInput.addEventListener('blur', () => {
    changeUsernameInput.textContent = changeUsernameInput.textContent.trim();
    if (changeUsernameInput.textContent === "") {
      changeUsernameInput.textContent = changeDefaultPlaceholder;
      changeUsernameInput.style.color = "rgba(255, 255, 255, 0.35)";
    }
  });

// -- 3. FYSISK SPÄRR CHANGE (15 tecken, Enter, och Mellanslag) --
  changeUsernameInput.addEventListener('keydown', (e) => { // <-- VIKTIGT! Rätt variabel här nu.
    e.stopPropagation();
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'];
    const currentText = changeUsernameInput.textContent || ""; // <-- Rätt variabel här
    const selection = window.getSelection().toString(); 
    
    if (e.key === 'Enter') { e.preventDefault(); return; }

    // BOMBSÄKER MELLANSLAGS-SPÄRR
    if (e.key === ' ') {
      if (currentText.length === 0) { e.preventDefault(); return; }
      if ((currentText.includes(' ') || currentText.includes('\u00A0')) && selection.length === 0) {
        e.preventDefault(); 
        return;
      }
    }
    if (currentText.length >= 15 && selection.length === 0 && !allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); 
    }
  });
    // -- 4. VÄCK KNAPPEN --
  changeUsernameInput.addEventListener('input', () => {
    const rawText = changeUsernameInput.textContent || "";
    if (rawText.trim().length > 0 && rawText.trim() !== changeDefaultPlaceholder) {
      changeProfileSubmitBtn.style.opacity = '1';
      changeProfileSubmitBtn.style.pointerEvents = 'auto';
    } else {
      changeProfileSubmitBtn.style.opacity = '0.26';
      changeProfileSubmitBtn.style.pointerEvents = 'none';
    }
  });

  // -- 5. SPARA NYTT NAMN TILL FIRESTORE --
  changeProfileSubmitBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (changeErrorMsgEl) {
        changeErrorMsgEl.style.display = 'none';
        changeErrorMsgEl.innerHTML = "";
    }
    let errors = [];

    // Byt ut non-breaking spaces mot vanliga mellanslag innan vi kollar längd och tecken
    let rawName = (changeUsernameInput.textContent || "").replace(/\u00A0/g, ' ').trim();
    if (rawName === changeDefaultPlaceholder) rawName = "";
    
// -- VALIDERINGS-REGLER --
    if (rawName.length < 3) {
      errors.push("Minimum 3 characters");
    } else if (rawName.length > 15) {
      errors.push("Maximum 15 characters");
    }

    // 1. Kolla om de skrivit mer än ETT mellanslag
    const spaceCount = (rawName.match(/ /g) || []).length;
    if (spaceCount > 1) {
      errors.push("Only one space allowed");
    }

    // 2. Kolla efter förbjudna tecken (Regex kollar nu om det finns NÅGOT tecken som INTE är tillåtet)
    const invalidCharRegex = /[^a-zA-Z0-9åäöÅÄÖ\-_ ]/; 
    if (rawName.length > 0 && invalidCharRegex.test(rawName)) {
      errors.push("Ops, invalid character");
    }

    // -- DATABAS-KOLL FÖR UNIKT NAMN --
    if (errors.length === 0) {
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
         
         if (nameTaken) errors.push("Sorry, username in use");
       } catch (err) {
         console.error("Fel vid kontroll av unikt namn:", err);
       }
    }

    // -- VISA FELMEDDELANDEN --
    if (errors.length > 0) {
       if (changeErrorMsgEl) {
         changeErrorMsgEl.innerHTML = "■ " + errors.join("<br>■ ");
         changeErrorMsgEl.style.display = 'block';
       }
       return; 
    }

    // -- ALLT GODKÄNT - SPARA TILL FIRESTORE --
    try {
      changeProfileSubmitBtn.textContent = "Saving..."; 
      changeProfileSubmitBtn.style.pointerEvents = 'none';

      const userDocRef = doc(db, "users", currentUser.uid);
      await setDoc(userDocRef, { 
        username: rawName,
        hasChangedUsername: true, // <-- SPÄRREN SPARAS I DATABASEN!
        updatedAt: new Date()
      }, { merge: true });

      // Spara lyckades. Lås rutan för alltid direkt i gränssnittet.
      lockOutNameChangeUI();

      // -- EFTER 1 SEKUND: Stäng fönstret --
      setTimeout(() => {
        const changeModal = document.querySelector('.change-username');
        if (changeModal) {
            changeModal.style.transition = 'opacity 200ms ease';
            changeModal.style.opacity = '0';
            setTimeout(() => {
                changeModal.style.display = 'none';
            }, 200);
        }

        // Uppdatera namnet överallt på skärmen
        const uiNameElements = document.querySelectorAll('.player-info.username');
        uiNameElements.forEach(el => {
            el.textContent = rawName;
        });
        if (typeof userDisplayName !== 'undefined' && userDisplayName) {
            userDisplayName.textContent = rawName;
        }

      }, 1000); // 1 sekund

    } catch (error) {
      console.error("Gick inte att spara nya namnet:", error.message);
      if (changeErrorMsgEl) {
         changeErrorMsgEl.innerHTML = "■ Database error. Please try again.";
         changeErrorMsgEl.style.display = 'block';
      }
      changeProfileSubmitBtn.textContent = "Change";
      changeProfileSubmitBtn.style.pointerEvents = 'auto';
    }
  });
}
