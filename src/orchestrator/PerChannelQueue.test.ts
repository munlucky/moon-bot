/**
 * PerChannelQueue Unit Tests
 *
 * Tests for per-channel execution queue with FIFO ordering guarantees.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerChannelQueue } from './PerChannelQueue.js';

describe('PerChannelQueue', () => {
  let queue: PerChannelQueue<string>;

  beforeEach(() => {
    queue = new PerChannelQueue<string>(3); // Small size for testing
  });

  describe('enqueue/dequeue', () => {
    it('should enqueue and dequeue items in FIFO order', () => {
      const channelId = 'channel-1';

      queue.enqueue(channelId, 'first');
      queue.enqueue(channelId, 'second');
      queue.enqueue(channelId, 'third');

      expect(queue.dequeue(channelId)).toBe('first');
      expect(queue.dequeue(channelId)).toBe('second');
      expect(queue.dequeue(channelId)).toBe('third');
      expect(queue.dequeue(channelId)).toBeUndefined();
    });

    it('should return undefined when dequeuing from empty queue', () => {
      expect(queue.dequeue('non-existent')).toBeUndefined();
    });

    it('should return true when enqueue succeeds', () => {
      expect(queue.enqueue('channel-1', 'item1')).toBe(true);
    });

    it('should return false when queue is full', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'item1');
      queue.enqueue(channelId, 'item2');
      queue.enqueue(channelId, 'item3');

      expect(queue.enqueue(channelId, 'item4')).toBe(false);
    });
  });

  describe('FIFO guarantee', () => {
    it('should maintain strict FIFO order within each channel', () => {
      const channelId = 'channel-1';
      const items = ['a', 'b', 'c']; // Within queue size limit of 3

      items.forEach((item) => queue.enqueue(channelId, item));

      const dequeued: string[] = [];
      let item;
      while ((item = queue.dequeue(channelId)) !== undefined) {
        dequeued.push(item);
      }

      expect(dequeued).toEqual(items);
    });

    it('should maintain strict FIFO order with larger queue', () => {
      const largeQueue = new PerChannelQueue<string>(10);
      const channelId = 'channel-1';
      const items = ['a', 'b', 'c', 'd', 'e'];

      items.forEach((item) => largeQueue.enqueue(channelId, item));

      const dequeued: string[] = [];
      let item;
      while ((item = largeQueue.dequeue(channelId)) !== undefined) {
        dequeued.push(item);
      }

      expect(dequeued).toEqual(items);
    });
  });

  describe('queue full behavior', () => {
    it('should enforce maxSizePerChannel limit', () => {
      const channelId = 'channel-1';
      const max = 3;

      for (let i = 0; i < max; i++) {
        expect(queue.enqueue(channelId, `item-${i}`)).toBe(true);
      }

      // Queue is now full
      expect(queue.enqueue(channelId, 'overflow')).toBe(false);
      expect(queue.size(channelId)).toBe(max);
    });

    it('should allow enqueue after dequeue makes space', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'a');
      queue.enqueue(channelId, 'b');
      queue.enqueue(channelId, 'c');

      expect(queue.enqueue(channelId, 'd')).toBe(false);

      queue.dequeue(channelId); // Remove 'a'
      expect(queue.enqueue(channelId, 'd')).toBe(true);
      expect(queue.size(channelId)).toBe(3);
    });
  });

  describe('channel isolation', () => {
    it('should maintain separate queues for each channel', () => {
      queue.enqueue('channel-1', 'a1');
      queue.enqueue('channel-1', 'a2');
      queue.enqueue('channel-2', 'b1');
      queue.enqueue('channel-2', 'b2');

      expect(queue.size('channel-1')).toBe(2);
      expect(queue.size('channel-2')).toBe(2);
    });

    it('should dequeue independently per channel', () => {
      queue.enqueue('channel-1', 'a1');
      queue.enqueue('channel-2', 'b1');

      expect(queue.dequeue('channel-1')).toBe('a1');
      expect(queue.dequeue('channel-2')).toBe('b1');
      expect(queue.size('channel-1')).toBe(0);
      expect(queue.size('channel-2')).toBe(0);
    });

    it('should not affect other channels when one is full', () => {
      queue.enqueue('channel-1', 'a1');
      queue.enqueue('channel-1', 'a2');
      queue.enqueue('channel-1', 'a3');

      expect(queue.enqueue('channel-1', 'a4')).toBe(false);
      expect(queue.enqueue('channel-2', 'b1')).toBe(true);
    });
  });

  describe('remove() method', () => {
    it('should remove item from middle of queue', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'first');
      queue.enqueue(channelId, 'middle');
      queue.enqueue(channelId, 'last');

      expect(queue.remove(channelId, 'middle')).toBe(true);
      expect(queue.size(channelId)).toBe(2);
      expect(queue.dequeue(channelId)).toBe('first');
      expect(queue.dequeue(channelId)).toBe('last');
    });

    it('should remove item from beginning of queue', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'first');
      queue.enqueue(channelId, 'second');
      queue.enqueue(channelId, 'third');

      expect(queue.remove(channelId, 'first')).toBe(true);
      expect(queue.size(channelId)).toBe(2);
      expect(queue.peek(channelId)).toBe('second');
    });

    it('should remove item from end of queue', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'first');
      queue.enqueue(channelId, 'second');
      queue.enqueue(channelId, 'third');

      expect(queue.remove(channelId, 'third')).toBe(true);
      expect(queue.size(channelId)).toBe(2);
      expect(queue.dequeue(channelId)).toBe('first');
      expect(queue.dequeue(channelId)).toBe('second');
    });

    it('should return false when removing from non-existent channel', () => {
      expect(queue.remove('non-existent', 'item')).toBe(false);
    });

    it('should return false when removing non-existent item', () => {
      queue.enqueue('channel-1', 'actual-item');
      expect(queue.remove('channel-1', 'non-existent')).toBe(false);
    });

    it('should return false when removing from empty queue', () => {
      expect(queue.remove('empty-channel', 'item')).toBe(false);
    });

    it('should clean up empty queue after removing last item', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'only-item');

      expect(queue.remove(channelId, 'only-item')).toBe(true);
      expect(queue.size(channelId)).toBe(0);
    });

    it('should handle duplicate items correctly', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'duplicate');
      queue.enqueue(channelId, 'other');
      queue.enqueue(channelId, 'duplicate');

      // Should remove first occurrence
      expect(queue.remove(channelId, 'duplicate')).toBe(true);
      expect(queue.size(channelId)).toBe(2);
      expect(queue.dequeue(channelId)).toBe('other');
      expect(queue.dequeue(channelId)).toBe('duplicate');
    });
  });

  describe('peek', () => {
    it('should return first item without removing it', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'first');
      queue.enqueue(channelId, 'second');

      expect(queue.peek(channelId)).toBe('first');
      expect(queue.size(channelId)).toBe(2);
    });

    it('should return undefined for empty queue', () => {
      expect(queue.peek('empty')).toBeUndefined();
    });
  });

  describe('processing state management', () => {
    it('should mark channel as processing', () => {
      const channelId = 'channel-1';
      queue.startProcessing(channelId);

      expect(queue.isProcessing(channelId)).toBe(true);
    });

    it('should mark channel as not processing', () => {
      const channelId = 'channel-1';
      queue.startProcessing(channelId);
      queue.stopProcessing(channelId);

      expect(queue.isProcessing(channelId)).toBe(false);
    });

    it('should return false for non-processing channel', () => {
      expect(queue.isProcessing('non-existent')).toBe(false);
    });

    it('should clear processing state on channel clear', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'item');
      queue.startProcessing(channelId);

      queue.clear(channelId);

      expect(queue.isProcessing(channelId)).toBe(false);
    });
  });

  describe('hasPending', () => {
    it('should return true when channel has items', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'item');

      expect(queue.hasPending(channelId)).toBe(true);
    });

    it('should return false when channel is empty', () => {
      expect(queue.hasPending('empty')).toBe(false);
    });

    it('should return false after all items dequeued', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'item');
      queue.dequeue(channelId);

      expect(queue.hasPending(channelId)).toBe(false);
    });
  });

  describe('size', () => {
    it('should return 0 for non-existent channel', () => {
      expect(queue.size('non-existent')).toBe(0);
    });

    it('should return correct queue size', () => {
      const channelId = 'channel-1';
      expect(queue.size(channelId)).toBe(0);

      queue.enqueue(channelId, 'a');
      expect(queue.size(channelId)).toBe(1);

      queue.enqueue(channelId, 'b');
      expect(queue.size(channelId)).toBe(2);
    });
  });

  describe('getChannelsWithPending', () => {
    it('should return channels with pending items', () => {
      queue.enqueue('channel-1', 'a');
      queue.enqueue('channel-2', 'b');
      queue.enqueue('channel-3', 'c');

      const channels = queue.getChannelsWithPending();
      expect(channels).toContain('channel-1');
      expect(channels).toContain('channel-2');
      expect(channels).toContain('channel-3');
      expect(channels.length).toBe(3);
    });

    it('should not include channels that were emptied', () => {
      queue.enqueue('channel-1', 'a');
      queue.enqueue('channel-2', 'b');
      queue.dequeue('channel-1');

      const channels = queue.getChannelsWithPending();
      expect(channels).not.toContain('channel-1');
      expect(channels).toContain('channel-2');
    });
  });

  describe('clear', () => {
    it('should clear all items for a channel', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'a');
      queue.enqueue(channelId, 'b');
      queue.enqueue(channelId, 'c');

      const count = queue.clear(channelId);

      expect(count).toBe(3);
      expect(queue.size(channelId)).toBe(0);
      expect(queue.hasPending(channelId)).toBe(false);
    });

    it('should return 0 for non-existent channel', () => {
      expect(queue.clear('non-existent')).toBe(0);
    });

    it('should also clear processing state', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'item');
      queue.startProcessing(channelId);

      queue.clear(channelId);

      expect(queue.isProcessing(channelId)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return statistics across all channels', () => {
      queue.enqueue('channel-1', 'a');
      queue.enqueue('channel-1', 'b');
      queue.enqueue('channel-2', 'c');
      queue.startProcessing('channel-1');

      const stats = queue.getStats();

      expect(stats.channels).toBe(2);
      expect(stats.totalItems).toBe(3);
      expect(stats.processing).toBe(1);
    });

    it('should return zero stats for empty queue', () => {
      const stats = queue.getStats();

      expect(stats.channels).toBe(0);
      expect(stats.totalItems).toBe(0);
      expect(stats.processing).toBe(0);
    });

    it('should update stats dynamically', () => {
      queue.enqueue('channel-1', 'a');
      queue.enqueue('channel-2', 'b');

      let stats = queue.getStats();
      expect(stats.totalItems).toBe(2);

      queue.dequeue('channel-1');
      queue.startProcessing('channel-2');

      stats = queue.getStats();
      expect(stats.channels).toBe(1); // channel-1 was cleaned up
      expect(stats.totalItems).toBe(1);
      expect(stats.processing).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle enqueue after dequeue', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'a');
      queue.enqueue(channelId, 'b');

      queue.dequeue(channelId);
      queue.enqueue(channelId, 'c');

      expect(queue.dequeue(channelId)).toBe('b');
      expect(queue.dequeue(channelId)).toBe('c');
    });

    it('should handle dequeue of all items then enqueue', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'a');
      queue.enqueue(channelId, 'b');

      queue.dequeue(channelId);
      queue.dequeue(channelId);

      expect(queue.size(channelId)).toBe(0);
      expect(queue.enqueue(channelId, 'c')).toBe(true);
    });

    it('should handle removing item while processing', () => {
      const channelId = 'channel-1';
      queue.enqueue(channelId, 'a');
      queue.enqueue(channelId, 'b');
      queue.startProcessing(channelId);

      expect(queue.remove(channelId, 'a')).toBe(true);
      expect(queue.isProcessing(channelId)).toBe(true); // Processing state unchanged
      expect(queue.size(channelId)).toBe(1);
    });

    it('should handle multiple channels with different sizes', () => {
      queue.enqueue('ch-1', 'a');
      queue.enqueue('ch-2', 'a');
      queue.enqueue('ch-2', 'b');
      queue.enqueue('ch-3', 'a');
      queue.enqueue('ch-3', 'b');
      queue.enqueue('ch-3', 'c');

      expect(queue.size('ch-1')).toBe(1);
      expect(queue.size('ch-2')).toBe(2);
      expect(queue.size('ch-3')).toBe(3);
    });
  });
});
