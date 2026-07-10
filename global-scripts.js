// global-scripts

// --- HINDRA CTRL + SCROLL ZOOM ---
window.addEventListener('wheel', function(e) {
  if (e.ctrlKey) { e.preventDefault(); }
}, { passive: true });
// Auto scroll to top
if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }
window.addEventListener('load', function() {
  window.scrollTo(0, 0);
});
  
// ── LADDA LOTTIE-SPELAREN ─────────────────────────────────────────────
if (!document.querySelector('script[src*="lottie-player"]')) {
    const script = document.createElement('script');
    script.src = "https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js";
    document.head.appendChild(script);
}
// ── KATEGORI / ÄMNES-SYSTEM FÖR MUSIK & FÄRGER ────────────────────────
const TOPICS = {
    gma: { 
        url: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a184d4a7db7a603d72f42db_gma-music.mp3',
        volume: 0.6, 
        startTime: 0,
        fadeColor: '#ffffff'
    },
    cars: { 
        url: '', 
        volume: 0.6, 
        startTime: 0,
        fadeColor: '#000000'
    },
    history: { 
        url: '', 
        volume: 0.6, 
        startTime: 0,
        fadeColor: '#000000'
    },
    uc: { 
        url: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/69b08a22396c27a611026d0c_The%20end%20of%20tyreen%20remix.mp3',
        volume: 0.6, 
        startTime: 19.482,
        fadeColor: '#000000'
    },
    lobby: { 
        url: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/69b08a22396c27a611026d0c_The%20end%20of%20tyreen%20remix.mp3',
        volume: 0.6, 
        startTime: 19.482,
        fadeColor: '#000000'
    }
};
function getTopicFromUrl(url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('gma')) return 'gma';
    if (lowerUrl.includes('cars')) return 'cars';
    if (lowerUrl.includes('history')) return 'history';
    if (lowerUrl.includes('uc')) return 'uc';
    return 'lobby';
}
const currentTopicId = getTopicFromUrl(window.location.pathname);
const currentConfig = TOPICS[currentTopicId];
const audioKey = currentTopicId + 'AudioTime';
// Initiera Audio
const audio = new Audio(currentConfig.url);
window.bgMusic = audio; 
audio.loop = true;
let isMuted = false; 
// ── FADE LOGIK ────────────────────────────────────────────────────────
window.forceAudioUnmute = function() {
    if (isMuted) {
        const toggleBtn = document.getElementById('toggle-audio');
        if (toggleBtn) toggleBtn.click(); 
    }
};
window.fadeOutMusic = function() {
    if (audio && audio.volume > 0 && !isMuted) {
        const startVol = audio.volume;
        const steps = 50; 
        const stepAmount = startVol / steps;
        let fadeOut = setInterval(() => {
            if (audio.volume - stepAmount > 0) { 
                audio.volume -= stepAmount; 
            } else { 
                audio.volume = 0; 
                clearInterval(fadeOut); 
            }
        }, 20);
    }
};
window.startMusic = function(forceInstant = false) {
    if (!audio.paused || !currentConfig.url) return; 
    let playPromise = audio.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            if (forceInstant) {
                audio.volume = currentConfig.volume;
            } else {
                audio.volume = 0; 
                const targetVol = currentConfig.volume;
                const steps = 50; 
                const stepAmount = targetVol / steps;
                
                let fadeIn = setInterval(() => {
                    if (audio.volume + stepAmount < targetVol) { 
                        audio.volume += stepAmount; 
                    } else { 
                        audio.volume = targetVol;
                        clearInterval(fadeIn); 
                    }
                }, 20);
            }
        }).catch(() => {
            console.log("Autoplay blockerat. Väntar på interaktion.");
        });
    }
}
// Rå, central funktion för att tvinga bild och ljud att matcha exakt
function applyMuteState(muted) {
    isMuted = muted;
    const toggleBtn = document.getElementById('toggle-audio');
    if (toggleBtn) {
        if (muted) {
            toggleBtn.classList.add('is-muted');
            
            // Istället för pause(): Vi sätter volymen till extremt lågt (ohörbart),
            // men låter filen fortsätta spela. Då dör aldrig Bluetooth-strömmen!
            audio.volume = 0.001; 
            
        } else {
            toggleBtn.classList.remove('is-muted');
            // Gå tillbaka till standardvolymen för den aktuella kategorin
            audio.volume = (typeof currentConfig !== 'undefined') ? currentConfig.volume : 1;
        }
    }
}
  // ── WEB AUDIO API: 0 MS FÖRDRÖJNING (RAM-BUFFER) ──
