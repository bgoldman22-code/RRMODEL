// netlify/functions/_ml/nfl-model.mjs
import { OnlineLogistic, OnlineLinear } from "./online-models.mjs";
import { getNFLStore } from "../_blobs.mjs";

const MODEL_KEY = "nfl/model/latest.json";

async function readModel() {
  const store = getNFLStore();
  const raw = await store.get(MODEL_KEY, { type: "json" });
  if (!raw) {
    // cold start defaults
    return {
      createdAt: new Date().toISOString(),
      moneyline: new OnlineLogistic({}).toJSON(),
      spread: new OnlineLinear({}).toJSON(),
      gamesTrained: 0,
    };
  }
  return raw;
}

async function writeModel(obj) {
  const store = getNFLStore();
  await store.set(MODEL_KEY, JSON.stringify(obj), { contentType: "application/json" });
  return obj;
}

export async function loadModels() {
  const snapshot = await readModel();
  return {
    snapshot,
    ml: OnlineLogistic.fromJSON(snapshot.moneyline),
    sp: OnlineLinear.fromJSON(snapshot.spread),
  };
}

export async function saveModels({ ml, sp, snapshot, deltaGames = 0 }) {
  const updated = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
    gamesTrained: (snapshot.gamesTrained || 0) + deltaGames,
    moneyline: ml.toJSON(),
    spread: sp.toJSON()
  };
  return writeModel(updated);
}
