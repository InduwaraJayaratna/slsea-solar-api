// Every Mongoose model, by collection name.
module.exports = {
  provinces: require('./province'),
  districts: require('./district'),
  substations: require('./substation'),
  installations: require('./installation'),
  readings: require('./reading'),
  users: require('./user'),
  counters: require('./counter'),
};
