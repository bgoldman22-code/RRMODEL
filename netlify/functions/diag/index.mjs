export const handler = async () => {
  const safeEnv = {};
  const allow = ['NODE_VERSION','NODE_ENV','BLOBS_STORE','BLOBS_STORE_NFL','NETLIFY','SITE_NAME','URL','DEPLOY_ID','CONTEXT'];
  for (const k of allow) if (process.env[k]) safeEnv[k] = process.env[k];
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      versions: process.versions,
      platform: { platform: process.platform, arch: process.arch },
      env: safeEnv,
      now: new Date().toISOString()
    })
  };
};
