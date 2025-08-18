import { getStore } from "@netlify/blobs";

export default async (req, res) => {
  try {
    const store = getStore(process.env.BLOBS_STORE || "mlb-odds");
    const snap = await store.get("latest.json");
    if (!snap) return res.json({ ok: false, error: "no snapshot for latest.json" });
    return res.json(snap);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};