/**
 * THE NETWORK STATEMENT, WRITTEN ONCE.
 *
 * Two READMEs speak about the network: the one at the root and the one of examples/amlworld/.
 * They used to make two different claims ("the only command that needs the network" was
 * `npm ci`, and "the only step that needs the network" was the Kaggle download). Both cannot
 * be the only one. This is the single text, printed word for word in both by `npm run figures`
 * (src/readme.ts), and held to the code by src/reseau-readmes.test.ts.
 *
 * What the code says, and what the test reads:
 *   - package.json declares no runtime dependency (only two development ones), so the one
 *     moment a package comes from the npm registry is `npm ci --ignore-scripts`;
 *   - every module outside the tests imports `node:` built-ins only;
 *   - src/frontiere.test.ts refuses any module that opens a connection;
 *   - the AMLworld mapping (examples/amlworld/map-alerts.ts) reads a local file, and the
 *     download from Kaggle is done by the user, with their own account, outside this tool.
 *
 * The promise is about this tool's code ("opens no connection"), not about the `npm` launcher that starts a script, which is
 * npm's own program and may check the registry itself; src/reseau-readmes.test.ts refuses "uses no network at all".
 *
 * No figure is typed here: the commands named are checked against package.json.
 */
export const RESEAU =
  "Only `npm ci --ignore-scripts` reaches the network, to get the pinned development dependencies "
  + "from the npm registry at install time. The code behind every other command, `npm run test`, "
  + "`npm run measure:yours` and `npm run example:amlworld` included, opens no connection: "
  + "the tool has no runtime dependency and imports `node:` built-ins only. "
  + "No command downloads the AMLworld file: you get it yourself from Kaggle, with your own "
  + "account, and `npm run example:amlworld` reads that local copy.";
