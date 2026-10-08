// Puts the process in test mode before any app code (and its config) loads:
// request logging off, a throwaway JWT secret, and the in-memory data source.
// Tests never touch MongoDB, even when .env has a MONGODB_URI, so they are fast
// and need no network. node --test runs each test file in its own process, so
// this does not leak between files.
process.env.NODE_ENV = 'test';
process.env.DATA_SOURCE = 'memory';
