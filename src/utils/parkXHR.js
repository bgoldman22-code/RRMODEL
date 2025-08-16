// src/utils/parkXHR.js
export const ENABLE_PARK_XHR = false; // feature flag (default OFF)

// Placeholder that returns neutral scaler (1.00) until a grid is wired in.
export function parkXhrProb({ ev=null, la=null, batterHand=null, parkMeta=null }){
  // In future, use parkMeta.xhr_grid, parkMeta.park_factor_hr_lhh/rhh, etc.
  return 1.00;
}
