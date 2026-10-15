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

// -------- Load Lottie Player library dynamically ---------
/* if (!document.querySelector('script[src*="lottie-player"]')) {
  const lottieScript = document.createElement('script');
  lottieScript.src = 'https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js';
  document.head.appendChild(lottieScript);
} */