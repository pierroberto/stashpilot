/**
 * Returns a function that runs at most `concurrency` async tasks at a time.
 * Urgent tasks jump the queue (e.g. the preview of the selected stash).
 */
export function createLimiter(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be a positive integer');
  }
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= concurrency) return;
    const start = queue.shift();
    if (start) start();
  };

  return function limit<T>(task: () => Promise<T>, urgent = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      if (urgent) queue.unshift(start);
      else queue.push(start);
      next();
    });
  };
}

export type Limiter = ReturnType<typeof createLimiter>;
