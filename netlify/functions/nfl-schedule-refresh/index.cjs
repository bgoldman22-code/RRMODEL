
'use strict';
const { getStore } = require('@netlify/blobs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow one redirect
        return fetchURL(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

function isScheduleShape(obj) {
  return obj && typeof obj === 'object' && obj.season && obj.weeks && typeof obj.weeks === 'object';
}

exports.handler = async (event) => {
  try {
    const qs = (event && event.queryStringParameters) || {};
    const season = qs.season ? parseInt(qs.season, 10) : 2025;
    const commit = String(qs.commit || 'false').toLowerCase() === 'true';
    let schedule = null;
    let source = null;

    if (event.httpMethod === 'POST') {
      if (!event.body) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'POST body required (application/json)' }) };
      schedule = JSON.parse(event.body);
      if (!isScheduleShape(schedule)) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Body is not in {season, weeks} shape' }) };
      source = 'body';
    } else if (qs.source) {
      const raw = await fetchURL(qs.source);
      const parsed = JSON.parse(raw);
      if (!isScheduleShape(parsed)) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Fetched JSON is not in {season, weeks} shape' }) };
      schedule = parsed;
      source = qs.source;
    } else {
      return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Provide POST body JSON or ?source=<url> to import' }) };
    }

    // Normalize season
    schedule.season = season;

    const store = getStore({ name: 'schedules' });
    const blobKey = `${season}/full.json`;

    if (commit) {
      await store.set(blobKey, JSON.stringify(schedule), { contentType: 'application/json; charset=utf-8' });
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok:true, season, wrote: commit, blobKey, source, weeks: Object.keys(schedule.weeks || {}).length })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(err && err.message ? err.message : err) }) };
  }
};

