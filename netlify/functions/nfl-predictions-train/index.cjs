const BUNDLE_VERSION = 'predictions-2025-09-12-v8';

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      action: 'skipped',
      reason: 'Live autobuild now performed by SCORE; TRAIN retained for future weekly batch learning.',
      BUNDLE_VERSION
    })
  };
};