const AudioContext = window.AudioContext || window.webkitAudioContext;
// Vi låser sampleRate till 44100 Hz, vilket alla Bluetooth-lurar fixar utan att krascha
const sfxCtx = new AudioContext({
    latencyHint: 'interactive',
    sampleRate: 44100
});
const sfxBuffers = {}; 	
// Mobiler (särskilt iOS) blockerar ljudmotorn tills användaren rör skärmen.
// Det här låser upp ljudmotorn vid allra första klicket/touchen.
['mousedown', 'touchstart', 'keydown'].forEach(event => {
    document.body.addEventListener(event, () => {
        if (sfxCtx.state === 'suspended') sfxCtx.resume();
    }, { once: true });
});
// Funktion för att i bakgrunden hämta och spara ljudet direkt i RAM-minnet
async function preloadBuffer(key, url) {
    try {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        sfxBuffers[key] = await sfxCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.log("Kunde inte buffra SFX:", key);
    }
}
// ── SFX KONFIGURATION ──
const SFX_CONFIG = {
    finish: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a1a2dff7a1f0df596ecc446_bd746b87bc96d389d43e488276181697_finish-magic-1.ogg',
    select: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a1a2dffba03ba59ac3cf57e_fbdab5a348821e99033e07ea1d05fe36_click-btn-select.ogg',
    back: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a1a2dffc231e9d57618b399_5b327d85abc436094132122fc0bebd69_click-btn-back.ogg',
    qalt: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a271ff59049b7423092e9ba_3f976bf8bfbf666c86a9cfa719202484_qalt-pitch_0.ogg',
    qaltminus2: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a271ff562a0882a6b43bf28_020c2575bda5261e434cf42ea90c096b_qalt-pitch_-2.ogg',
    qaltminus4: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a271ff59baf6f8ede5f16a3_a2d58a55af1e1bd75e61bd4389a6b69c_qalt-pitch_-4.ogg',
    qaltminus6: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a271ff53343fdea7fc74a6a_6d490db071d13a9fe04fa162e0c1164b_qalt-pitch_-6.ogg',
    qaltminus8: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a271ff549ae2539a25338ee_5a5a5d3ce12941ad67dae44cfc51ddb2_qalt-pitch_-8.ogg',
    deny: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a1af8aa81c60eedf18e0c0f_a7982f0695a5917df328945f1a32c008_deny.ogg'
};
// ── QALT CYCLE CONFIG ──
let qaltIndex = 0; 
// Här sparar vi *namnet* på egenskapen (key) istället för url:en
const qaltKeys = ['qaltminus8', 'qaltminus6', 'qaltminus4', 'qaltminus2', 'qalt'];
// Sätt igång buffringen för alla ljud i SFX_CONFIG omedelbart
Object.entries(SFX_CONFIG).forEach(([key, url]) => preloadBuffer(key, url));
// ── BLIXTSNABB UPPSPELNING ──
function playSFX(type, vol = 0.9) {
    if (sfxCtx.state === 'suspended') sfxCtx.resume();
    let bufferKey = type;
    // Snurra index för qalt-ljuden
    if (type === 'qalt') {
        bufferKey = qaltKeys[qaltIndex];
        qaltIndex = (qaltIndex + 1) % qaltKeys.length;
    }
    const buffer = sfxBuffers[bufferKey];
    if (buffer) {
        // Ljudet är buffrat och redo. Koppla upp det och skjut ut ljudet på en gång.
        const source = sfxCtx.createBufferSource();
        const gainNode = sfxCtx.createGain();
        
        source.buffer = buffer;
        gainNode.gain.value = vol;
        
        source.connect(gainNode);
        gainNode.connect(sfxCtx.destination);
        
        source.start(0); // 0 ms fördröjning
    } else {
        console.log("Ljudet buffras fortfarande i bakgrunden...");
    }
}
// Spåra exakt när användaren faktiskt trycker på tangentbordet
let lastActualKeyPressTime = 0;
window.addEventListener('keydown', (e) => {
    if (["Enter", "Escape", " "].includes(e.key)) {
        lastActualKeyPressTime = Date.now();
    }
}, true);
function playButtonSoundHandler(e) {
    // Lägg till .profile-pic-option i sökningen här:
    const btn = e.target.closest('[class*="play-sfx-"], .alternative-row, .profile-pic-option');
    
    if (btn) {
        let type;
        // 1. Kolla om det är ett profilbildsalternativ (Ska ALLTID köra 'back'-ljudet)
        if (btn.classList.contains('profile-pic-option')) {
            type = 'back';
        } 
        // 2. Kolla om det är en "alternative-row" (koppla till qalt)
        else if (btn.classList.contains('alternative-row')) {
            type = 'qalt';
        } 
        // 3. Annars, kolla efter din vanliga play-sfx- klass
        else {
            const className = Array.from(btn.classList).find(c => c.startsWith('play-sfx-'));
            if (className) {
                type = className.split('-')[2];
            }
        }
        // 4. Om vi hittade en typ, spela ljudet
        if (type) {
            playSFX(type);
        }
    }
}
// 1. POINTER UP: Spelar ljudet vid release (mouse up / touch-up), inte vid nedtryck.
// Pointer events = mus + touch + penna i ett, ingen separat mobil-hantering behövs.
document.addEventListener('pointerup', playButtonSoundHandler);
// 2. CLICK: Tar BARA hand om tangentbords-klick (fejkade klick från dina script)
document.addEventListener('click', (e) => {
    // Om det är ett ÄKTA musklick, avbryt! Mousedown ovan har redan spelat ljudet.
    if (e.isTrusted) {
        return; 
    }
    // Om det är ett FEJKAT klick, men INGEN har rört en tangent nyligen...
    // Då är det ett spökklick/skip-intro! Avbryt!
    if (!e.isTrusted && (Date.now() - lastActualKeyPressTime > 100)) {
        return; 
    }
    // Om vi nådde hit: Ett script klickade på knappen, OCH du tryckte precis på Enter. Spela ljud!
    playButtonSoundHandler(e);
});
// ── HUVUDFUNKTION FÖR LJUD-INITIALISERING ──────────────────────
function initAudio() {
    const enterBtn  = document.getElementById('enter-btn-lobby');
    const startBtnTopic = document.getElementById('start-btn-' + currentTopicId) || document.getElementById('start-btn-gma');
    const toggleBtn = document.getElementById('toggle-audio');
    
    const fromTopic = sessionStorage.getItem('fromTopic');
    sessionStorage.removeItem('fromTopic');
    const savedTime = sessionStorage.getItem(audioKey);
    const isTopicPage = currentTopicId !== 'lobby';
    // Stenhård återställning av mute-variabeln och ikonen direkt vid laddning
    applyMuteState(false);
    // FIXA HOVER & KLICK-ZONER DIREKT I JS FÖR ATT SLIPPA SLÖHET
    if (toggleBtn) {
     // Säkerställ att ALLA barn till knappen (ikoner/divar) har pointer-events none
        const children = toggleBtn.querySelectorAll('*');
        children.forEach(child => child.style.pointerEvents = 'none');
    }
    // TIDSHANTERING VID VANLIG PAGE LOAD (Från början)
    if (currentTopicId === 'lobby' || currentTopicId === 'uc') {
        // Första gången sidan laddas -> Kör vanliga startTime (19.482s)
        audio.currentTime = currentConfig.startTime || 19.482;
    } else {
        const isInternalNavigation = savedTime && (!fromTopic || fromTopic === currentTopicId);
        if (isInternalNavigation) {
            audio.currentTime = parseFloat(savedTime);
            window.startMusic(true); 
        } else {
            audio.currentTime = currentConfig.startTime || 0;
        }
    }
    // Startknappar
    if (isTopicPage && startBtnTopic) {
        startBtnTopic.addEventListener('click', () => window.startMusic(false));
    }
    if (enterBtn && !isTopicPage) {
        enterBtn.addEventListener('click', () => window.startMusic(false));
    }
 // ── INTRO & VISIBILITETS-LOGIK ──
    if (toggleBtn) {
        const isLobby = currentTopicId === 'lobby';
        const introOverlay = document.querySelector('.intro-overlay-grp');
        const isIntroActive = introOverlay && introOverlay.style.display !== 'none';
        if (isLobby && isIntroActive) {
            toggleBtn.classList.remove('is-visible');
            
            // Hitta welcome-containern och starta timern först NÄR man interagerar (klick eller Enter/Space)
            const welcomeTarget = document.querySelector(".welcome-text-container");
            if (welcomeTarget) {
                welcomeTarget.addEventListener('click', () => {
                    setTimeout(() => {
                        toggleBtn.classList.add('is-visible');
                    }, 7260);
                });
            } else {
                // Fallback om välkomsttexten inte hittas
                setTimeout(() => {
                    toggleBtn.classList.add('is-visible');
                }, 7260);
            }
        } else {
            // En fördröjning på 50ms så att webbläsaren hinner starta opacity-transitionen på undersidor!
            setTimeout(() => {
                toggleBtn.classList.add('is-visible');
            }, 50);
        }
      // DET ENDA KLICK-EVENTET FÖR TOGGLE-KNAPPEN
toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    
    // 1. Om vi redan animerar, gör inget (förhindrar spam)
    if (toggleBtn.classList.contains('is-animating')) return;
  // 2. BYT BILD/STATUS DIREKT OCH SPELA RÄTT LJUD
          if (!isMuted) {
              if (typeof playSFX === 'function') playSFX('back'); // Spela "Av"-ljudet
              applyMuteState(true); // Muta (sänker bara volymen nu!)
          } else {
              applyMuteState(false); // Höj volymen igen
              // window.startMusic(false); <-- Denna kan du kommentera bort/ta bort om den försöker starta om en låt som redan spelar!
              if (typeof playSFX === 'function') playSFX('select'); // Spela "På"-ljudet
          }
    // 3. Trigger Klick-stretch och Noise-animation
    toggleBtn.classList.add('is-clicked');
    toggleBtn.classList.add('is-animating');
    // 4. Städa upp animationerna efter 600ms (utan att röra statusen!)
    setTimeout(() => {
        toggleBtn.classList.remove('is-clicked');
        toggleBtn.classList.remove('is-animating');
    }, 600);  
	});
  }
}
// ── EVENT LISTENERS (HÄNDELSER) ──────────────────────
  
