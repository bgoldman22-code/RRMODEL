// netlify/functions/_ml/online-models.mjs
// Simple online learners (logistic & linear) using SGD, no external deps.
export class OnlineLogistic {
  constructor({ lr = 0.05, l2 = 1e-4, weights = {} } = {}) {
    this.lr = lr;
    this.l2 = l2;
    this.w = { ...weights }; // feature -> weight
    this.bias = this.w.__bias || 0;
    delete this.w.__bias;
  }
  _dot(x) {
    let s = this.bias;
    for (const [k, v] of Object.entries(x)) {
      if (k == null) continue;
      const w = this.w[k] || 0;
      s += w * v;
    }
    return s;
  }
  _sig(z) { return 1 / (1 + Math.exp(-z)); }
  predictProba(x) { return this._sig(this._dot(x)); }
  predict(x) { return this.predictProba(x) >= 0.5 ? 1 : 0; }
  update(x, y) {
    const p = this.predictProba(x);
    const err = p - y; // gradient for logistic loss
    // L2 on weights
    for (const k of Object.keys(this.w)) {
      this.w[k] -= this.lr * (this.l2 * this.w[k]);
    }
    for (const [k, v] of Object.entries(x)) {
      const g = err * v;
      this.w[k] = (this.w[k] || 0) - this.lr * g;
    }
    this.bias -= this.lr * err;
  }
  toJSON() {
    return { lr: this.lr, l2: this.l2, weights: { ...this.w, __bias: this.bias }, type: "OnlineLogistic" };
  }
  static fromJSON(obj) { return new OnlineLogistic(obj); }
}

export class OnlineLinear {
  constructor({ lr = 0.05, l2 = 1e-4, weights = {} } = {}) {
    this.lr = lr; this.l2 = l2; this.w = { ...weights };
    this.bias = this.w.__bias || 0; delete this.w.__bias;
  }
  _dot(x) {
    let s = this.bias;
    for (const [k, v] of Object.entries(x)) s += (this.w[k] || 0) * v;
    return s;
  }
  predict(x) { return this._dot(x); }
  update(x, y) {
    const yhat = this.predict(x);
    const err = yhat - y;
    for (const k of Object.keys(this.w)) this.w[k] -= this.lr * (this.l2 * this.w[k]);
    for (const [k, v] of Object.entries(x)) {
      const g = err * v;
      this.w[k] = (this.w[k] || 0) - this.lr * g;
    }
    this.bias -= this.lr * err;
  }
  toJSON() { return { lr: this.lr, l2: this.l2, weights: { ...this.w, __bias: this.bias }, type: "OnlineLinear" }; }
  static fromJSON(obj) { return new OnlineLinear(obj); }
}
