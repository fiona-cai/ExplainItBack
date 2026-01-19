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

class RedisClient {
  private static instance: Redis | null = null;
  private static isConnecting = false;

  static getInstance(): Redis {
    if (!this.instance) {
      this.instance = new Redis(getRedisUrl(), {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: true,
      });

      this.instance.on('error', (err) => {
        console.error('Redis connection error:', err);
      });

      this.instance.on('connect', () => {
        console.log('Redis connected successfully');
      });
    }
    return this.instance;
  }

  static async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const redis = this.getInstance();
      await redis.connect();
    } catch (error) {
      // Connection might already be established
      if ((error as Error).message !== 'Redis is already connecting/connected') {
        throw error;
      }
    } finally {
      this.isConnecting = false;
    }
  }

  static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.quit();
      this.instance = null;
    }
  }

  static async ping(): Promise<boolean> {
    try {
      const redis = this.getInstance();
      const result = await redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

export const redis = RedisClient.getInstance();
export { RedisClient };
