/**
 * Serializes async work so fast tick, slow tick, and manual refresh never overlap.
 */
export const createAsyncWorkQueue = (): {
  enqueue: (task: () => Promise<void>) => Promise<void>;
} => {
  let tail = Promise.resolve();

  const enqueue = async (task: () => Promise<void>): Promise<void> => {
    const next = tail.then(() => task());
    tail = next.catch(() => {
      /* errors are handled in task */
    });
    await next;
  };

  return { enqueue };
};
