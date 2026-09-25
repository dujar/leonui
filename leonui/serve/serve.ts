/* serve.ts — dev server entry: `bun run dev` */
import { app } from './app.ts';

const server = Bun.serve(app);
console.log(`leonui dev server: http://localhost:${server.port}/`);
