/**
 * Export utilities for PNG generation
 * Handles iOS share sheet vs desktop download
 */

import html2canvas from 'html2canvas';

/**
 * Check if we're on iOS Safari
 */
export function isIOSSafari() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isIOS || (isIOS && isSafari);
}

/**
 * Check if we're on mobile
 */
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Check if file sharing via navigator.share is supported
 */
export function supportsFileSharing() {
  return typeof navigator !== 'undefined' && 
         typeof navigator.share === 'function' && 
         typeof navigator.canShare === 'function';
}

/**
 * Convert data URL to Blob
 */
function dataURLToBlob(dataURL) {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Export element to PNG with iOS share sheet support
 * 
 * @param {HTMLElement} element - The element to capture
 * @param {string} filename - The filename (without extension)
 * @param {object} options - html2canvas options
 * @returns {Promise<void>}
 */
export async function exportToPNG(element, filename, options = {}) {
  if (!element) {
    throw new Error('No element provided for export');
  }

  // Default options
  const canvasOptions = {
    backgroundColor: '#ffffff',
    scale: 2,
    width: 900,
    windowWidth: 900,
    ...options
  };

  // Generate canvas
  const canvas = await html2canvas(element, canvasOptions);
  const dataURL = canvas.toDataURL('image/png');
  const fullFilename = `${filename}.png`;

  // Try iOS share sheet on mobile
  if (isMobile() && supportsFileSharing()) {
    try {
      const blob = dataURLToBlob(dataURL);
      const file = new File([blob], fullFilename, { type: 'image/png' });

      // Check if we can share this file
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        });
        return; // Success via share sheet
      }
    } catch (error) {
      // If share was cancelled or failed, fall through to download
      if (error.name !== 'AbortError') {
        console.log('Share failed, falling back to download:', error);
      } else {
        // User cancelled share - don't fall through
        return;
      }
    }
  }

  // Fallback: Download via link click (desktop or share not supported)
  const link = document.createElement('a');
  link.download = fullFilename;
  link.href = dataURL;
  link.click();
}
