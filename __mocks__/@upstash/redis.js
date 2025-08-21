// Mock for @upstash/redis
export class Redis {
  static fromEnv() {
    return new Redis();
  }

  constructor(config) {
    // Mock constructor
  }

  async set(key, value) {
    return "OK";
  }

  async get(key) {
    return null;
  }

  async del(key) {
    return 1;
  }

  async dbsize() {
    return 0;
  }

  async zremrangebyscore(key, min, max) {
    return 0;
  }

  async zadd(key, member) {
    return 1;
  }

  async zcard(key) {
    return 0;
  }

  async expire(key, seconds) {
    return 1;
  }

  pipeline() {
    const commands = [];

    return {
      zremrangebyscore: (key, min, max) => {
        commands.push(["zremrangebyscore", key, min, max]);
        return this;
      },
      zadd: (key, member) => {
        commands.push(["zadd", key, member]);
        return this;
      },
      zcard: (key) => {
        commands.push(["zcard", key]);
        return this;
      },
      expire: (key, seconds) => {
        commands.push(["expire", key, seconds]);
        return this;
      },
      async exec() {
        // Mock pipeline execution - return mock results
        return commands.map((cmd, index) => {
          switch (cmd[0]) {
            case "zremrangebyscore":
              return 0;
            case "zadd":
              return 1;
            case "zcard":
              return 0; // Mock: no requests in window
            case "expire":
              return 1;
            default:
              return 0;
          }
        });
      },
    };
  }
}
