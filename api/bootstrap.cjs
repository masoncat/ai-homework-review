let handlerPromise;

async function loadHandler() {
  if (!handlerPromise) {
    handlerPromise = import('./dist/api/src/index.js').then(
      (mod) => mod.handler
    );
  }

  return handlerPromise;
}

exports.handler = async function handler(request, response, context) {
  try {
    const resolvedHandler = await loadHandler();
    return resolvedHandler(request, response, context);
  } catch (error) {
    response.setStatusCode?.(500);
    response.setHeader?.('content-type', 'application/json');
    response.send?.(
      JSON.stringify({
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? error.stack : '',
      })
    );
  }
};
