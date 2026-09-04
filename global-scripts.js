// Robust smooth scroll to element id (cancelable)
// Finds the nearest scrollable ancestor, or null if the page itself scrolls
function getScrollParent(el) {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null; // no scrollable ancestor found -> use window
}

function smoothScrollToId(targetId, opts = {}) {
  const duration = opts.duration ?? 1000;
  const topOffsetPercent = opts.topOffsetPercent ?? (window.innerWidth < 600 ? 0.12 : 0.2);
  const target = document.getElementById(targetId);
  if (!target) return Promise.resolve(false);

  // explicit container wins; otherwise auto-detect; otherwise fall back to window
  const container = opts.container instanceof Element
    ? opts.container
    : (opts.containerSelector ? document.querySelector(opts.containerSelector) : null)
      || getScrollParent(target);

  const isWindow = !container;
  const scroller = {
    get pos() {
      return isWindow ? window.scrollY : container.scrollTop;
    },
    set pos(v) {
      if (isWindow) window.scrollTo(0, v);
      else container.scrollTop = v;
    },
    get viewportHeight() {
      return isWindow
        ? (window.visualViewport ? window.visualViewport.height : window.innerHeight)
        : container.clientHeight;
    },
    addEvt(type, fn, opts2) {
      (isWindow ? window : container).addEventListener(type, fn, opts2);
    },
    removeEvt(type, fn) {
      (isWindow ? window : container).removeEventListener(type, fn);
    }
  };

  const targetRect = target.getBoundingClientRect();
  const baseRect = isWindow ? { top: 0 } : container.getBoundingClientRect();
  const elementTop = targetRect.top - baseRect.top + scroller.pos;
  const targetPos = Math.max(0, Math.round(elementTop - scroller.viewportHeight * topOffsetPercent));

  let start = scroller.pos;
  const distance = targetPos - start;
  let startTime = null;
  let rafId = null;
  let canceled = false;

  const cancelOnUser = () => { canceled = true; cleanup(); };
  scroller.addEvt('wheel', cancelOnUser, { passive: true, once: true });
  scroller.addEvt('touchstart', cancelOnUser, { passive: true, once: true });
  window.addEventListener('keydown', cancelOnUser, { once: true });

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  function step(ts) {
    if (canceled) return;
    if (!startTime) startTime = ts;
    const progress = Math.min((ts - startTime) / duration, 1);
    scroller.pos = Math.round(start + distance * easeInOut(progress));
    if (progress < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      cleanup();
    }
  }
  function cleanup() {
    if (rafId) cancelAnimationFrame(rafId);
    try {
      scroller.removeEvt('wheel', cancelOnUser);
      scroller.removeEvt('touchstart', cancelOnUser);
      window.removeEventListener('keydown', cancelOnUser);
    } catch (e) {}
  }
  return new Promise((resolve) => {
    rafId = requestAnimationFrame(step);
    const finishCheck = setInterval(() => {
      if (canceled || scroller.pos === targetPos) {
        clearInterval(finishCheck);
        cleanup();
        resolve(!canceled);
      }
    }, 50);
  });
}

// Attach handlers — unchanged, just stop passing a hardcoded containerSelector
(function attachDataScrollHandlers() {
  const triggers = document.querySelectorAll('[data-scroll-to]');
  triggers.forEach(trigger => {
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      const cs = window.getComputedStyle(this);
      if (cs.pointerEvents === 'none' || parseFloat(cs.opacity) === 0) return;
      const id = this.getAttribute('data-scroll-to');
      if (!id) return;
      smoothScrollToId(id, {
        duration: 900,
        topOffsetPercent: window.innerWidth < 600 ? 0.12 : 0.20
        // no containerSelector needed — auto-detects .mask-middle here,
        // falls back to window on normal pages
      });
    });
  });
})();

// ────────────────── GAME-START PAGES ──────────────────
// 1 BLUR TOP OF PAGE - WITH CLONE
  document.addEventListener('DOMContentLoaded', () => {
  const scrollSource = document.querySelector('.mask-middle');
  const scrollSlave = document.querySelector('.mask-top');

  if (!scrollSource || !scrollSlave) {
    console.warn('scroll sync: elements not found', scrollSource, scrollSlave);
    return;
  }

  function syncSlave() {
    scrollSlave.scrollTop = scrollSource.scrollTop;
  }

  scrollSource.addEventListener('scroll', () => {
    requestAnimationFrame(syncSlave);
  }, { passive: true });
});

