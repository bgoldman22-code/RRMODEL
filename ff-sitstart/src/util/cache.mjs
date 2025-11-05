import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '../../.cache');

// Ensure cache directory exists
await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});

export class Cache {
  static getCachePath(key) {
    return path.join(CACHE_DIR, `${key}.json`);
  }
  
  static async get(key) {
    try {
      const cachePath = this.getCachePath(key);
      const data = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(data);
      
      const age = Date.now() - cached.timestamp;
      if (age > CONFIG.cache.ttlSeconds * 1000) {
        return null; // Expired
      }
      
      return cached.data;
    } catch (error) {
      return null; // Cache miss
    }
  }
  
  static async set(key, data) {
    try {
      const cachePath = this.getCachePath(key);
      const cached = {
        timestamp: Date.now(),
        data
      };
      await fs.writeFile(cachePath, JSON.stringify(cached, null, 2));
    } catch (error) {
      // Silent fail on cache write errors
    }
  }
  
  static async clear(key) {
    try {
      const cachePath = this.getCachePath(key);
      await fs.unlink(cachePath);
    } catch (error) {
      // Silent fail
    }
  }
  
  static async clearAll() {
    try {
      const files = await fs.readdir(CACHE_DIR);
      await Promise.all(
        files.map(file => fs.unlink(path.join(CACHE_DIR, file)))
      );
    } catch (error) {
      // Silent fail
    }
  }
}
