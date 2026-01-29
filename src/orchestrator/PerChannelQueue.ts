/**
 * PerChannelQueue
 *
 * Per-channel execution queue to guarantee message ordering within each channel.
 * Channels operate independently but each maintains strict FIFO ordering.
 */

export class PerChannelQueue<T> {
  private queues: Map<string, T[]> = new Map();
  private processing: Map<string, boolean> = new Map();
  private maxSizePerChannel: number;

  constructor(maxSizePerChannel: number = 100) {
    this.maxSizePerChannel = maxSizePerChannel;
  }

  /**
   * Add an item to a channel's queue.
   * Returns false if queue is full.
   */
  enqueue(channelSessionId: string, item: T): boolean {
    let queue = this.queues.get(channelSessionId);

    if (!queue) {
      queue = [];
      this.queues.set(channelSessionId, queue);
    }

    if (queue.length >= this.maxSizePerChannel) {
      return false;
    }

    queue.push(item);
    return true;
  }

  /**
   * Get the next item for a channel without removing it.
   */
  peek(channelSessionId: string): T | undefined {
    const queue = this.queues.get(channelSessionId);
    return queue?.[0];
  }

  /**
   * Remove and return the next item for a channel.
   */
  dequeue(channelSessionId: string): T | undefined {
    const queue = this.queues.get(channelSessionId);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const item = queue.shift();

    // Clean up empty queues
    if (queue.length === 0) {
      this.queues.delete(channelSessionId);
    }

    return item;
  }

  /**
   * Mark a channel as currently processing.
   */
  startProcessing(channelSessionId: string): void {
    this.processing.set(channelSessionId, true);
  }

  /**
   * Mark a channel as done processing.
   */
  stopProcessing(channelSessionId: string): void {
    this.processing.delete(channelSessionId);
  }

  /**
   * Check if a channel is currently processing.
   */
  isProcessing(channelSessionId: string): boolean {
    return this.processing.get(channelSessionId) ?? false;
  }

  /**
   * Check if a channel has items waiting.
   */
  hasPending(channelSessionId: string): boolean {
    const queue = this.queues.get(channelSessionId);
    return (queue?.length ?? 0) > 0;
  }

  /**
   * Get queue size for a channel.
   */
  size(channelSessionId: string): number {
    return this.queues.get(channelSessionId)?.length ?? 0;
  }

  /**
   * Get all channel IDs with pending items.
   */
  getChannelsWithPending(): string[] {
    return Array.from(this.queues.keys()).filter(
      (id) => (this.queues.get(id)?.length ?? 0) > 0
    );
  }

  /**
   * Clear all items for a channel.
   */
  clear(channelSessionId: string): number {
    const queue = this.queues.get(channelSessionId);
    this.queues.delete(channelSessionId);
    this.processing.delete(channelSessionId);
    return queue?.length ?? 0;
  }

  /**
   * Get statistics across all channels.
   */
  getStats(): { channels: number; totalItems: number; processing: number } {
    let totalItems = 0;
    for (const queue of this.queues.values()) {
      totalItems += queue.length;
    }

    return {
      channels: this.queues.size,
      totalItems,
      processing: this.processing.size,
    };
  }
}