document.addEventListener('DOMContentLoaded', () => {
  const real = document.querySelector('.mask-middle .vertical-center');
  const dummySlot = document.querySelector('.mask-top .game-v-clone');

  if (real && dummySlot) {
    const clone = real.cloneNode(true);

    // Strip IDs to avoid duplicates
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

    // Force link colors inside clone
    clone.querySelectorAll('a').forEach(el => {
      el.style.color = 'white';
    });

    // Strip ONLY behavioral utility classes that trigger JS logic or animations
    const interactiveClasses = ['hover-scale', 'js-press-scale'];
    interactiveClasses.forEach(cls => {
      clone.classList.remove(cls);
      clone.querySelectorAll('.' + cls).forEach(el => el.classList.remove(cls));
    });

    dummySlot.appendChild(clone);
  }
});

// 2 COMPONENT .dropdown-gamelevel
  document.addEventListener('DOMContentLoaded', () => {
  const dropdownToggle = document.querySelector('.mask-middle .dropdown-toggle-lvl');
  const dropdownList = document.querySelector('.mask-middle .dropdown-list-2');
  const gamelvlBtn = document.querySelector('.mask-middle .gamelvl-btn');
  const levelRows = document.querySelectorAll('.mask-middle .game-level');
  const startBtn = document.querySelector('.mask-middle .game-start-btn');
  if (!dropdownToggle || !dropdownList || !gamelvlBtn) return;

  const toggleDropdown = (show) => {
  const shouldOpen = show !== undefined ? show : !dropdownList.classList.contains('is-open');
  if (shouldOpen) {
    dropdownList.style.display = 'flex';
    requestAnimationFrame(() => dropdownList.classList.add('is-open'));
  } else {
    dropdownList.classList.remove('is-open');
    dropdownList.addEventListener('transitionend', function handler() {
      dropdownList.style.display = 'none';
      dropdownList.removeEventListener('transitionend', handler);
    }, { once: true });
  }
};

  dropdownToggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleDropdown();
  });

  levelRows.forEach((row) => {
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      gamelvlBtn.innerHTML = row.innerHTML;
	  gamelvlBtn.classList.add(...row.classList); // adds row's classes alongside gamelvlBtn's existing ones

      const selectedText = row.textContent.trim();
      const levelMatch = selectedText.match(/\d+/);
      const selectedLevel = levelMatch ? levelMatch[0] : '1';

      if (startBtn) {
        startBtn.dataset.level = selectedLevel;
        const currentHref = startBtn.getAttribute('href') || '';
        if (currentHref) {
          startBtn.setAttribute('href', currentHref.replace(/level=\d+/, `level=${selectedLevel}`));
        }
      }

      toggleDropdown(false);
    });
  });

  document.addEventListener('click', (e) => {
    if (!dropdownToggle.contains(e.target) && !dropdownList.contains(e.target)) {
      toggleDropdown(false);
    }
  });
});

// 3 COMPONENT game-start-btn
// SCROLL: game-start-btn visibility + arrow hide/show
document.addEventListener('DOMContentLoaded', () => {
  const scrollContainer = document.querySelector('.mask-middle');
  const targetBtns = document.querySelectorAll('.mask-middle .game-start-btn, .game-start-btn-gma');
  const arrowWrapper = document.querySelector('.arrow-anchor-wrapper');

  if (targetBtns.length === 0) return;

  function showButton(btnInside) {
    if (btnInside) btnInside.classList.add('is-visible');
    if (arrowWrapper) arrowWrapper.classList.add('is-hidden');
  }

  function hideButton(btnInside) {
    if (btnInside) btnInside.classList.remove('is-visible');
    if (arrowWrapper) arrowWrapper.classList.remove('is-hidden');
  }

  // --- 1. INTERSECTION OBSERVER ---
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const btnInside = entry.target.querySelector('.game-start-btn, .game-start-btn-gma');
        if (!btnInside) return;

        if (entry.isIntersecting) {
          showButton(btnInside);
        } else {
          // If we scroll back up, IMMEDIATELY allow the reverse animation to happen
          if (!isAtBottom()) {
            hideButton(btnInside);
          }
        }
      });
    },
    {
      root: scrollContainer,
      threshold: 0.1, // Lower threshold so it reacts smoothly the moment it enters/exits view
      rootMargin: "0px 0px -15% 0px"
    }
  );

  targetBtns.forEach((btn) => {
    const parentRow = btn.closest('.row-gamestart, .row-2');
    if (parentRow) observer.observe(parentRow);
  });

  // --- 2. DYNAMIC BOTTOM SAFETY NET ---
  function isAtBottom() {
    if (scrollContainer) {
      return scrollContainer.scrollHeight - scrollContainer.scrollTop <= scrollContainer.clientHeight + 5;
    } else {
      return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5;
    }
  }

  const scrollTarget = scrollContainer || window;
  let lastScrollPos = 0;

  scrollTarget.addEventListener('scroll', () => {
    const currentScrollPos = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
    const scrollingUp = currentScrollPos < lastScrollPos;

    if (isAtBottom() && !scrollingUp) {
      // Only force show when arriving at the bottom scrolling down
      targetBtns.forEach((btn) => showButton(btn));
    } else if (scrollingUp && !isAtBottom()) {
      // The moment user scrolls UP and leaves the bottom, let observer take over naturally
      targetBtns.forEach((btn) => {
        const parentRow = btn.closest('.row-gamestart, .row-2');
        if (parentRow) {
          const rect = parentRow.getBoundingClientRect();
          const containerRect = scrollContainer ? scrollContainer.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
          
          // If the row is no longer in the trigger zone, hide button & bring back arrow
          if (rect.top > containerRect.bottom || rect.bottom < containerRect.top) {
            hideButton(btn);
          }
        }
      });
    }

    lastScrollPos = currentScrollPos;
  }, { passive: true });
});