// ── SFX GRACE PERIOD VID SIDLADDNING & BACKNING ──
window.addEventListener('pageshow', () => {
    window.isSfxLocked = true; // Lås ljudet direkt
    // Släpp låset efter 1 sekund (Då har skip-intro och alla overlay-spökklick kört klart)
    setTimeout(() => {
        window.isSfxLocked = false;
    }, 1000); 
});
  
window.addEventListener('DOMContentLoaded', initAudio);
// Skottsäker bfcache-fix för BACK/FORWARD-knapparna!
window.addEventListener('pageshow', (event) => {
    // Tvinga variabeln till false och rensa gamla klasser DIREKT för att döda dubbelklick-buggen
    applyMuteState(false);
    
    // Hantera tider när man navigerar runt (länk eller backa)
    if (currentTopicId === 'lobby' || currentTopicId === 'uc') {
        const baseStart = currentConfig.startTime || 19.482;
        
        // Om det INTE är en helt ren förstahandsladdning (t.ex. vid backning/historik)
        if (event.persisted || performance.getEntriesByType("navigation")[0].type === "back_forward" || performance.getEntriesByType("navigation")[0].type === "navigate") {
            // Lägg på dina extra 8 sekunders skip! (19.482 + 8 = 27.482s)
            audio.currentTime = baseStart + 8;
        } else {
            audio.currentTime = baseStart;
        }
    }
    // Starta musiken direkt om vi backat eller hoppat via länk
    const introOverlay = document.querySelector('.intro-overlay-grp');
    const isIntroActive = introOverlay && introOverlay.style.display !== 'none';
    
    if (currentTopicId !== 'lobby' || !isIntroActive) {
        window.startMusic(true);
    }
});
// Spara tid när man lämnar en undersida
window.addEventListener('beforeunload', () => {
    if (!audio.paused && currentTopicId !== 'lobby' && currentTopicId !== 'uc') {
        sessionStorage.setItem(audioKey, audio.currentTime);
    }
});
  
