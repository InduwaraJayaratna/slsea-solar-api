const { test } = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../src/utils/app-error');

test('each helper sets the right status and code', () => {
  const cases = [
    [AppError.badRequest('x'), 400, 'BAD_REQUEST'],
    [AppError.unauthorized(), 401, 'UNAUTHORIZED'],
    [AppError.forbidden(), 403, 'FORBIDDEN'],
    [AppError.notFound(), 404, 'NOT_FOUND'],
    [AppError.methodNotAllowed('PUT', ['GET']), 405, 'METHOD_NOT_ALLOWED'],
    [AppError.notAcceptable(), 406, 'NOT_ACCEPTABLE'],
    [AppError.conflict('x'), 409, 'CONFLICT'],
    [AppError.preconditionFailed(), 412, 'PRECONDITION_FAILED'],
    [AppError.payloadTooLarge(), 413, 'PAYLOAD_TOO_LARGE'],
    [AppError.unsupportedMediaType(), 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [AppError.internal(), 500, 'INTERNAL_ERROR'],
  ];
  for (const [error, status, code] of cases) {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    assert.deepEqual(error.details, []);
  }
});

test('unauthorized carries a WWW-Authenticate challenge', () => {
  assert.equal(
    AppError.unauthorized().headers['WWW-Authenticate'],
    'Bearer realm="slsea-solar-api"',
  );
  assert.equal(
    AppError.unauthorized('x', [], 'DeviceKey').headers['WWW-Authenticate'],
    'DeviceKey',
  );
});

test('details are kept when given', () => {
  const details = [{ field: 'capacity_kw', issue: 'must be a number' }];
  assert.deepEqual(AppError.badRequest('Invalid body', details).details, details);
});
