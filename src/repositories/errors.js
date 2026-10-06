// Errors any repository implementation may throw, so services can react the
// same way whichever data source is in use.

// A write would duplicate a value that must be unique (like a MongoDB unique
// index violation, error E11000).
class DuplicateKeyError extends Error {
  constructor(field, value) {
    super(`Duplicate ${field}: ${value}`);
    this.name = 'DuplicateKeyError';
    this.field = field;
    this.value = value;
  }
}

module.exports = { DuplicateKeyError };
