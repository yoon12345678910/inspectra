export const createBatcher = <T>(
  flush: (batch: T[]) => void,
  delayMs: number
) => {
  let queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flushNow = () => {
    if (queue.length === 0) {
      return;
    }
    const batch = queue;
    queue = [];
    timer = null;
    flush(batch);
  };

  return {
    push(item: T) {
      queue.push(item);
      if (!timer) {
        timer = setTimeout(flushNow, delayMs);
      }
    },
    flush: flushNow
  };
};

