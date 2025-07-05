import cluster from 'cluster';
import { EventEmitter } from 'events';

interface CacheEntry {
  value: any;
  expiry: number;
  ttl: number;
}

interface CacheMessage {
  type: 'cache-set' | 'cache-get' | 'cache-delete' | 'cache-clear' | 'cache-response';
  key?: string;
  value?: any;
  ttl?: number;
  requestId?: string;
  workerId?: number;
}

class ClusterCache extends EventEmitter {
  private localCache: Map<string, CacheEntry> = new Map();
  private pendingRequests: Map<string, { resolve: any; reject: any; timeout: NodeJS.Timeout }> = new Map();
  private requestCounter = 0;
  private maxCacheSize = 1000;
  private defaultTTL = 300000; // 5 minutes

  constructor() {
    super();
    this.setupClusterMessaging();
    this.startCacheCleanup();
  }

  private setupClusterMessaging(): void {
    if (cluster.isWorker) {
      // Worker: Listen for messages from master
      process.on('message', (message: CacheMessage) => {
        this.handleMessage(message);
      });
    } else if (cluster.isMaster) {
      // Master: Broadcast cache operations to all workers
      cluster.on('message', (worker, message: CacheMessage) => {
        if (message.type?.startsWith('cache-')) {
          // Broadcast to all other workers
          for (const id in cluster.workers) {
            const otherWorker = cluster.workers[id];
            if (otherWorker && otherWorker.id !== worker.id) {
              otherWorker.send(message);
            }
          }
        }
      });
    }
  }

  private handleMessage(message: CacheMessage): void {
    switch (message.type) {
      case 'cache-set':
        if (message.key && message.value !== undefined) {
          this.setLocal(message.key, message.value, message.ttl || this.defaultTTL);
        }
        break;

      case 'cache-delete':
        if (message.key) {
          this.deleteLocal(message.key);
        }
        break;

      case 'cache-clear':
        this.clearLocal();
        break;

      case 'cache-response':
        this.handleCacheResponse(message);
        break;
    }
  }

  private handleCacheResponse(message: CacheMessage): void {
    const requestId = message.requestId;
    if (!requestId) return;

    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      
      if (message.value !== undefined) {
        pending.resolve(message.value);
      } else {
        pending.resolve(null);
      }
    }
  }

  private generateRequestId(): string {
    return `req_${process.pid}_${++this.requestCounter}_${Date.now()}`;
  }

  private setLocal(key: string, value: any, ttl: number): void {
    // Implement LRU-like behavior
    if (this.localCache.size >= this.maxCacheSize) {
      const oldest = this.localCache.keys().next().value;
      if (oldest) {
        this.localCache.delete(oldest);
      }
    }

    this.localCache.set(key, {
      value,
      expiry: Date.now() + ttl,
      ttl
    });
  }

  private getLocal(key: string): any {
    const entry = this.localCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.localCache.delete(key);
      return null;
    }

    return entry.value;
  }

  private deleteLocal(key: string): void {
    this.localCache.delete(key);
  }

  private clearLocal(): void {
    this.localCache.clear();
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.localCache.entries()) {
        if (now > entry.expiry) {
          this.localCache.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  // Public API
  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    // Set locally first
    this.setLocal(key, value, ttl);

    // Broadcast to other workers if in cluster mode
    if (cluster.isWorker && process.send) {
      const message: CacheMessage = {
        type: 'cache-set',
        key,
        value,
        ttl,
        workerId: cluster.worker?.id
      };
      process.send(message);
    }
  }

  async get(key: string): Promise<any> {
    // Try local cache first
    const localValue = this.getLocal(key);
    if (localValue !== null) {
      return localValue;
    }

    // If in cluster mode and value not found locally, 
    // we could implement cross-worker cache lookup here
    // For now, return null if not found locally
    return null;
  }

  async delete(key: string): Promise<void> {
    // Delete locally
    this.deleteLocal(key);

    // Broadcast to other workers
    if (cluster.isWorker && process.send) {
      const message: CacheMessage = {
        type: 'cache-delete',
        key,
        workerId: cluster.worker?.id
      };
      process.send(message);
    }
  }

  async clear(): Promise<void> {
    // Clear locally
    this.clearLocal();

    // Broadcast to other workers
    if (cluster.isWorker && process.send) {
      const message: CacheMessage = {
        type: 'cache-clear',
        workerId: cluster.worker?.id
      };
      process.send(message);
    }
  }

  // Utility methods
  has(key: string): boolean {
    const entry = this.localCache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiry) {
      this.localCache.delete(key);
      return false;
    }
    
    return true;
  }

  size(): number {
    return this.localCache.size;
  }

  keys(): string[] {
    const now = Date.now();
    const validKeys: string[] = [];
    
    for (const [key, entry] of this.localCache.entries()) {
      if (now <= entry.expiry) {
        validKeys.push(key);
      } else {
        this.localCache.delete(key);
      }
    }
    
    return validKeys;
  }

  // Cache statistics
  getStats(): any {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    let totalMemory = 0;

    for (const [key, entry] of this.localCache.entries()) {
      if (now <= entry.expiry) {
        validEntries++;
        totalMemory += JSON.stringify(entry.value).length;
      } else {
        expiredEntries++;
      }
    }

    return {
      size: this.localCache.size,
      validEntries,
      expiredEntries,
      estimatedMemoryBytes: totalMemory,
      maxSize: this.maxCacheSize,
      workerId: cluster.worker?.id || 'master',
      processId: process.pid
    };
  }

  // Helper for HTTP response caching
  async cacheResponse(key: string, responseData: any, ttl: number = 300000): Promise<void> {
    const cacheData = {
      data: responseData,
      timestamp: Date.now(),
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${Math.floor(ttl / 1000)}`
      }
    };
    
    await this.set(key, cacheData, ttl);
  }

  async getCachedResponse(key: string): Promise<any> {
    const cached = await this.get(key);
    if (!cached) return null;
    
    // Check if still valid
    const age = Date.now() - cached.timestamp;
    if (age > cached.ttl) {
      await this.delete(key);
      return null;
    }
    
    return cached;
  }

  // Memory management
  enforceMemoryLimits(): void {
    const stats = this.getStats();
    const memoryLimitMB = 50; // 50MB limit per worker
    const memoryLimitBytes = memoryLimitMB * 1024 * 1024;
    
    if (stats.estimatedMemoryBytes > memoryLimitBytes) {
      // Remove oldest entries until under limit
      const entries = Array.from(this.localCache.entries());
      entries.sort((a, b) => a[1].expiry - b[1].expiry);
      
      let currentMemory = stats.estimatedMemoryBytes;
      let removed = 0;
      
      for (const [key, entry] of entries) {
        if (currentMemory <= memoryLimitBytes * 0.8) break; // Target 80% of limit
        
        const entrySize = JSON.stringify(entry.value).length;
        this.localCache.delete(key);
        currentMemory -= entrySize;
        removed++;
      }
      
      console.log(`ClusterCache: Removed ${removed} entries to enforce memory limits`);
    }
  }
}

// Export singleton instance
export const clusterCache = new ClusterCache();
export { CacheEntry, CacheMessage };