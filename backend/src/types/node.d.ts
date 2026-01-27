declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT?: string;
      NODE_ENV?: 'development' | 'production' | 'test';
      MONGODB_URI?: string;
      JWT_SECRET?: string;
    }
  }
}

export {};
