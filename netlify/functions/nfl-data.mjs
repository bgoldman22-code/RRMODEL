// netlify/functions/nfl-data.mjs
import { openStore } from "./_lib/blobs-helper.mjs";
import { ok, err } from "./_lib/respond.js";

export const handler = async (event) => {
  const type = event.queryStringParameters?.type;

  const store = openStore("nfl");

  if (type === "schedule") {
    // Try pointer then week1 fallback
    const pointer = await (await store).get("schedule.json", { type: "json" });
    if (pointer?.ref) {
      const doc = await (await store).get(pointer.ref, { type: "json" });
      if (doc) return ok({ type, doc });
    }
    // Fallback attempt: week1 2025
    const doc = await (await store).get("weeks/2025/1/schedule.json", { type: "json" });
    if (doc) return ok({ type, doc, fallback: true });
    return err("no data");
  }

  return err("unknown type");
};