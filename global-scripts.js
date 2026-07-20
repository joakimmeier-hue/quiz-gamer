// ── SMART BLUR OVERLAY MANAGER ──────────────────────────────────────────
// Create single blur overlay if it doesn't exist
function initBlurOverlay() {
  let blurOverlay = document.querySelector('.blur-overlay');
  if (!blurOverlay) {
    blurOverlay = document.createElement('div');
    blurOverlay.className = 'blur-overlay';
    document.body.appendChild(blurOverlay);
  }
  
  // Priority order (highest z-index = highest priority to show blur)
  const MODAL_PRIORITY = [
    { selector: '.create-profile', expectedZ: 999 },
    { selector: '.login-modal-wrapper', expectedZ: 999 },
    { selector: '.change-username', expectedZ: 999 },
    { selector: '.intro-overlay-grp', expectedZ: 997 }
  ];
  
  function updateBlurOverlay() {
    // Find the HIGHEST visible modal (by actual z-index)
    let topModal = null;
    let highestZ = -1;
    
    MODAL_PRIORITY.forEach(({ selector }) => {
      const modal = document.querySelector(selector);
      if (!modal) return;
      
      const style = window.getComputedStyle(modal);
      const isVisible = style.display !== 'none' && parseFloat(style.opacity) > 0.1;
      
      if (isVisible) {
        const modalZ = parseInt(style.zIndex) || 0;
        if (modalZ > highestZ) {
          highestZ = modalZ;
          topModal = modal;
        }
      }
    });
    
    if (topModal) {
      // Set blur to sit JUST BELOW the topmost modal
      const blurZ = highestZ - 1;
      blurOverlay.style.zIndex = blurZ.toString();
      blurOverlay.classList.add('is-active');
      console.log(`Blur active: z-index ${blurZ} (modal z-index: ${highestZ})`);
    } else {
      blurOverlay.classList.remove('is-active');
      console.log('Blur inactive: no visible modals');
    }
  }
  
  // Check immediately on init
  updateBlurOverlay();
  
  // Check every 100ms (catches all visibility changes)
  setInterval(updateBlurOverlay, 100);
  
  // Also check on clicks (faster response)
  document.addEventListener('click', updateBlurOverlay);
  
  // Also check on style changes
  document.addEventListener('change', updateBlurOverlay);
}

// Run after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBlurOverlay);
} else {
  initBlurOverlay();
}