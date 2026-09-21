document.addEventListener("DOMContentLoaded", () => {
  // 1. Get the current page URL path (e.g., "/Science-game-1" -> "Science-game-1")
  const path = window.location.pathname.replace(/^\/|\/$/g, "");
  if (!path) return; // Skip home/root page

  // 2. Parse slug parts assuming pattern: [Topic]-[start OR game-N]
  const parts = path.split("-");
  
  // Format topic name (e.g., "gma" -> "GMA", "science" -> "Science")
  let topicName = parts[0];
  topicName = topicName.length <= 3 
    ? topicName.toUpperCase() 
    : topicName.charAt(0).toUpperCase() + topicName.slice(1);

  // 3. Find or create the meta description element
  let metaDescription = document.querySelector('meta[name="description"]');
  if (!metaDescription) {
    metaDescription = document.createElement("meta");
    metaDescription.name = "description";
    document.head.appendChild(metaDescription);
  }

  // 4. Check page type and inject the corresponding copy
  if (path.includes("-start")) {
    // --- GAME START PAGE ---
    document.title = `${topicName} Quiz & Trivia - Quiz Gamer`;
    
    metaDescription.setAttribute(
      "content",
      `Test your knowledge about ${topicName}, on Quiz Gamer. Play a game with interactive questions or solve puzzles. See how you fare on the global leaderboards!`
    );

  } else if (path.includes("-game-")) {
    // --- GAME LEVEL PAGE ---
    const levelNumber = parts[parts.length - 1]; // Extracts the level number
    document.title = `${topicName} Level ${levelNumber} - Quiz Gamer`;
    
    metaDescription.setAttribute(
      "content",
      `Play ${topicName} Level ${levelNumber} on Quiz Gamer. Race against the clock, answer questions or solve puzzles. Claim a spot on the global leaderboards!`
    );
  }
});