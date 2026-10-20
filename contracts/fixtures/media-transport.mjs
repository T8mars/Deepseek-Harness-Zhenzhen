import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';

export const EXAMPLE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8f8AAAAASUVORK5CYII=', 'base64');
export const EXAMPLE_MEDIA_URL = 'https://media.example.com/EXAMPLE_RESULT.png?EXAMPLE_SIGNATURE=TEST_ONLY';
/** Production URL/DNS/pinning gates remain active. Only the final socket carrier
 * is mapped to an isolated HTTP server; this does not claim real TLS/CDN proof.
 */
export async function withMediaTransport(work, handler, resolveAnswers) {
  const originalHttp = http.request, originalHttps = https.request, originalLookup = dns.lookup, requests = [], dnsQueries = [];
  const server = http.createServer((request, response) => {
    assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, undefined); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers.referer, undefined);
    if (handler) handler(request, response);
    else { response.setHeader('Content-Type', 'image/png'); response.end(EXAMPLE_PNG); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  dns.lookup = async (hostname, options) => { assert.equal(options.all, true); dnsQueries.push(hostname); return resolveAnswers ? resolveAnswers(hostname, dnsQueries.length) : [{ address: '8.8.8.8', family: 4 }]; };
  const carrier = (url, options, callback) => {
    assert.equal(options.agent, false); assert.equal(options.method, 'GET'); assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers['Accept-Encoding'], 'identity');
    options.lookup(url.hostname, { all: true }, (error, answers) => { assert.equal(error, null); assert.equal(answers.length, 1); assert.equal(answers[0].family, options.family); });
    requests.push({ host: url.hostname, path: url.pathname });
    return originalHttp(new URL(url.pathname + url.search, `http://127.0.0.1:${server.address().port}`), { ...options, lookup: undefined, family: 4 }, callback);
  };
  http.request = carrier; https.request = carrier;
  try { return await work({ requests, dnsQueries }); }
  finally { http.request = originalHttp; https.request = originalHttps; dns.lookup = originalLookup; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
