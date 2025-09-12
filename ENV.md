# ENV checklist

Required (normally auto-injected by Netlify):
- `NETLIFY_SITE_ID`
- (Edge/Functions runtime often auto-provides blobs context)

If you see errors about missing blobs context, add:
- `NETLIFY_BLOBS_TOKEN` (a valid site or personal token)

Optional:
- `BLOBS_STORE_NFL` (default: `rrmodelblobs`)

Nothing else needs to be removed for this patch. Focus is on using `@netlify/blobs` correctly.
