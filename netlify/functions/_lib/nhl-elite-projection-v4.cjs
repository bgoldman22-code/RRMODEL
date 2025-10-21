// CommonJS wrapper that lazy-loads the ES module version
let _modPromise;
function getMod() {
  if (!_modPromise) {
    _modPromise = import('./nhl-elite-projection-v4.mjs');
  }
  return _modPromise;
}

exports.loadPlayerStats = async (...args) => (await getMod()).loadPlayerStats(...args);
exports.loadTeamStats = async (...args) => (await getMod()).loadTeamStats(...args);
exports.preloadCache = async (...args) => (await getMod()).preloadCache(...args);
exports.projectSOGElite = async (...args) => (await getMod()).projectSOGElite(...args);
exports.calculateZINBProbability = (...args) => {
  // This one is sync in ESM, but accessing via dynamic import still OK
  // If needed, we can memoize the module
  return getMod().then(m => m.calculateZINBProbability(...args));
};