// ── MASTER SWITCH (AUTO PAUSE/PLAY VID TAB-BYTE) ──────────────────────
document.addEventListener("visibilitychange", function() {
  if (document.hidden) {
    if (!audio.paused && !isMuted) {
      audio.dataset.wasPlaying = "true";
      audio.pause();
    }
    document.querySelectorAll('video').forEach(v => v.pause());
  } else {
    if (audio.dataset.wasPlaying === "true" && !isMuted) {
      audio.volume = 0;
      audio.play().catch(() => {});
      const steps = 50, stepAmount = currentConfig.volume / steps;
      let fadeIn = setInterval(() => {
          if (audio.volume + stepAmount < currentConfig.volume) { audio.volume += stepAmount; }
          else { audio.volume = currentConfig.volume; clearInterval(fadeIn); }
      }, 20);
      audio.dataset.wasPlaying = "false";
    }
    document.querySelectorAll('video').forEach(v => {
      if (v.hasAttribute('autoplay')) v.play().catch(() => {});
    });
  }
});
// ── TRANSITION OVERLAY ────────────────────────────────────────────────
const overlay = document.createElement('div');
overlay.id = 'global-transition-overlay';
overlay.style.cssText = "position:fixed;inset:0;z-index:999999;pointer-events:none;transition:opacity 0.8s ease;opacity:1;display:block;";
document.body.appendChild(overlay);
const savedColor = sessionStorage.getItem('exitColor');
const bodyTheme  = document.body.getAttribute('data-theme');
const initColor  = savedColor || (bodyTheme === 'light' ? '#ffffff' : '#000000');
overlay.style.background = initColor;
// VIKTIGT: Vi raderar INTE färgen här ute längre, vi måste låta skipIntro hinna läsa den!
window.addEventListener('pageshow', () => {
    // Nu raderar vi färgen först när hela sidan (och alla skript) har laddats klart
    sessionStorage.removeItem('exitColor');
    
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none'; 
    overlay.style.cursor = 'auto';
    setTimeout(() => { overlay.style.display = 'none'; overlay.innerHTML = ''; }, 850);
    const isTopicPage = currentTopicId !== 'lobby';
    if (isTopicPage && audio.paused) {
        window.startMusic(false); 
    }
});
// ── GLOBAL EXIT FUNCTION MED LOTTIE-LOGIK ─────────────────────────────
// Vi lägger till parametern 'isSlowFinish' (default är false)
window.triggerPageExit = function(url, isSlowFinish = false) {
    sessionStorage.setItem('skipIntro', 'true');
    
    const targetTopicId = getTopicFromUrl(url);
    const changingTopic = currentTopicId !== targetTopicId;
    const isLeavingLobby = currentTopicId === 'lobby' && targetTopicId !== 'lobby';
    if (changingTopic) {
        sessionStorage.setItem('fromTopic', currentTopicId);
        if (window.fadeOutMusic) window.fadeOutMusic();
    } else {
        sessionStorage.removeItem('fromTopic');
    }
    const currentTheme = document.body.getAttribute('data-theme');
    const transitionColor = (currentTheme === 'light' ? '#ffffff' : '#000000');
    
    sessionStorage.setItem('exitColor', transitionColor);
    overlay.style.pointerEvents = 'auto'; 
    overlay.style.cursor = 'default';
    overlay.style.transition = 'none';
    overlay.style.background = transitionColor;
    overlay.style.opacity = '0';
    overlay.style.display = 'block';
    // 1. Om spelet slutförs gör vi själva infasningen av färgen mjukare och långsammare (1.5s istället för 0.8s)
    const fadeSpeed = isSlowFinish ? '1.5s' : '0.8s';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.style.transition = `opacity ${fadeSpeed} ease`;
            overlay.style.opacity = '1';
            if (isLeavingLobby) {
                setTimeout(() => {
                    overlay.innerHTML = `
                    <style>
                        .transition-lottie { width: 8rem; height: 8rem; }
                        @media (max-width: 991px) { .transition-lottie { width: 7rem; height: 7rem; } }
                    </style>
                    <div style="display:flex; justify-content:center; align-items:center; height:100svh; width:100vw;">
                        <lottie-player 
                            class="transition-lottie"
                            src="https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a159263c0394fc57a0ee84a_loading-game-2.json" 
                            background="transparent" 
                            speed="1" 
                            autoplay>
                        </lottie-player>
                    </div>`;
                    
                    setTimeout(() => {
                        overlay.innerHTML = ''; 
                        setTimeout(() => {
                            window.location.href = url;
                        }, 50); 
                    }, 1345); 
                }, 800);
            
            } else {
                // 2. Om spelet slutförs drar vi ut väntetiden till 3 sekunder (3000ms) för spänningens skull
                const waitTime = isSlowFinish ? 3000 : 1000;
                setTimeout(() => {
                    window.location.href = url;
                }, waitTime); 
            }
        });
    });
};
// ── CLICK HANDLER FÖR LÄNKAR ──────────────────────────────────────────
document.addEventListener('click', function(e) {
    const link = e.target.closest('a');
    if (!link || link.target === '_blank' || e.metaKey || e.ctrlKey) return;
    const href = link.getAttribute('href');
    // NYTT: .games-link-block undantagen - den hanteras nu helt av gatekeepern
    // i module-scripts.js, som anropar triggerPageExit själv när användaren är inloggad.
    if (!href || href === '#' || href.startsWith('#') || link.classList.contains('is-password') || link.closest('.pp-dropdown, .i-closer-game, .button.i-lobby-back, .games-link-block')) return;
    e.preventDefault();
    
    // SMART SYSTEM: Letar efter alla länkar vars ID börjar med "finish-btn-"
    const isFinishBtn = link.id && link.id.startsWith('finish-btn-');
    
    if (link.id === 'boss-level') { 
        setTimeout(() => window.triggerPageExit(href, false), 1000); 
    } else if (isFinishBtn) {
        // Skickar med "true" för att aktivera isSlowFinish-logiken ovan!
        setTimeout(() => window.triggerPageExit(href, true), 200); 
    } else { 
        setTimeout(() => window.triggerPageExit(href, false), 200); 
    }
});
// ── KEYBOARD LISTENER FÖR INTRO (ENTER/SPACE) ─────────────────────────
let triggered = false;
document.addEventListener("keydown", function(e) {
  if (triggered) return;
  if (document.getElementById('back-overlay')) return; 
  if (e.key === "Enter" || e.key === " ") {
    const welcomeTarget = document.querySelector(".welcome-text-container");
    if (!welcomeTarget) return;
    if (welcomeTarget.offsetWidth === 0 && welcomeTarget.offsetHeight === 0) return;
    const style = window.getComputedStyle(welcomeTarget);
    if (style.display === 'none' || parseFloat(style.opacity) < 0.1) return;
    
    triggered = true;
    e.preventDefault();
    e.stopImmediatePropagation();
    welcomeTarget.click();
  }
});
// ── STRÖMSPAR-FUNKTIONER (VIDEO) ──────────────────────────────────────
const powerSaveVideos = () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting) { video.play().catch(() => {}); } 
      else { video.pause(); }
    });
  }, { threshold: 0.9 }); 
  document.querySelectorAll('video').forEach(v => observer.observe(v));
};
if (document.readyState === 'complete') { powerSaveVideos(); } 
else { window.addEventListener('load', powerSaveVideos); }
setInterval(() => {
  document.querySelectorAll('video').forEach(v => {
    const style = window.getComputedStyle(v);
    const isHidden = (v.offsetWidth === 0 && v.offsetHeight === 0) || style.opacity === '0' || style.visibility === 'hidden';                    
    if (isHidden && !v.paused) { v.pause(); } 
    else if (!isHidden && v.paused && v.hasAttribute('autoplay')) { v.play().catch(() => {}); }
  });
}, 6000); 
// ── ANCHOR SECTION TRANSITION ─────────────────────────────────────────
window.addEventListener('load', function() {
  document.querySelectorAll('[data-scroll-to]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.getElementById(this.getAttribute('data-scroll-to'));
      if (!target) return;
      const start = window.scrollY;
      const multiplier = window.innerWidth <= 479 ? 0.67: 0.4;
      const end = target.getBoundingClientRect().top + window.scrollY - (window.innerHeight * multiplier);
      const distance = end - start;
      const duration = 1000;
      let startTime = null;
      function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        window.scrollTo(0, start + distance * easeInOut(progress));
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  });
});
// ── AUTO-FOCUS & SCROLL-TOP FÖR OVERLAYS (STABIL VERSION) ──────────────────
(function() {
  const isOverlayOpen = {}; // Spårning för att undvika "dubbelkörning"
  function fakeClick() {
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    // Hoppa över om det landar på pp-dropdown eller dess close-triggers
    // (annars stänger detta dropdownen ~150ms efter att den öppnats)
    if (el.closest('.pp-dropdown, .i-closer-game, .button.i-lobby-back, .profile-pic-option, .pp-grid-wrapper')) return;
    ['mousedown', 'mouseup', 'click'].forEach(type => {
      const evt = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
      evt._synthetic = true;
      el.dispatchEvent(evt);
    });
  }
  // Lista över dina overlays (lägg till dina exakta klassnamn här)
  const targets = ['.rules-overlay', '.inventory-overlay', '.leaderboard-overlay', '.about-overlay'];
  targets.forEach(selector => {
    document.querySelectorAll(selector).forEach(overlay => {
      new MutationObserver(() => {
        const style = window.getComputedStyle(overlay);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
        // Om den är synlig OCH vi inte redan har kört koden för denna öppning:
        if (isVisible && !isOverlayOpen[selector]) {
          isOverlayOpen[selector] = true; // Lås
          // 1. Scrolla slidern till toppen
          const scrollEl = document.getElementById('i-slider');
          if (scrollEl) {
            scrollEl.scrollTop = 0; 
          }
          // 2. Fokus-klick (med en liten fördröjning för att vara säker)
          setTimeout(fakeClick, 150);
        } else if (!isVisible) {
          isOverlayOpen[selector] = false; // Lås upp när den stängs
        }
      }).observe(overlay, { attributes: true, attributeFilter: ['style', 'class'] });
    });
  });
})();
// ── MULTI-BUTTON KEY LISTENERS (ESC/ENTER) ────────────────────────────
document.addEventListener('keydown', function(e) {
    const triggerKeys = ["Escape", "Enter"];
    if (!triggerKeys.includes(e.key)) return;

    // 1. Är en overlay öppen? Klicka DESS egen .button och sluta.
    const overlays = document.querySelectorAll('.rules-overlay, .inventory-overlay, .leaderboard-overlay, .about-overlay');
    for (const overlay of overlays) {
        const style = window.getComputedStyle(overlay);
        const isOpen = style.display !== 'none' && parseFloat(style.opacity) > 0.9;
        if (isOpen) {
            if (e.key === 'Enter' && overlay.classList.contains('about-overlay')) return;
            e.preventDefault();
            const btn = overlay.querySelector('.button');
            if (btn) btn.click();
            return;
        }
    }

    // 2. UC-sidans knapp
    const lobbyLinkUc = document.getElementById('link-to-lobby-from-uc');
    if (lobbyLinkUc) {
        e.preventDefault();
        lobbyLinkUc.click();
        return;
    }

    // 3. Generisk fallback: klicka på den FAKTISKT SYNLIGA .button/.button-link
    // i en .button-wrapper. offsetParent === null = display:none, vilket
    // automatiskt filtrerar bort dolda variant-kopior i DOM:en.
    const visibleWrapperBtn = Array.from(
        document.querySelectorAll('.button-wrapper .button, .button-wrapper .button-link')
    ).find(el => el.offsetParent !== null);

    if (visibleWrapperBtn) {
        e.preventDefault();
        visibleWrapperBtn.click();
    }
});
// ── CLIPPING MIN-WIDTH LOGIK ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const trigger = document.querySelector('.welcome-text-container');
  const target = document.querySelector('.clipping');
  if (!trigger || !target) return;
  function applyMinWidth() {
    if (window.innerWidth > 991) { target.style.setProperty('min-width', '38rem', 'important'); } 
    else { target.style.removeProperty('min-width'); }
  }
  let hasClicked = false;
  if (window.innerWidth > 991) {
    trigger.addEventListener('click', () => {
      setTimeout(() => { hasClicked = true; applyMinWidth(); }, 2400);
    });
  }
  window.addEventListener('resize', () => { if (hasClicked) applyMinWidth(); });
});
// ── GLOBAL CLICK DELAY ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  let locked = false;
  document.addEventListener('click', (e) => {
    if (e.target.closest('a, input, textarea, select, .pp-dropdown, .i-closer-game, .button.i-lobby-back, .profile-pic-option, .pp-grid-wrapper')) return;
    if (e._synthetic) return; 
    if (locked) { e.stopPropagation(); e.preventDefault(); return; }
    locked = true;
    setTimeout(() => { locked = false; }, 500);
  }, true);
});
  // ── GLOBALT STOPP FÖR STANDARD TAB-FOKUS ────────────────────────────
