// The current time, in one place. Code that depends on "now" (reading age,
// today's energy) calls clock.now(), so tests can replace it with a fixed time.
module.exports = {
  now: () => Date.now(),
};
