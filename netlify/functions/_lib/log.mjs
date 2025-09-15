export function log(msg, data) {
  console.log(JSON.stringify({ level: "info", msg, data }));
}
