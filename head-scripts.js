// ----- TRY DISABLE AUTO TRANSLATION NAGGING POPUPS -------
document.documentElement.setAttribute('translate', 'no');

// ------- DISABLE SCROLL RESTORATION (START AT TOP) ------------
if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }

// ------- MEDIA SESSION. WEBCLIP FIX ------------
if ('mediaSession' in navigator) {
   navigator.mediaSession.metadata = new MediaMetadata({
     title: 'Quizgamer',
     artwork: [
      { src: 'https://cdn.prod.website-files.com/693d8d6b18be20357a9cf397/6a9dac5afedc3bbdf45ec827_webclip2.png', sizes: '512x512', type: 'image/png' }
    ]
   });
}

// ---------- META DESCRIPTION AND PAGE TITLE -----------
// 4. Dynamic Meta Description & Page Title (Runs immediately in head)
(function updateDynamicMeta() {
  const path = window.location.pathname.replace(/^\/|\/$/g, "");
  if (!path) return;

  const parts = path.split("-");
  let topicName = parts[0];
  topicName = topicName.length <= 3 
    ? topicName.toUpperCase() 
    : topicName.charAt(0).toUpperCase() + topicName.slice(1);

  let metaDescription = document.querySelector('meta[name="description"]');
  if (!metaDescription) {
    metaDescription = document.createElement("meta");
    metaDescription.name = "description";
    document.head.appendChild(metaDescription);
  }

  if (path.includes("-start")) {
    document.title = `${topicName} - Quiz Gamer`;
    metaDescription.setAttribute(
      "content",
      `Test your knowledge about ${topicName}, on Quiz Gamer. Play a game with interactive questions or solve puzzles. See how you fare on the global leaderboards!`
    );
  } else if (path.includes("-game-")) {
    const levelNumber = parts[parts.length - 1];
    document.title = `${topicName} Level ${levelNumber} - Quiz Gamer`;
    metaDescription.setAttribute(
      "content",
      `Play ${topicName} Level ${levelNumber} on Quiz Gamer. Race against the clock, answer questions or solve puzzles. Claim a spot on the global leaderboards!`
    );
  }
})();

// -------- Load Lottie Player library dynamically ---------
if (!document.querySelector('script[src*="lottie-player"]')) {
  const lottieScript = document.createElement('script');
  lottieScript.src = 'https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js';
  document.head.appendChild(lottieScript);
}