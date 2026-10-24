import type { ContentConfig, EnemyConfig, StageConfig } from './types';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be finite and positive`);
}

function uniqueIds(values: readonly { readonly id: string }[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (!idPattern.test(value.id)) throw new Error(`${label} has invalid ID: ${value.id}`);
    if (ids.has(value.id)) throw new Error(`${label} has duplicate ID: ${value.id}`);
    ids.add(value.id);
  }
  return ids;
}

function validatePool(
  pool: StageConfig['enemyPool'],
  enemyById: ReadonlyMap<string, EnemyConfig>,
  label: string,
  elite: boolean,
): void {
  const ids = uniqueIds(pool, label);
  for (const entry of pool) {
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
      throw new Error(`${label} weight must be finite and positive: ${entry.id}`);
    }
    const enemy = enemyById.get(entry.id);
    if (!enemy) throw new Error(`${label} references unknown enemy: ${entry.id}`);
    if (elite && !enemy.eliteEligible)
      throw new Error(`${label} contains ineligible elite: ${entry.id}`);
  }
  const sortedIds = [...ids].sort();
  if ([...ids].some((id, index) => id !== sortedIds[index])) {
    throw new Error(`${label} must be sorted by ID`);
  }
}

export function validateContentConfig(config: ContentConfig): void {
  if (config.schemaVersion !== 1) throw new Error('Unsupported content schema version');
  if (config.world.maxEnemies <= 0 || config.world.maxProjectiles <= 0) {
    throw new Error('Entity caps must be positive');
  }

  const enemyIds = uniqueIds(config.enemies, 'enemies');
  const enemyById = new Map(config.enemies.map((enemy) => [enemy.id, enemy]));
  const bossIds = uniqueIds(config.bosses, 'bosses');
  const stageIds = uniqueIds(config.stages, 'stages');

  config.enemies.forEach((enemy) => {
    requirePositive(enemy.health, `${enemy.id}.health`);
    requirePositive(enemy.moveSpeed, `${enemy.id}.moveSpeed`);
    requirePositive(enemy.contactDamage, `${enemy.id}.contactDamage`);
    requirePositive(enemy.radius, `${enemy.id}.radius`);
    if (enemy.eliteEligible !== 'elite' in enemy.rewards) {
      throw new Error(`Enemy ${enemy.id} elite rewards do not match eligibility`);
    }
    if (enemy.behavior === 'split' && !enemyIds.has(enemy.params.childEnemyId)) {
      throw new Error(`Enemy ${enemy.id} references unknown split child`);
    }
  });

  config.stages.forEach((stage, index) => {
    if (stage.order !== index) throw new Error(`Stage order must be contiguous at ${stage.id}`);
    if (!bossIds.has(stage.bossId)) throw new Error(`Stage ${stage.id} references unknown Boss`);
    if (stage.durationMs !== 180_000 || stage.eliteTimesMs.join(',') !== '90000,150000') {
      throw new Error(`Stage ${stage.id} has invalid timing`);
    }
    if ((stage.id === 'inferno') !== (stage.hazardLayer === 'hazards')) {
      throw new Error(`Stage ${stage.id} has invalid hazard layer`);
    }
    const stepTimes = stage.pressureSchedule.map((step) => step.atMs);
    if (stepTimes.join(',') !== '0,30000,60000,90000,120000,150000') {
      throw new Error(`Stage ${stage.id} has invalid pressure schedule`);
    }
    stage.pressureSchedule.forEach((step) => {
      requirePositive(step.spawnIntervalMs, `${stage.id}.spawnIntervalMs`);
      requirePositive(step.batchSize, `${stage.id}.batchSize`);
    });
    validatePool(stage.enemyPool, enemyById, `${stage.id}.enemyPool`, false);
    validatePool(stage.eliteEnemyPool, enemyById, `${stage.id}.eliteEnemyPool`, true);
  });

  config.bosses.forEach((boss) => {
    requirePositive(boss.health, `${boss.id}.health`);
    requirePositive(boss.moveSpeed, `${boss.id}.moveSpeed`);
    requirePositive(boss.contactDamage, `${boss.id}.contactDamage`);
    requirePositive(boss.radius, `${boss.id}.radius`);
    if (!stageIds.has(boss.stageId)) throw new Error(`Boss ${boss.id} references unknown stage`);
    const stage = config.stages.find((candidate) => candidate.id === boss.stageId);
    if (stage?.bossId !== boss.id) throw new Error(`Boss ${boss.id} is not owned by its stage`);
    if (boss.attacks.length < 3 || boss.phase2CooldownMultiplier <= 0) {
      throw new Error(`Boss ${boss.id} has invalid attack plan`);
    }
    uniqueIds(boss.attacks, `${boss.id}.attacks`);
    if (boss.attacks.some((attack) => attack.telegraphMs <= 0 || attack.cooldownMs <= 0)) {
      throw new Error(`Boss ${boss.id} attacks require positive cooldowns and telegraphs`);
    }
  });
}
