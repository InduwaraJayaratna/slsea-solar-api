// Puts the process in test mode before any app code (and its config) loads:
// request logging off, and a throwaway JWT secret. node --test runs each test
// file in its own process, so this does not leak between files.
process.env.NODE_ENV = 'test';
