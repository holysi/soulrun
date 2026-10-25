export interface PhysicsWorldControl {
  pause(): void;
  resume(): void;
}

export interface PhysicsPauseState {
  readonly testControlled: boolean;
  readonly userPaused: boolean;
  readonly modalActive: boolean;
  readonly simulationSuspended: boolean;
  readonly playerDead: boolean;
}

export function shouldPausePhysics(state: PhysicsPauseState): boolean {
  return (
    state.testControlled ||
    state.userPaused ||
    state.modalActive ||
    state.simulationSuspended ||
    state.playerDead
  );
}

export function synchronizePhysicsWorld(
  world: PhysicsWorldControl,
  state: PhysicsPauseState,
): 'paused' | 'running' {
  if (shouldPausePhysics(state)) {
    world.pause();
    return 'paused';
  }
  world.resume();
  return 'running';
}