window.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
        e.preventDefault(); // Hindrar webbläsaren från att flytta fokus till slumpmässiga knappar
    }
}, true); // 'true' gör att den fångar tangenten direkt innan något annat händer

// ══════════════════════════════════════════════════════════════════════
// GENERISKT HOVER- & PRESS-SCALE-SYSTEM
// Ersätter individuella Webflow IX2 hover/click-scale-interactions.
// Lägg bara till/ta bort klassnamn i listorna nedan - ingen ny IX2 behövs
// för nya element, bara lägg till klassen i rätt lista här.
// ══════════════════════════════════════════════════════════════════════
 
// Klasser som ska skalas upp till 1.15 vid hover (stor effekt)
const HOVER_SCALE_CLASSES = [
    'games-link-block',
    'q-logo',
    'burger-links',
    'fcp-link',
    'fat-cat-logo',
    'submit-button',
    'button',
    'button-link',
    'game-info-gma-frame.finish-gma',
    'start-btn-gma-wrapper',
    'share-score-btn',
    'link-next-challenge',
    'link-review-answers',
    'inventory-btn-wrapper',
    'logout-btn',
    'button.i-lobby-back',
    'cp-create-btn',
    'profile-pic-option',
    'current-profile-pic'
];

// Klasser som ska skalas upp till 1.08 vid hover (subtil effekt)
const HOVER_SCALE_CLASSES_SM = [
    'wtc-wrapper'
];

