export enum Type {
  Serial = 'serial',
  Parallel = 'parallel',
}

export enum SchedulerType {
  /**
   * Run all scheduled tasks and builders in the master process
   */
  InProcess = 'in process',

  /**
   * Spawn a number of processes (defined by `maxParallel` in the parallel options) to run the
   * scheduled tasks and builders in
   */
  Spawn = 'spawn',

  /**
   * Spawn a number of worker threads (defined by `maxParallel` in the parallel options) to run the
   * scheduled tasks and builders in
   */
  Worker = 'worker',

  /**
   * Spawn a new process for every scheduled task or builder
   */
  Respawn = 'respawn',
}
