export type ProgressionBaseState = 'playing' | 'boss-fight' | 'boss-cleanup';
export type ProgressionModalState = 'level-up' | 'upgrade-choice';
export type ProgressionFlowState = ProgressionBaseState | ProgressionModalState;

export class UpgradeFlow {
  private baseStateValue: ProgressionBaseState = 'playing';
  private modalStateValue: ProgressionModalState | null = null;

  get state(): ProgressionFlowState {
    return this.modalStateValue ?? this.baseStateValue;
  }

  get baseState(): ProgressionBaseState {
    return this.baseStateValue;
  }

  get modalActive(): boolean {
    return this.modalStateValue !== null;
  }

  reset(baseState: ProgressionBaseState = 'playing'): void {
    this.baseStateValue = baseState;
    this.modalStateValue = null;
  }

  enterBaseState(state: ProgressionBaseState): void {
    if (this.modalStateValue) throw new Error('Cannot change adventure state during an upgrade');
    this.baseStateValue = state;
  }

  openLevelUp(): void {
    if (this.modalStateValue) throw new Error('An upgrade modal is already active');
    this.modalStateValue = 'level-up';
  }

  openBossUpgrade(): void {
    if (this.modalStateValue) throw new Error('An upgrade modal is already active');
    this.modalStateValue = 'upgrade-choice';
  }

  finishOffer(hasQueuedLevelOffer: boolean): void {
    if (!this.modalStateValue) throw new Error('No upgrade modal is active');
    this.modalStateValue = hasQueuedLevelOffer ? 'level-up' : null;
  }
}