// Klasser som ska ändra scale vid press (pointerdown -> pointerup)
const PRESS_SCALE_CLASSES = [
    'games-link-block',
    'q-logo',
    'burger-links',
    'submit-button',
    'button',
    'button-link',
    'game-info-gma-frame.finish-gma',
    'start-btn-gma-wrapper',
    'share-score-btn',
    'link-next-challenge',
    'link-review-answers',
    'logout-btn',
    'button.i-lobby-back',
    'cp-create-btn',
    'current-profile-pic'
];

const supportsRealHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// scaleClass = 'js-hover-scale' (1.15) eller 'js-hover-scale-sm' (1.08)
function initHoverScale(classList, scaleClass) {
    classList.forEach(cls => {
        document.querySelectorAll('.' + cls).forEach(el => {
            el.classList.add(scaleClass);

            el.addEventListener('mouseenter', () => {
                if (!el.classList.contains('is-click-blocked')) {
                    el.classList.add('is-hovered');
                }
            });

            el.addEventListener('mouseleave', () => {
                el.classList.remove('is-hovered');
                el.classList.remove('is-click-blocked');
            });
        });
    });
}
// Hur länge (minst) press-effekten ska synas, även vid ett blixtsnabbt klick
const MIN_PRESS_VISIBLE_MS = 140;
function initPressScale(classList) {
    classList.forEach(cls => {
        document.querySelectorAll('.' + cls).forEach(el => {
            el.classList.add('js-press-scale');
            let pressStartTime = 0;
            let releaseTimeoutId = null;
            el.addEventListener('pointerdown', (e) => {
                // Om ett tidigare, väntande release inte hunnit köra - avbryt det, ny press har börjat
                if (releaseTimeoutId) {
                    clearTimeout(releaseTimeoutId);
                    releaseTimeoutId = null;
                }
                pressStartTime = performance.now();
                if (e.pointerType === 'mouse') {
                    el.classList.add('is-pressed-down'); // Mus -> skala NER
                } else {
                    el.classList.add('is-pressed-up');   // Touch/penna -> skala UPP
                }
            });
            // Den faktiska återställningen - körs antingen direkt eller efter fördröjning
            const doRelease = () => {
                el.classList.remove('is-pressed-down');
                el.classList.remove('is-pressed-up');
                el.classList.remove('is-hovered');
                el.classList.add('is-click-blocked');
                releaseTimeoutId = null;
            };
            const release = () => {
                const elapsed = performance.now() - pressStartTime;
                const remaining = MIN_PRESS_VISIBLE_MS - elapsed;
                if (remaining > 0) {
                    // Trycket var kortare än minimitiden - vänta ut resten innan vi återställer
                    releaseTimeoutId = setTimeout(doRelease, remaining);
                } else {
                    // Trycket varade redan längre än minimitiden - återställ direkt
                    doRelease();
                }
            };
            el.addEventListener('pointerup', release);
            el.addEventListener('pointercancel', release);
            el.addEventListener('pointerleave', release);
        });
    });
}
document.addEventListener('DOMContentLoaded', () => {
    if (supportsRealHover) {
        initHoverScale(HOVER_SCALE_CLASSES, 'js-hover-scale');
        initHoverScale(HOVER_SCALE_CLASSES_SM, 'js-hover-scale-sm');
    }
    initPressScale(PRESS_SCALE_CLASSES);
});

