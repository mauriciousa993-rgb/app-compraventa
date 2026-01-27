declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT?: string;
      NODE_ENV?: 'development' | 'production' | 'test';
      MONGODB_URI?: string;
      JWT_SECRET?: string;
    }
    
    interface Process {
      env: ProcessEnv;
      exit(code?: number): never;
      cwd(): string;
    }
  }

  var process: NodeJS.Process;
  var __dirname: string;
  var __filename: string;
  
  function require(id: string): any;
  namespace console {
    function log(...args: any[]): void;
    function error(...args: any[]): void;
    function warn(...args: any[]): void;
    function info(...args: any[]): void;
  }
}

export {};
