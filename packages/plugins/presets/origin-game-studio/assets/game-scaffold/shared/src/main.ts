/**
 * Assembly, and nothing else.
 *
 * Game logic in here is game logic no test can reach and no layer owns, so
 * `bun run check:arch` keeps this file to imports and calls. Anything that
 * would need a branch here belongs in a system, a scene or an entity.
 */

import { manifest } from "./assets/manifest.js";
import { AssetLoader } from "./core/assets.js";
import { assemble } from "./core/assemble.js";
import { createView } from "./core/view.js";
import { entities } from "./entities/registry.js";
import { scenes } from "./scenes/index.js";
import { systems } from "./systems/index.js";
import { tuning } from "./tuning.js";
import { hud } from "./ui/hud.js";

const game = await assemble({
  seed: tuning.seed,
  scenes,
  systems,
  entities,
  tuning,
  view: await createView(),
  assets: new AssetLoader(manifest),
});

hud.mount(document.body, game.context);
game.start();
