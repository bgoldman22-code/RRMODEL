/**
 * Enhanced NBA Health Check Endpoint
 * Returns detailed status of all data sources with metadata
 * 
 * Updated: November 12, 2025
 * Includes: schema, recordCount, teamSetCount, gamesSpanDays, feature flags
 */

import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';
import { BLOB_SCHEMA_VERSION, FEATURE_FLAGS, TTL } from './lib/constants.mjs';

export default async function handler(event, context) {
  const health = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {},
    metadata: {
      blobSchemaVersion: BLOB_SCHEMA_VERSION,
      featureFlags: FEATURE_FLAGS
    }
  };
  
  // ==========================================================================
  // Check 1: Netlify Blobs (enhanced with metadata)
  // ==========================================================================
  
  try {
    const store = getStore('nba-data');
    const key = `player-boxscores-current.v${BLOB_SCHEMA_VERSION}`;
    const raw = await store.get(key);
    
    if (!raw) {
      health.checks.blobs = { status: 'missing' };
      health.status = 'degraded';
    } else {
      const data = JSON.parse(raw);
      const age = Date.now() - new Date(data.lastUpdated).getTime();
      const ageHours = Math.round(age / 3600000);
      const ageMinutes = Math.round((age % 3600000) / 60000);
      
      // Determine if stale based on TTL
      const isGameDay = ageHours < 8; // Rough estimate
      const ttl = isGameDay ? TTL.GAME_DAY_MS : TTL.OFF_DAY_MS;
      const isStale = age > ttl;
      
      health.checks.blobs = {
        status: isStale ? 'stale' : 'ok',
        schema: data.schema,
        schemaMatch: data.schema === BLOB_SCHEMA_VERSION,
        ageHours,
        ageMinutes,
        lastUpdated: data.lastUpdated,
        recordCount: data.recordCount || 0,
        teamSetCount: data.teamSet?.length || 0,
        gamesSpanDays: data.gamesSpanDays || 0,
        source: data.source || 'unknown',
        teamSet: data.teamSet || []
      };
      
      // Degrade status if stale or schema mismatch
      if (isStale || data.schema !== BLOB_SCHEMA_VERSION) {
        health.status = 'degraded';
      }
    }
  } catch (err) {
    health.checks.blobs = { 
      status: 'error', 
      error: err.message 
    };
    health.status = 'degraded';
  }
  
  // ==========================================================================
  // Check 2: ESPN API
  // ==========================================================================
  
  try {
    const start = Date.now();
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { timeout: 5000 }
    );
    const latency = Date.now() - start;
    
    health.checks.espn = {
      status: response.ok ? 'ok' : 'error',
      latencyMs: latency,
      statusCode: response.status
    };
    
    // Warn if slow or unavailable
    if (!response.ok || latency > 3000) {
      health.status = 'degraded';
    }
  } catch (err) {
    health.checks.espn = { 
      status: 'error', 
      error: err.message 
    };
    health.status = 'degraded';
  }
  
  // ==========================================================================
  // Check 3: NBA CDN
  // ==========================================================================
  
  try {
    const start = Date.now();
    const response = await fetch(
      'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json',
      { timeout: 5000 }
    );
    const latency = Date.now() - start;
    
    health.checks.nbaCdn = {
      status: response.ok ? 'ok' : 'error',
      latencyMs: latency,
      statusCode: response.status
    };
    
    // CDN is optional (Tier 2.5), so don't degrade if down
  } catch (err) {
    health.checks.nbaCdn = { 
      status: 'error', 
      error: err.message 
    };
  }
  
  // ==========================================================================
  // Check 4: Opponent Defense Data
  // ==========================================================================
  
  try {
    const { default: opponentDefense } = await import('../../data/nba/opponent-defense/2025-26.json', {
      assert: { type: 'json' }
    });
    
    if (!opponentDefense || opponentDefense.length === 0) {
      health.checks.opponentDefense = { status: 'missing' };
      health.status = 'degraded';
    } else {
      const lastUpdated = opponentDefense[0]?.lastUpdated;
      const age = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : Infinity;
      const ageHours = Math.round(age / 3600000);
      
      health.checks.opponentDefense = {
        status: age < 48 * 3600000 ? 'ok' : 'stale',
        ageHours,
        lastUpdated,
        teamCount: opponentDefense.length,
        teams: opponentDefense.map(t => t.team).sort()
      };
      
      // Degrade if data is >72h old
      if (age > 72 * 3600000) {
        health.status = 'degraded';
      }
    }
  } catch (err) {
    health.checks.opponentDefense = { 
      status: 'missing', 
      error: err.message 
    };
    health.status = 'degraded';
  }
  
  // ==========================================================================
  // Check 5: Team Info (static, should always be available)
  // ==========================================================================
  
  try {
    const { default: teamInfo } = await import('../../data/nba/teams/team-info.json', {
      assert: { type: 'json' }
    });
    
    health.checks.teamInfo = {
      status: teamInfo?.teams?.length === 30 ? 'ok' : 'invalid',
      teamCount: teamInfo?.teams?.length || 0
    };
    
    if (teamInfo?.teams?.length !== 30) {
      health.status = 'degraded';
    }
  } catch (err) {
    health.checks.teamInfo = { 
      status: 'error', 
      error: err.message 
    };
    health.status = 'degraded';
  }
  
  // ==========================================================================
  // Return response
  // ==========================================================================
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    },
    body: JSON.stringify(health, null, 2)
  };
}