// 4 ARROW ANCHOR BOUNCE— exact SVG bezier curve replay
document.addEventListener('DOMContentLoaded', () => {
  const arrowWrapper = document.querySelector('.arrow-anchor-wrapper');
  if (!arrowWrapper) return;

  // Your exact Webflow IX3 bezier path, parsed into segments.
  // Each segment: [P0, C1, C2, P1] as {x, y} points, taken directly from the path data.
  const rawPath = "M0,161 C14,160 30,-31 47,71 C64,173 65,101 70,24 C76,-114 75,-10 84,-1 C92,4 105,-5 120,10 C135,25 136,159 160,160";

  function parseBezierPath(d) {
    const nums = d.match(/-?\d*\.?\d+/g).map(Number);
    const points = [];
    for (let i = 0; i < nums.length; i += 2) {
      points.push({ x: nums[i], y: nums[i + 1] });
    }
    // points[0] is M (start). Then every 3 points after that = one C segment (C1, C2, end)
    const segments = [];
    let prev = points[0];
    for (let i = 1; i < points.length; i += 3) {
      segments.push({
        p0: prev,
        c1: points[i],
        c2: points[i + 1],
        p1: points[i + 2],
      });
      prev = points[i + 2];
    }
    return segments;
  }

  const segments = parseBezierPath(rawPath);
  const totalDuration = segments[segments.length - 1].p1.x; // 160 -> total "time" units in the path
  const startY = segments[0].p0.y; // baseline Y (161)

  // Cubic bezier evaluation at parameter u (0-1) for a single axis
  function cubicAt(u, p0, c1, c2, p1) {
    const mu = 1 - u;
    return (
      mu * mu * mu * p0 +
      3 * mu * mu * u * c1 +
      3 * mu * u * u * c2 +
      u * u * u * p1
    );
  }

  // Given target X (time), find u along the correct segment via binary search on X,
  // then return that segment's Y at that u.
  function evaluateY(targetX) {
    for (const seg of segments) {
      if (targetX >= seg.p0.x && targetX <= seg.p1.x) {
        // binary search for u where cubicAt(u, x-coords) == targetX
        let lo = 0, hi = 1, u = 0.5;
        for (let iter = 0; iter < 20; iter++) {
          u = (lo + hi) / 2;
          const x = cubicAt(u, seg.p0.x, seg.c1.x, seg.c2.x, seg.p1.x);
          if (x < targetX) lo = u; else hi = u;
        }
        return cubicAt(u, seg.p0.y, seg.c1.y, seg.c2.y, seg.p1.y);
      }
    }
    return segments[segments.length - 1].p1.y;
  }

  function startArrowAnimation(element) {
  const duration = 1870;
  let startTime = null;

  // Tweak these two to taste:
  const DIRECTION = -1;   // 1 = as-parsed, -1 = reversed
  const SCALE = 0.5;      // 1 = full movement, 0.5 = half, etc.

  function animate(currentTime) {
    if (element.classList.contains('is-hidden')) {
      startTime = null;
      requestAnimationFrame(animate);
      return;
    }
    if (!startTime) startTime = currentTime;
    const elapsed = currentTime - startTime;
    const progress = (elapsed % duration) / duration;

    const targetX = progress * totalDuration;
    const y = evaluateY(targetX);
    const offsetPercent = (y - startY) * DIRECTION * SCALE;

    element.style.transform = `translateY(${offsetPercent}%)`;
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

  setTimeout(() => {
    arrowWrapper.classList.add('is-loaded');
    startArrowAnimation(arrowWrapper);
  }, 3200);
});

  // ────────────────── GAME RUNNING ──────────────────
  // 1 Banner-responsive
  document.addEventListener("DOMContentLoaded", function() {
  const banner = document.querySelector('.banner-responsive');
  if(!banner) return;

  // 1. Variabler för skroll (Scrub)
  let lastScrollY = window.scrollY;
  let baseY = 0; // Skrollens position (0 till -n)
  
  // 2. Variabler för Ambient Animation
  const ambientDelayMs = 1500; // Väntar 2 sekunder (2000ms)
  const cycleDurationMs = 3000; // En full loop upp och ner tar 4 sekunder (4000ms)
  const ambientAmplitude = 7; // Rör sig max 2%
  const startTime = performance.now() + ambientDelayMs;

  // Lyssna på skroll-hjulet och räkna ut "Base Y"
  window.addEventListener('scroll', () => {
      let currentScrollY = window.scrollY;
      let scrollDelta = currentScrollY - lastScrollY;
      
      if (currentScrollY <= 0) {
          baseY = 0;
      } else {
          let scrubDistance = window.innerHeight * 0.20; 
          let percentPerPixel = 77 / scrubDistance; 
            baseY -= (scrollDelta * percentPerPixel);
          
          // Kläm fast skrollet mellan -n% och 0%
          if (baseY < -77) baseY = -77;
          if (baseY > 0) baseY = 0;
      }
      lastScrollY = currentScrollY;
  });
  // Själva "Motorn" som uppdaterar skärmen (Render Loop)
  function renderLoop(currentTime) {
      let ambientY = 0;
      // Kolla om 2 sekunder har gått
      if (currentTime > startTime) {
          // Räkna ut var i loopen vi är
          let elapsed = currentTime - startTime;
          let cycleProgress = (elapsed % cycleDurationMs) / cycleDurationMs;
                    // Matematisk formel för att skapa en mjuk "Ease In Out" (Cosinus-våg)
          let waveFactor = (1 - Math.cos(cycleProgress * Math.PI * 2)) / 2;
                    // Omvandlar vågen till ett värde mellan 0 och -2%
          ambientY = waveFactor * -ambientAmplitude; 
      }
      // Slå ihop skrollets position med den flytande animationen
      let totalY = baseY + ambientY;
            // Applicera på bannern
      banner.style.transform = `translateY(${totalY}%)`;
      // Be webbläsaren köra loopen igen inför nästa bildruta
      requestAnimationFrame(renderLoop);
  }
  // Starta motorn!
  requestAnimationFrame(renderLoop);
});

// 2 TIMER DISPLAY
var Webflow = window.Webflow || [];
Webflow.push(function() {
 if (!document.getElementById('timer-display')) return; // not a game page, skip entirely
  let totalSeconds = 0;
  let timerInterval = null;
  window.FinalTimeStr = "00:00"; 
  window.FinalTimeSecs = 0;      
  window.TimerRunning = false;

  // 0. Rita 00:00 direkt, oavsett när räkningen faktiskt startar
  const displayElInit = document.getElementById('timer-display');
  if (displayElInit) {
    displayElInit.innerText = "00:00";
  }

  // 1. Starta lottie animationen (Tjuvstartar före siffrorna)
  setTimeout(function() {
    // Förhindra start om man på något sjukt sätt redan klickat Finish
    if (window.FinalTimeSecs > 0 || window.FinalTimeStr !== "00:00") return;
    // Starta Lottie via Webflows Custom Event
    const wfIx = Webflow.require("ix3") || Webflow.require("ix2");
    if (wfIx) {
        wfIx.emit("start-stopwatch"); 
        console.log("Lottie tjuvstartad!");
    }
  }, 2000);

  // 2. Starta siffror i timern
  setTimeout(function() {
    if (window.FinalTimeSecs > 0 || window.FinalTimeStr !== "00:00") return;
    window.TimerRunning = true;
    console.log("Siffrorna börjar rulla!");
    // Starta uppräkningen
    timerInterval = setInterval(function() {
      totalSeconds++;
      
      let minutes = Math.floor(totalSeconds / 60);
      let seconds = totalSeconds % 60;
      let minStr = String(minutes).padStart(2, '0');
      let secStr = String(seconds).padStart(2, '0');
      
      const displayEl = document.getElementById('timer-display');
      if (displayEl) {
        displayEl.innerText = minStr + ':' + secStr;
      }
      // Maxgräns (nöd-stopp) simulerar ett klick på Finish
      if (minutes >= 99 && seconds >= 59) {
        const finishBtn = document.getElementById('finish-btn');
        if(finishBtn) finishBtn.click(); 
      }
    }, 1000);
  }, 4400); // ÄNDRA HÄR: Tiden då siffrorna ska starta

// 3 LYSSNA PÅ FINISH-KNAPPEN (Dödar och klonar Lottien)
  function setupFinishListener() {
    const finishBtn = document.getElementById('finish-btn');
    
    if (finishBtn) {
      finishBtn.addEventListener('click', function() {
        // 1. Stoppa sifferräknaren
        clearInterval(timerInterval);
        window.TimerRunning = false; 
        // 2. DEN AUTOMATISKA KLONEN (Dödar Webflows kontroll)
        const lottieContainer = document.getElementById('stopwatch-lottie');
        if (lottieContainer) {
          const frozenSVG = lottieContainer.innerHTML;
          const frozenDiv = document.createElement('div');
          frozenDiv.className = lottieContainer.className; // Behåller din styling
          frozenDiv.innerHTML = frozenSVG;
          
          lottieContainer.parentNode.replaceChild(frozenDiv, lottieContainer);
          console.log("Lottien mördades och ersattes med en fryst klon!");
        }
        // 3. Spara sluttiden
        const finalDisplay = document.getElementById('timer-display');
        if (finalDisplay) window.FinalTimeStr = finalDisplay.innerText;
        window.FinalTimeSecs = totalSeconds;
        console.log("Avslutad! Sluttid:", window.FinalTimeStr);
      });
    } else {
      setTimeout(setupFinishListener, 200);
    }
  }
  setupFinishListener();
});

// 4 GAME ALTERNATIVE-ROW
document.addEventListener("DOMContentLoaded", function() {
  const scrollDuration = 400; 
  const topOffsetPercent = window.innerWidth < 600 ? 0.16 : 0.20;
  const animationDelay = 450;  // Väntar tills keyframe-animationen är klar

  const alternativeRows = document.querySelectorAll('.alternative-row');

  // ── LOCK: no answers selectable for the first 2s after page load ──
  alternativeRows.forEach(row => {
    row.style.pointerEvents = 'none';
  });
  setTimeout(() => {
    alternativeRows.forEach(row => {
      row.style.pointerEvents = 'auto';
    });
  }, 2000);

  alternativeRows.forEach(row => {
    // VIKTIGT: Vi lyssnar på 'mousedown' precis som ditt SFX-script! 
    // Då sker båda exakt samtidigt.
    row.addEventListener('mousedown', function(e) {
      const currentQuestionWrapper = this.closest('.question-wrapper');
      if (!currentQuestionWrapper) return;

      // 1. Nollställ ALLA checkboxar
      const allCheckboxesInQuestion = currentQuestionWrapper.querySelectorAll('.checkbox');
      allCheckboxesInQuestion.forEach(cb => {
        cb.classList.remove('is-active');
      });
      // 2. Aktivera den klickade
      const clickedCheckbox = this.querySelector('.checkbox');
      if (clickedCheckbox) {
        // Eftersom vi bytt till @keyframes behöver vi reflow-tricket.
        void clickedCheckbox.offsetWidth; 
        clickedCheckbox.classList.add('is-active');
      }
      // 3. Debounce Scroll (Väntar på att animationen gör klart sitt)
      if (currentQuestionWrapper.scrollTimeout) {
        clearTimeout(currentQuestionWrapper.scrollTimeout);
      }
      const currentTableRow = this.closest('.game-row-1');
      if (!currentTableRow) return;
      
      const nextTableRow = currentTableRow.nextElementSibling;
      
      if (nextTableRow) {
        currentQuestionWrapper.scrollTimeout = setTimeout(() => {
          const start = window.scrollY;
          const end = nextTableRow.getBoundingClientRect().top + window.scrollY - (window.innerHeight * topOffsetPercent);
          const distance = end - start;
          let startTime = null;

          function easeInOut(t) { 
            return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; 
          }
          function smoothScrollStep(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / scrollDuration, 1);
            window.scrollTo(0, start + distance * easeInOut(progress));
            
            if (progress < 1) {
              requestAnimationFrame(smoothScrollStep);
            }
          }

          requestAnimationFrame(smoothScrollStep);
        }, animationDelay);
      }
    });
  });
});




/* // --- HINDRA CTRL + SCROLL ZOOM ---
window.addEventListener('wheel', function(e) {
  if (e.ctrlKey) { e.preventDefault(); }
}, { passive: true });

// Auto scroll to top
if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }
window.addEventListener('load', function() {
  window.scrollTo(0, 0);
}); */
  
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
    science: {
        url: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/69b08a22396c27a611026d0c_The%20end%20of%20tyreen%20remix.mp3', 
        volume: 0.6,
        startTime: 0,
        fadeColor: '#000000'
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
    },
    terms: { 
        url: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/69b08a22396c27a611026d0c_The%20end%20of%20tyreen%20remix.mp3',
        volume: 0.0, 
        startTime: 19.482,
        fadeColor: '#000000'
    },
    privacy: { 
        url: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/69b08a22396c27a611026d0c_The%20end%20of%20tyreen%20remix.mp3',
        volume: 0.0, 
        startTime: 19.482,
        fadeColor: '#000000'
    }
};
function getTopicFromUrl(url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('science')) return 'science';
    if (lowerUrl.includes('gma')) return 'gma';
    if (lowerUrl.includes('cars')) return 'cars';
    if (lowerUrl.includes('history')) return 'history';
    if (lowerUrl.includes('uc')) return 'uc';
    if (lowerUrl.includes('terms')) return 'terms';  
    if (lowerUrl.includes('privacy')) return 'privacy';
    return 'lobby';
}
const currentTopicId = getTopicFromUrl(window.location.pathname);
const currentSlug = window.location.pathname.split('/').filter(Boolean).pop() || 'lobby';
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
// ── SFX VOLYMER (per ljud) ──
const SFX_VOLUMES = {
    finish: 0.9,
    select: 0.5,
    back: 0.9,
    qalt: 0.9,
    qaltminus2: 0.9,
    qaltminus4: 0.9,
    qaltminus6: 0.9,
    qaltminus8: 0.9,
    deny: 0.9
};
// ── QALT CYCLE CONFIG ──
let qaltIndex = 0; 
// Här sparar vi *namnet* på egenskapen (key) istället för url:en
const qaltKeys = ['qaltminus8', 'qaltminus6', 'qaltminus4', 'qaltminus2', 'qalt'];
// Sätt igång buffringen för alla ljud i SFX_CONFIG omedelbart
Object.entries(SFX_CONFIG).forEach(([key, url]) => preloadBuffer(key, url));
// ── BLIXTSNABB UPPSPELNING ──
function playSFX(type, vol) {
    if (sfxCtx.state === 'suspended') sfxCtx.resume();
    let bufferKey = type;
    // Snurra index för qalt-ljuden
    if (type === 'qalt') {
        bufferKey = qaltKeys[qaltIndex];
        qaltIndex = (qaltIndex + 1) % qaltKeys.length;
    }
    const finalVol = vol !== undefined ? vol : (SFX_VOLUMES[bufferKey] ?? 0.9);
    const buffer = sfxBuffers[bufferKey];
    if (buffer) {
        const source = sfxCtx.createBufferSource();
        const gainNode = sfxCtx.createGain();
        
        source.buffer = buffer;
        gainNode.gain.value = finalVol;
        
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
// ── BACK BUTTON: Skip intro on return to lobby ────────────────────
window.addEventListener('pageshow', (event) => {
    // Tvinga variabeln till false och rensa gamla klasser DIREKT för att döda dubbelklick-buggen
    applyMuteState(false);
    
    // Only handle intro skip on lobby
    const isLobby = currentTopicId === 'lobby';
    const navEntry = performance.getEntriesByType("navigation")[0];
    const isBack = (navEntry && navEntry.type === "back_forward") || event.persisted;
    
    if (isLobby && isBack && sessionStorage.getItem('skipIntro') === 'true') {
        // Intro overlay is already hidden by the skipIntro flag
        sessionStorage.removeItem('skipIntro'); // Clear it so it doesn't re-fire
        return; // Skip audio timing logic below
    }
    
    // Hantera tider när man navigerar runt (länk eller backa) — ONLY for non-lobby or when NOT skipping
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
const savedColor = sessionStorage.getItem('exitColor');
const bodyTheme  = document.body.getAttribute('data-theme');
const initColor  = savedColor || (bodyTheme === 'light' ? '#ffffff' : '#000000');
overlay.style.background = initColor;
document.body.appendChild(overlay);

window.addEventListener('pageshow', () => {
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

// ── GLOBAL EXIT FUNCTION ─────────────────────────────
window.triggerPageExit = function(url, isSlowFinish = false, isFinishBtn = false) {
    sessionStorage.setItem('navFrom', currentSlug);
    if (isFinishBtn) sessionStorage.setItem('scoreAuthorized', 'true');
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

    const fadeSpeed = isSlowFinish ? '2s' : '0.8s';

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
                        window.location.href = url;
                    }, 1345); 
                }, 800);
            } else {
                const waitTime = isSlowFinish ? 2000 : 800; //set 1000 to 800 as well?
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
    if (!href || href === '#' || href.startsWith('#') || link.classList.contains('is-password') || link.closest('.pp-dropdown, .i-closer-game, .button.i-lobby-back, .games-link-block')) return;
    e.preventDefault();

    /* const isFinishBtn = link.id && link.id.startsWith('finish-btn-'); */

    if (link.id === 'boss-level') {
        setTimeout(() => window.triggerPageExit(href, false), 1000);
    } 
    /* else if (isFinishBtn) {
        setTimeout(() => window.triggerPageExit(href, true, true), 200);
    }  */
    else {
        setTimeout(() => window.triggerPageExit(href, false), 200);
    }
});

// ── KEYBOARD LISTENER FÖR INTRO (ENTER/SPACE) ─────────────────────────
let triggered = false;
document.addEventListener("keydown", function(e) {
  if (triggered) return;
  // NEW: Block if any modal is open (create-profile, login, etc)
  const blockingModals = [
    '.login-modal-wrapper',
    '.create-profile',
    '.change-username'
  ];
  
  for (let selector of blockingModals) {
    const modal = document.querySelector(selector);
    if (modal && window.getComputedStyle(modal).display !== 'none') {
      return; // Exit early - don't trigger intro
    }
  }
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



// ── AUTO-FOCUS & SCROLL-TOP FÖR OVERLAYS (STABIL VERSION) ──────────────────
(function() {
  const isOverlayOpen = {}; // Spårning för att undvika "dubbelkörning"

  function fakeClick() {
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    const el = document.elementFromPoint(x, y);

    console.log('fakeClick: center element', el ? el.tagName + ' ' + (el.className || '') : null);
    const skipReasonEl = el ? el.closest('.pp-dropdown, .i-closer-game, .button.i-lobby-back, .profile-pic-option, .pp-grid-wrapper') : null;
    console.log('fakeClick: closest skip element:', skipReasonEl);

    if (!el) return;

    // Hoppa över om det landar på pp-dropdown eller dess close-triggers
    // (annars stänger detta dropdownen ~150ms efter att den öppnats)
    if (skipReasonEl) {
      console.log('fakeClick: skipping because center element matches skip selector');
      return;
    }

    // Mark that a synthetic-click sequence is running so real handlers can ignore it
    window.__syntheticClickRunning = true;

    ['mousedown', 'mouseup', 'click'].forEach(type => {
      const evt = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
      evt._synthetic = true;
      try {
        el.dispatchEvent(evt);
        console.log('fakeClick: dispatched', type, 'to', el);
      } catch (err) {
        console.warn('fakeClick: dispatch error', err);
      }
    });

    // Clear the flag after a short delay (handlers should check this flag)
    setTimeout(() => {
      window.__syntheticClickRunning = false;
      console.log('fakeClick: synthetic flag cleared');
    }, 80);
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
    const overlays = document.querySelectorAll('.rules-overlay, .leaderboard-overlay, .about-overlay');
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
// ── GLOBAL CLICK DELAY prevents double-clicking and spamming buttons  ────────────────────────────────────────────────
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
    if (e.key !== 'Tab') return;
          
    if (e.target.closest('.form-block-contact')) {
            return; // innuti, gör inget, låt Tab bete sig normalt
        }
        e.preventDefault(); // utanför formuläret: blockera Tab helt
     
}, true); // 'true' gör att den fångar tangenten direkt innan något annat händer

// ══════════════════════════════════════════════════════════════════════
// GENERISKT HOVER- & PRESS-SCALE-SYSTEM
// Ersätter individuella Webflow IX2 hover/click-scale-interactions.
// Lägg bara till/ta bort klassnamn i listorna nedan - ingen ny IX2 behövs
// för nya element, bara lägg till klassen i rätt lista här.
// ══════════════════════════════════════════════════════════════════════
 
// Klasser som ska skalas upp till 1.15 vid hover (stor effekt)
const HOVER_SCALE_CLASSES = [
    'cp-exit',
    'games-link-block',
    'link-to-lobby',
    'q-logo',
    'burger-links',
    'fcp-link',
    'fat-cat-logo',
    'submit-button',
    'button',
    'button-link',
    'game-start-btn-gma',
    'finish-btn',    
    'share-score-btn',
    'link-next-challenge',
    'link-review-answers',
    'inventory-btn-wrapper',
    'logout-btn',
    'button.i-lobby-back',
    'cp-submit-btn',
    'profile-pic-option',
    'current-profile-pic',
    'login-modal-btn',
    'game-level',
    'gamelvl-btn'
];

// Klasser som ska skalas upp till 1.08 vid hover (subtil effekt)
const HOVER_SCALE_CLASSES_SM = [
    'wtc-wrapper'
];

// Klasser som ska ändra scale vid press (pointerdown -> pointerup)
const PRESS_SCALE_CLASSES = [
    'cp-exit',
    'games-link-block',
    'link-to-lobby',
    'q-logo',
    'burger-links',
    'submit-button',
    'button',
    'button-link',
    'game-start-btn-gma',
    'finish-btn',    
    'share-score-btn',
    'link-next-challenge',
    'link-review-answers',
    'logout-btn',
    'button.i-lobby-back',
    'cp-submit-btn',
    'profile-pic-option',
    'current-profile-pic',
    'login-modal-btn',
    'dropdown-toggle-lvl',
    'game-level',
    'gamelvl-btn'
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
            const CLICK_BLOCK_DURATION_MS = 350; // safety auto-clear window

            const doRelease = () => {
            el.classList.remove('is-pressed-down');
            el.classList.remove('is-pressed-up');
            el.classList.remove('is-hovered');
            el.classList.add('is-click-blocked');
            releaseTimeoutId = null;

            // NEW: guarantee this clears itself even if mouseleave never fires
            if (el._clickBlockTimeout) clearTimeout(el._clickBlockTimeout);
            el._clickBlockTimeout = setTimeout(() => {
                el.classList.remove('is-click-blocked');
            }, CLICK_BLOCK_DURATION_MS);
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

const SCROLL_PULSE_DELAY_MS = 700;
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


// ── SCORE PAGE: DISPLAY RESULTS ─────────────────────────────────
var Webflow = window.Webflow || [];
Webflow.push(function() {
  const resultDataRaw = sessionStorage.getItem('lastGameResult');
  if (!resultDataRaw) return; // not arriving from a finished game, skip entirely

  let data;
  try {
    data = JSON.parse(resultDataRaw);
  } catch (err) {
    console.error("Kunde inte tolka spelresultatet:", err);
    return;
  }

  // Topic name
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('list-game', data.topic.toUpperCase());
  setText('list-result', `${data.correctCount}/${data.totalQuestions}`);
  setText('list-time', data.timeStr);
  setText('list-attempts', data.attemptCount - 1);
  setText('list-leaderboard', `${data.leaderboardPosition}/100`);
  setText('list-score', data.finalScore);
  setText('list-unlimited-score', data.unlimitedScore);

  // Clean up so a page refresh doesn't redisplay stale results
  sessionStorage.removeItem('lastGameResult');

     // ── LEVEL UP POPUP ──
  if (data.levelsGained > 0) {
    const wfIx = Webflow.require("ix3") || Webflow.require("ix2");
    const levelUpEl = document.querySelector('.level-up');

    if (wfIx && levelUpEl) {
      let remaining = data.levelsGained;

      const popNext = () => {
        if (remaining <= 0) return;
        remaining--;
        wfIx.emit("lvlup");
      };

      // Watch for the popup closing (display: none) to chain the next one
      const observer = new MutationObserver(() => {
        const isHidden = window.getComputedStyle(levelUpEl).display === 'none';
        if (isHidden && remaining > 0) {
          setTimeout(popNext, 500);
        }
      });
      observer.observe(levelUpEl, { attributes: true, attributeFilter: ['style', 'class'] });

      setTimeout(popNext, 13000);
    }
  }
});