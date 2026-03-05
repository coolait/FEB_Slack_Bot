declare module 'node-fastcgi' {
  import { IncomingMessage, ServerResponse } from 'http';
  export function isService(): boolean;
  export function createServer(
    requestListener: (req: IncomingMessage, res: ServerResponse) => void
  ): { listen: (callback?: () => void) => void };
}
