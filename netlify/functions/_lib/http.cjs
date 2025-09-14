'use strict';

/**
 * Small helpers to always return a valid Netlify Lambda response.
 */

const defaultHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

function json(statusCode, data, extraHeaders = {}) {
  let body;
  try {
    body = JSON.stringify(data);
  } catch (err) {
    // last resort: stringify a safe error
    body = JSON.stringify({ ok: false, error: 'serialize_failed', details: String(err && err.message || err) });
    statusCode = statusCode >= 400 ? statusCode : 500;
  }
  return {
    statusCode: Number.isInteger(statusCode) ? statusCode : 200,
    headers: { ...defaultHeaders, ...extraHeaders },
    body
  };
}

function ok(data = { ok: true }, headers = {}) {
  return json(200, data, headers);
}

function badRequest(message = 'bad_request', details = {}) {
  return json(400, { ok: false, error: message, details });
}

function internalError(err) {
  const message = (err && err.message) || String(err);
  const stack = (err && err.stack) || undefined;
  return json(500, { ok: false, error: 'internal_error', message, stack });
}

module.exports = { json, ok, badRequest, internalError, defaultHeaders };
