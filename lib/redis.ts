import Redis from 'ioredis';

const getRedisUrl = (): string => {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const password = process.env.REDIS_PASSWORD;

  if (password) {
    return `redis://:${password}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
};

// Interface for Redis-like operations
interface RedisLike {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<string>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
}

// Global store that persists across hot reloads in Next.js development
declare global {
  var __inMemoryStore: Map<string, { value: string; expiry?: number }> | undefined;
  var __redisClientInstance: Redis | InMemoryStore | undefined;
}

// In-memory fallback for development when Redis is not available
class InMemoryStore implements RedisLike {
  private store: Map<string, { value: string; expiry?: number }>;
  public readonly _isInMemoryStore = true; // Marker for type checking

  constructor() {
    // Use global store if it exists (persists across hot reloads), otherwise create new
    if (typeof global !== 'undefined' && global.__inMemoryStore) {
      this.store = global.__inMemoryStore;
    } else {
      this.store = new Map<string, { value: string; expiry?: number }>();
      if (typeof global !== 'undefined') {
        global.__inMemoryStore = this.store;
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[InMemoryStore] Key not found: ${key}, store size: ${this.store.size}`);
      }
      return null;
    }
    
    // Check if expired
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[InMemoryStore] Retrieved key: ${key}`);
    }
    return item.value;
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    const expiry = Date.now() + seconds * 1000;
    this.store.set(key, { value, expiry });
    if (process.env.NODE_ENV === 'development') {
      console.log(`[InMemoryStore] Saved key: ${key}, store size: ${this.store.size}`);
    }
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }
}

class RedisClient {
  private static instance: Redis | InMemoryStore | null = null;
  private static isConnecting = false;
  private static useInMemory = false;
  private static hasLoggedFallback = false;
  private static redisErrorHandler: ((err: Error) => void) | null = null;

  static getInstance(): Redis | InMemoryStore {
    // In development, check global first to persist across hot reloads
    if (process.env.NODE_ENV === 'development' && typeof global !== 'undefined' && global.__redisClientInstance) {
      const globalInstance = global.__redisClientInstance;
      if (globalInstance instanceof InMemoryStore || (globalInstance as any)._isInMemoryStore) {
        this.instance = globalInstance;
        this.useInMemory = true;
        return this.instance;
      }
    }

    if (!this.instance) {
      // In development, default to in-memory unless Redis is explicitly requested
      const forceRedis = process.env.FORCE_REDIS === 'true';
      const useInMemoryFallback = process.env.NODE_ENV === 'development' && 
                                   (process.env.USE_IN_MEMORY_STORE === 'true' || !forceRedis);
      
      if (useInMemoryFallback) {
        if (!this.hasLoggedFallback) {
          console.log('Using in-memory store for development. Set FORCE_REDIS=true to use Redis.');
          this.hasLoggedFallback = true;
        }
        this.instance = new InMemoryStore();
        this.useInMemory = true;
        // Store in global for persistence across hot reloads
        if (typeof global !== 'undefined') {
          global.__redisClientInstance = this.instance;
        }
        return this.instance;
      }

      // Only create Redis instance if we're forcing it or in production
      try {
        const redisInstance = new Redis(getRedisUrl(), {
          maxRetriesPerRequest: 0,
          retryStrategy: () => null,
          lazyConnect: true,
          connectTimeout: 1000,
          enableReadyCheck: false,
          showFriendlyErrorStack: false,
        });

        // Set up error handler that immediately switches to in-memory in development
        this.redisErrorHandler = (err: Error) => {
          // Silently ignore errors if we've already switched to in-memory
          if (this.useInMemory) {
            return;
          }
          
          // In development, switch to in-memory immediately on first error
          if (process.env.NODE_ENV === 'development') {
            if (!this.hasLoggedFallback) {
              console.warn('Redis connection failed, using in-memory store. Set FORCE_REDIS=true and ensure Redis is running to use Redis.');
              this.hasLoggedFallback = true;
            }
            this.switchToInMemory();
            // Remove all listeners to stop error spam
            redisInstance.removeAllListeners();
            redisInstance.disconnect();
          } else {
            // In production, log but don't switch
            console.error('Redis connection error:', err);
          }
        };

        redisInstance.on('error', this.redisErrorHandler);

        redisInstance.on('connect', () => {
          if (!this.useInMemory) {
            console.log('Redis connected successfully');
          }
        });

        this.instance = redisInstance;
        // Store in global for persistence (if not in-memory)
        if (typeof global !== 'undefined' && process.env.NODE_ENV === 'development') {
          global.__redisClientInstance = this.instance;
        }
      } catch (error) {
        // If Redis fails to initialize, fall back to in-memory in development
        if (process.env.NODE_ENV === 'development') {
          if (!this.hasLoggedFallback) {
            console.warn('Redis initialization failed, using in-memory store');
            this.hasLoggedFallback = true;
          }
          this.instance = new InMemoryStore();
          this.useInMemory = true;
          // Store in global for persistence across hot reloads
          if (typeof global !== 'undefined') {
            global.__redisClientInstance = this.instance;
          }
        } else {
          throw error;
        }
      }
    }
    return this.instance;
  }

  static async connect(): Promise<void> {
    if (this.isConnecting) return;
    
    // If already using in-memory, no need to connect
    if (this.useInMemory) {
      return;
    }
    
    this.isConnecting = true;

    try {
      const redis = this.getInstance();
      
      // In-memory store doesn't need connection
      if (redis instanceof InMemoryStore || this.useInMemory) {
        return;
      }

      // Try to connect with a timeout
      const connectPromise = (redis as Redis).connect();
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 2000);
      });

      try {
        await Promise.race([connectPromise, timeoutPromise]);
      } catch (connectError) {
        // If connection fails in development, fall back to in-memory
        if (process.env.NODE_ENV === 'development') {
          const errorMsg = (connectError as Error).message;
          if (errorMsg !== 'Redis is already connecting/connected' && !this.useInMemory) {
            if (!this.hasLoggedFallback) {
              console.warn('Redis connection failed, using in-memory store. To use Redis, make sure it is running.');
              this.hasLoggedFallback = true;
            }
            this.instance = new InMemoryStore();
            this.useInMemory = true;
            // Store in global for persistence across hot reloads
            if (typeof global !== 'undefined') {
              global.__redisClientInstance = this.instance;
            }
            // Disconnect the failed Redis instance
            try {
              await (redis as Redis).disconnect();
            } catch {
              // Ignore disconnect errors
            }
            return;
          }
        }
        // In production, throw the error
        if (process.env.NODE_ENV !== 'development') {
          throw connectError;
        }
      }
    } catch (error) {
      // In production, throw the error
      if (process.env.NODE_ENV !== 'development') {
        const errorMessage = (error as Error).message;
        if (errorMessage !== 'Redis is already connecting/connected') {
          throw error;
        }
      }
    } finally {
      this.isConnecting = false;
    }
  }

  static async disconnect(): Promise<void> {
    if (this.instance && !(this.instance instanceof InMemoryStore)) {
      await (this.instance as Redis).quit();
      this.instance = null;
    }
  }

  static async ping(): Promise<boolean> {
    try {
      const redis = this.getInstance();
      if (redis instanceof InMemoryStore) {
        const result = await redis.ping();
        return result === 'PONG';
      }
      const result = await (redis as Redis).ping();
      return result === 'PONG';
    } catch {
      // If ping fails in development, fall back to in-memory
      if (process.env.NODE_ENV === 'development' && !this.useInMemory) {
        this.instance = new InMemoryStore();
        this.useInMemory = true;
        // Store in global for persistence across hot reloads
        if (typeof global !== 'undefined') {
          global.__redisClientInstance = this.instance;
        }
        return true;
      }
      return false;
    }
  }

  static isUsingInMemory(): boolean {
    return this.useInMemory;
  }

  static switchToInMemory(): void {
    if (!this.useInMemory && process.env.NODE_ENV === 'development') {
      if (!this.hasLoggedFallback) {
        console.warn('Switching to in-memory store due to Redis connection issues');
        this.hasLoggedFallback = true;
      }
      // Disconnect and remove listeners from Redis instance if it exists
      if (this.instance && !(this.instance instanceof InMemoryStore)) {
        const redisInstance = this.instance as Redis;
        redisInstance.removeAllListeners();
        redisInstance.disconnect();
      }
      // Only create new instance if we don't already have one
      if (!this.instance || !(this.instance instanceof InMemoryStore)) {
        this.instance = new InMemoryStore();
        // Store in global for persistence across hot reloads
        if (typeof global !== 'undefined') {
          global.__redisClientInstance = this.instance;
        }
      }
      this.useInMemory = true;
    }
  }
}

// Export a properly typed redis instance
const redisInstance = RedisClient.getInstance();

// Type guard to check if it's InMemoryStore
function isInMemoryStore(instance: Redis | InMemoryStore): instance is InMemoryStore {
  // Check for the marker property
  return instance && (instance as any)._isInMemoryStore === true;
}

// Create a wrapper that works with both Redis and InMemoryStore
export const redis = {
  get: async (key: string): Promise<string | null> => {
    // Ensure we're using the right instance
    if (RedisClient.isUsingInMemory()) {
      const instance = RedisClient.getInstance();
      if (isInMemoryStore(instance)) {
        return instance.get(key);
      }
    }
    
    const instance = RedisClient.getInstance();
    if (isInMemoryStore(instance)) {
      return instance.get(key);
    }
    
    try {
      return await (instance as Redis).get(key);
    } catch (error) {
      // If Redis operation fails in development, fall back to in-memory
      if (process.env.NODE_ENV === 'development' && !RedisClient.isUsingInMemory()) {
        RedisClient.switchToInMemory();
        const inMemory = RedisClient.getInstance();
        return (inMemory as InMemoryStore).get(key);
      }
      throw error;
    }
  },
  setex: async (key: string, seconds: number, value: string): Promise<string> => {
    // Ensure we're using the right instance
    if (RedisClient.isUsingInMemory()) {
      const instance = RedisClient.getInstance();
      if (isInMemoryStore(instance)) {
        return instance.setex(key, seconds, value);
      }
    }
    
    const instance = RedisClient.getInstance();
    if (isInMemoryStore(instance)) {
      return instance.setex(key, seconds, value);
    }
    
    try {
      return await (instance as Redis).setex(key, seconds, value);
    } catch (error) {
      // If Redis operation fails in development, fall back to in-memory
      if (process.env.NODE_ENV === 'development' && !RedisClient.isUsingInMemory()) {
        RedisClient.switchToInMemory();
        const inMemory = RedisClient.getInstance();
        return (inMemory as InMemoryStore).setex(key, seconds, value);
      }
      throw error;
    }
  },
  del: async (key: string): Promise<number> => {
    // Ensure we're using the right instance
    if (RedisClient.isUsingInMemory()) {
      const instance = RedisClient.getInstance();
      if (isInMemoryStore(instance)) {
        return instance.del(key);
      }
    }
    
    const instance = RedisClient.getInstance();
    if (isInMemoryStore(instance)) {
      return instance.del(key);
    }
    
    try {
      return await (instance as Redis).del(key);
    } catch (error) {
      // If Redis operation fails in development, fall back to in-memory
      if (process.env.NODE_ENV === 'development' && !RedisClient.isUsingInMemory()) {
        RedisClient.switchToInMemory();
        const inMemory = RedisClient.getInstance();
        return (inMemory as InMemoryStore).del(key);
      }
      throw error;
    }
  },
  ping: async (): Promise<string> => {
    // Ensure we're using the right instance
    if (RedisClient.isUsingInMemory()) {
      const instance = RedisClient.getInstance();
      if (isInMemoryStore(instance)) {
        return instance.ping();
      }
    }
    
    const instance = RedisClient.getInstance();
    if (isInMemoryStore(instance)) {
      return instance.ping();
    }
    
    try {
      return await (instance as Redis).ping();
    } catch (error) {
      // If Redis operation fails in development, fall back to in-memory
      if (process.env.NODE_ENV === 'development' && !RedisClient.isUsingInMemory()) {
        RedisClient.switchToInMemory();
        const inMemory = RedisClient.getInstance();
        return (inMemory as InMemoryStore).ping();
      }
      throw error;
    }
  },
};

export { RedisClient };
