const PRODUCTION_API_ORIGIN = 'https://plainlist.space';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function apiUrl(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('#')) {
    throw new Error('desktop API requests require a relative API path');
  }
  return `${PRODUCTION_API_ORIGIN}/api${path}`;
}

function requestHeaders(authorization) {
  const headers = { 'Content-Type': 'application/json' };
  if (authorization === undefined) return headers;
  if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) {
    throw new Error('desktop API authorization is invalid');
  }
  return { ...headers, Authorization: authorization };
}

function createDesktopApiRequest(fetchImpl) {
  return async function request(payload) {
    const method = payload?.method;
    if (!ALLOWED_METHODS.has(method)) {
      throw new Error('unsupported API method');
    }

    const body = payload.body === undefined ? undefined : JSON.stringify(payload.body);
    const response = await fetchImpl(apiUrl(payload.path), {
      method,
      headers: requestHeaders(payload.authorization),
      ...(body === undefined ? {} : { body }),
    });
    return {
      status: response.status,
      statusText: response.statusText,
      body: await response.text(),
    };
  };
}

module.exports = { createDesktopApiRequest };
