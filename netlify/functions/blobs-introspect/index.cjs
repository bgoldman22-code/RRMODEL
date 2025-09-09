// netlify/functions/blobs-introspect/index.cjs
const blobs = require('@netlify/blobs');
const { getBlobsStore } = require('../_blobs.js');

exports.handler = async () => {
  const keys = Object.keys(blobs || {});
  let version = null;
  try {
    version = require('../../package.json')?.dependencies?.['@netlify/blobs'] 
           || require('../../package.json')?.devDependencies?.['@netlify/blobs'] 
           || null;
  } catch {}

  const info = {
    node: process.version,
    blobsKeys: keys,
    declaredVersion: version,
  };

  try {
    const s = getBlobsStore('nfl-td');
    info.helper = 'ok';
  } catch (e) {
    info.helper = String(e);
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, info }) };
};
