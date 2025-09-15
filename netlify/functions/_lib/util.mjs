export function getQuery(event) {
  return (event && event.queryStringParameters) ? event.queryStringParameters : {};
}
export function ok(body) {
  return { statusCode: 200, body: JSON.stringify(body) };
}
export function toMoneylineText(team, price) {
  if (price == null || price === "" || isNaN(Number(price))) return team;
  const p = Number(price);
  return `${team} (${p})`;
}
export function toSpreadText(team, pts, price) {
  if (pts == null || pts === "" || isNaN(Number(pts))) return "–";
  const line = Number(pts).toString();
  const suffix = (price==null||price==="") ? "" : `  (${price})`;
  return `${team} ${line}${suffix}`;
}
export function pct(n) { return Math.round(Number(n)*100); }
export function clamp01(x){ return Math.max(0, Math.min(1, x)); }
export function logistic(x, k=3.5){ return 1 / (1 + Math.exp(-k*x)); }
