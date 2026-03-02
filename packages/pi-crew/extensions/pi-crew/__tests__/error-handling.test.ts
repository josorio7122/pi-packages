import { describe, it, expect } from 'vitest';
import { mapWithConcurrencyLimit, emptyUsage } from '../spawn.js';

describe('error handling', () => {
  describe('mapWithConcurrencyLimit error behavior', () => {
    it('rejects when any item throws', async () => {
      const items = [1, 2, 3];
      await expect(
        mapWithConcurrencyLimit(items, 2, async (item) => {
          if (item === 2) throw new Error('item 2 failed');
          return item * 10;
        })
      ).rejects.toThrow('item 2 failed');
    });

    it('handles all items failing', async () => {
      await expect(
        mapWithConcurrencyLimit([1, 2, 3], 3, async () => {
          throw new Error('all fail');
        })
      ).rejects.toThrow('all fail');
    });

    it('handles single item failure', async () => {
      await expect(
        mapWithConcurrencyLimit([1], 1, async () => {
          throw new Error('single fail');
        })
      ).rejects.toThrow('single fail');
    });
  });

  describe('emptyUsage returns zeroed stats', () => {
    it('all fields are zero', () => {
      const usage = emptyUsage();
      expect(usage.input).toBe(0);
      expect(usage.output).toBe(0);
      expect(usage.cacheRead).toBe(0);
      expect(usage.cacheWrite).toBe(0);
      expect(usage.cost).toBe(0);
      expect(usage.contextTokens).toBe(0);
      expect(usage.turns).toBe(0);
    });
  });

  describe('concurrent execution behavior', () => {
    it('respects concurrency limit during error handling', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      try {
        await mapWithConcurrencyLimit(items, 2, async (item) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise(r => setTimeout(r, 100));
          currentConcurrent--;
          if (item === 5) throw new Error('item 5 failed');
          return item;
        });
      } catch {
        // Expected to fail
      }
      
      // Should never exceed concurrency limit even when error occurs
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('handles concurrent failures gracefully', async () => {
      const items = [1, 2, 3, 4, 5];
      
      await expect(
        mapWithConcurrencyLimit(items, 3, async (item) => {
          await new Promise(r => setTimeout(r, 10));
          if (item === 3) throw new Error('item 3 failed');
          return item;
        })
      ).rejects.toThrow('item 3 failed');
    });

    it('processes single item without concurrency overhead', async () => {
      const result = await mapWithConcurrencyLimit([1], 1, async (item) => {
        return item * 10;
      });
      
      expect(result).toEqual([10]);
    });
  });
});