// ══════════════════════════════════════════════════════════════════════
// SCROLL-PULSE SYSTEM (FÖR CUSTOM <LOTTIE-PLAYER>)
// ══════════════════════════════════════════════════════════════════════

const SCROLL_PULSE_DELAY_MS = 1100;
const pulsePendingTimeouts = new Map();

function startSnake(wrapperEl) {
    const snake = wrapperEl.querySelector('lottie-player.return-snake');
    if (!snake) return;
    
    // Använd Lottie-spelarens inbyggda metoder
    if (typeof snake.seek === 'function') snake.seek(0);
    if (typeof snake.play === 'function') snake.play();
}

function stopSnake(wrapperEl) {
    const snake = wrapperEl.querySelector('lottie-player.return-snake');
    if (!snake) return;
    
    // Stoppa och backa snabbt till början
    if (typeof snake.stop === 'function') snake.stop();
    if (typeof snake.seek === 'function') snake.seek(0);
}

function resetPulse(wrapperEl) {
    if (pulsePendingTimeouts.has(wrapperEl)) {
        clearTimeout(pulsePendingTimeouts.get(wrapperEl));
        pulsePendingTimeouts.delete(wrapperEl);
    }
    wrapperEl.querySelectorAll('.button, .button-link').forEach(btn => btn.classList.remove('is-pulsing'));
    stopSnake(wrapperEl);
}

