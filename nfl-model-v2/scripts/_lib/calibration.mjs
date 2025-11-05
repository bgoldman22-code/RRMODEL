/**
 * NFL Model V4 - Calibration Utilities
 * 
 * Helper functions for loading and applying isotonic calibration
 */

import fs from 'fs/promises';
import path from 'path';

let calibrationMap = null;

/**
 * Load isotonic calibration map from file
 */
export async function loadCalibration(calibrationPath) {
  try {
    const data = await fs.readFile(calibrationPath, 'utf-8');
    const json = JSON.parse(data);
    calibrationMap = json.isotonic_map;
    return calibrationMap;
  } catch (error) {
    console.warn(`⚠️  Could not load calibration map: ${error.message}`);
    return null;
  }
}

/**
 * Apply isotonic calibration to a probability
 * Uses linear interpolation between calibration points
 */
export function applyIsotonic(prob, map = calibrationMap) {
  if (!map || map.length === 0) return prob;
  
  // Clamp to calibration range
  if (prob <= map[0].x) return map[0].y;
  if (prob >= map[map.length - 1].x) return map[map.length - 1].y;
  
  // Find interpolation range
  for (let i = 0; i < map.length - 1; i++) {
    if (prob >= map[i].x && prob <= map[i + 1].x) {
      // Linear interpolation
      const t = (prob - map[i].x) / (map[i + 1].x - map[i].x);
      return map[i].y + t * (map[i + 1].y - map[i].y);
    }
  }
  
  // Fallback
  return prob;
}

/**
 * Check if calibration is loaded
 */
export function isCalibrationLoaded() {
  return calibrationMap !== null && calibrationMap.length > 0;
}

/**
 * Get calibration diagnostics
 */
export function getCalibrationInfo() {
  if (!calibrationMap) return null;
  
  return {
    loaded: true,
    num_bins: calibrationMap.length,
    min_prob: calibrationMap[0]?.x || 0,
    max_prob: calibrationMap[calibrationMap.length - 1]?.x || 1
  };
}
