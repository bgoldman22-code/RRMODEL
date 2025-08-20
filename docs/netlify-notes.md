# Netlify build stability checklist

1) Ensure Node runtime 20:
   - You already set env `NODE_VERSION=20` (good).

2) package.json must include:
   {
     "scripts": {
       "dev": "vite",
       "build": "vite build",
       "preview": "vite preview"
     },
     "type": "module"
   }

3) If you use Netlify Functions, your `netlify.toml` can keep:
   [functions]
   node_bundler = "esbuild"
   external_node_modules = ["@netlify/blobs"]

4) Avoid mixing CJS in the React app. (All files here are ESM.)
