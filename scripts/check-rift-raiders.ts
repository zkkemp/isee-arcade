import {
  buildRiftStage,
  largestGroundGap,
  pickForwardTarget,
  type RiftEnemyType,
} from '../components/games/RiftRaiders';
import { DIFFICULTIES } from '../lib/difficulty';

const fail = (message: string): never => {
  throw new Error(`Rift Raiders check failed: ${message}`);
};

const expectedEnemies = new Set<RiftEnemyType>(['crawler', 'drone', 'turret', 'brute']);

for (const difficulty of DIFFICULTIES) {
  for (let stageNumber = 1; stageNumber <= 12; stageNumber += 1) {
    const stage = buildRiftStage(stageNumber, difficulty);
    const repeat = buildRiftStage(stageNumber, difficulty);
    if (JSON.stringify(stage) !== JSON.stringify(repeat)) {
      fail(`${difficulty} stage ${stageNumber} is not deterministic`);
    }
    if (stage.worldW < 5000) fail(`${difficulty} stage ${stageNumber} is too short`);
    if (largestGroundGap(stage) > 96) {
      fail(`${difficulty} stage ${stageNumber} has an unreasonably wide ground gap`);
    }
    if (stage.checkpoints.length < 2) {
      fail(`${difficulty} stage ${stageNumber} needs at least two rescue beacons`);
    }
    if (stage.pickups.length < 3) {
      fail(`${difficulty} stage ${stageNumber} needs a full weapon route`);
    }
    if (stage.boss.x < stage.worldW - 400 || stage.boss.hp <= 0) {
      fail(`${difficulty} stage ${stageNumber} has no valid end boss`);
    }
    const types = new Set(stage.enemies.map((enemy) => enemy.type));
    for (const expected of expectedEnemies) {
      if (!types.has(expected)) fail(`${difficulty} stage ${stageNumber} never places a ${expected}`);
    }
    for (const checkpoint of stage.checkpoints) {
      const hasGround = stage.platforms.some(
        (platform) =>
          platform.kind === 'ground' &&
          checkpoint.x >= platform.x &&
          checkpoint.x <= platform.x + platform.w,
      );
      if (!hasGround) fail(`${difficulty} stage ${stageNumber} puts a beacon over a pit`);
    }
  }
}

const easyBoss = buildRiftStage(4, 'easy').boss.maxHp;
const normalBoss = buildRiftStage(4, 'normal').boss.maxHp;
const hardBoss = buildRiftStage(4, 'hard').boss.maxHp;
if (!(easyBoss < normalBoss && normalBoss < hardBoss)) {
  fail(`boss health does not scale with difficulty (${easyBoss}, ${normalBoss}, ${hardBoss})`);
}

const targets = [
  { x: 80, y: 100, alive: true, id: 'behind' },
  { x: 190, y: 170, alive: true, id: 'near' },
  { x: 360, y: 100, alive: true, id: 'far' },
  { x: 150, y: 100, alive: false, id: 'defeated' },
];
if (pickForwardTarget(targets, 100, 100, 1)?.id !== 'near') {
  fail('auto-target did not choose the nearest live target ahead');
}
if (pickForwardTarget(targets, 100, 100, -1)?.id !== 'behind') {
  fail('turning around did not retarget the threat behind the player');
}

console.log(
  'Rift Raiders verified: 36 deterministic missions, safe gap widths, grounded beacons, ' +
    'four enemy classes, three special weapons, difficulty-scaled bosses, and directional auto-targeting.',
);