function startPulse(wrapperEl) {
    if (pulsePendingTimeouts.has(wrapperEl)) return;
    const timeoutId = setTimeout(() => {
        pulsePendingTimeouts.delete(wrapperEl);
        wrapperEl.querySelectorAll('.button, .button-link').forEach(btn => btn.classList.add('is-pulsing'));
        startSnake(wrapperEl);
    }, SCROLL_PULSE_DELAY_MS);
    pulsePendingTimeouts.set(wrapperEl, timeoutId);
}

function initScrollPulse() {
    const wrappers = document.querySelectorAll('.button-wrapper');
    if (!wrappers.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) startPulse(entry.target);
            else resetPulse(entry.target);
        });
    }, { threshold: 0.2 });

    wrappers.forEach(w => {
        observer.observe(w);
        // Reset via knappklick inuti wrappern
        w.querySelectorAll('.button, .button-link').forEach(btn => {
            btn.addEventListener('click', () => resetPulse(w));
        });
    });

    // Reset via klick på burgarmenyn (för overlays)
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.burger-links')) return;
        wrappers.forEach(resetPulse);
    });
}

// Ladda scriptet när Lottie-biblioteket är redo
if (customElements.get('lottie-player')) {
    document.addEventListener('DOMContentLoaded', initScrollPulse);
} else {
    customElements.whenDefined('lottie-player').then(() => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initScrollPulse);
        } else {
            initScrollPulse();
        }
    });
}
// Stäng flik för terms and privacy
document.addEventListener("click", (e) => {
  // Leta efter klick på din komboklass (eller något inuti den)
  const closeBtn = e.target.closest(".button-link.close-tab");
  
  if (closeBtn) {
    e.preventDefault();
    
    // 1. Försök stänga fliken
    window.close();
    
    // 2. Fallback: Om fliken fortfarande är öppen efter 200ms, backa eller gå till länk
    setTimeout(() => {
      if (history.length > 1) {
        history.back();
      } else {
        window.location.href = closeBtn.getAttribute("href") || "/";
      }
    }, 200);
  }
});