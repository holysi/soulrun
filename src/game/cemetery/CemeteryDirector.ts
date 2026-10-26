import { StageDirector } from '../stages';
import type { StageBossState, StageDirectorEvent, StageEnemyState } from '../stages';

export type CemeteryEnemyState = StageEnemyState;
export type CemeteryBossState = StageBossState & { readonly id: 'graveyard-guardian' };
export type CemeteryDirectorEvent = StageDirectorEvent;

export class CemeteryDirector extends StageDirector {
  constructor(seed: string, completedLoops = 0) {
    super('cemetery', seed, completedLoops);
  }
}
