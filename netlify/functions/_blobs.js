// netlify/functions/_blobs.js
// Minimal helper around @netlify/blobs using the stable getStore() API.
// This replaces any previous custom Blobs wrappers that used `new Blobs(...)`
// or store.put().

const { getStore } = require('@netlify/blobs');

const storeName = process.env.BLOBS_STORE_NFL || 'rrmodelblobs';
const store = getStore({
  name: storeName,
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_BLOBS_TOKEN
});

const safeJSONParse = (input, defaultValue = null) => {
  try {
    return JSON.parse(input);
  } catch (err) {
    console.error(`Failed to parse JSON: ${err && err.message ? err.message : err}`);
    return defaultValue;
  }
};

/**
 * Reads a JSON object from the Netlify Blobs store.
 * @param {string} key The key of the blob to retrieve.
 * @returns {object|null} The parsed JSON object, or null if not found or an error occurs.
 */
exports.get = async (key) => {
  try {
    const rawData = await store.get(key, { type: 'text' });
    if (!rawData) {
      console.log(`Blob key "${key}" not found.`);
      return null;
    }
    const data = safeJSONParse(rawData);
    if (!data) {
      console.warn(`Data for key "${key}" was corrupted.`);
      return null;
    }
    return data;
  } catch (err) {
    console.error(`Error getting blob "${key}":`, err && err.message ? err.message : err);
    return null;
  }
};

/**
 * Writes a JSON object to the Netlify Blobs store.
 * @param {string} key The key to store the blob under.
 * @param {object} value The JSON object to store.
 * @returns {boolean} True if the write was successful, false otherwise.
 */
exports.set = async (key, value) => {
  try {
    const serializedData = JSON.stringify(value);
    await store.set(key, serializedData);
    console.log(`Successfully wrote blob to key "${key}".`);
    return true;
  } catch (err) {
    console.error(`Error setting blob "${key}":`, err && err.message ? err.message : err);
    return false;
  }
};

/**
 * Deletes a blob from the Netlify Blobs store.
 * @param {string} key The key of the blob to delete.
 * @returns {boolean} True if the delete was successful, false otherwise.
 */
exports.del = async (key) => {
  try {
    await store.delete(key);
    console.log(`Successfully deleted blob for key "${key}".`);
    return true;
  } catch (err) {
    console.error(`Error deleting blob "${key}":`, err && err.message ? err.message : err);
    return false;
  }
};
