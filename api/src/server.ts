import { startServer } from './index.js';

async function main() {
  const started = await startServer();
  console.log(`AI homework review API listening on ${started.origin}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
