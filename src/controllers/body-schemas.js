// Request body schemas for validateBody (see src/utils/validate-body.js).

const STATUSES = ['active', 'inactive', 'maintenance'];

const LOGIN = {
  username: { type: 'string', required: true },
  password: { type: 'string', required: true },
};

// A reading sent by a metering device.
const READING = {
  timestamp: { type: 'timestamp', required: true, wholeMinute: true },
  power_kw: { type: 'number', required: true, min: 0 },
  energy_kwh: { type: 'number', required: true, min: 0 },
  voltage_v: { type: 'number', required: true, greaterThan: 0 },
};

// The installation fields an admin may set. Everything else is set by the
// server: the id, the hierarchy (from the substation it is created on), the
// device key hash and the timestamps.
const INSTALLATION = {
  meter_id: { type: 'string', required: true },
  inverter_id: { type: 'string', required: true },
  site_name: { type: 'string', required: true },
  address: { type: 'string', required: true },
  // Rooftop scale: a positive capacity of at most 100 kW.
  capacity_kw: { type: 'number', required: true, greaterThan: 0, max: 100 },
  panel_count: { type: 'integer', required: true, min: 1 },
  status: { type: 'enum', required: true, values: STATUSES },
  commissioned_at: { type: 'timestamp', required: true },
  // Roughly the bounding box of Sri Lanka, to catch swapped or mistyped coordinates.
  latitude: { type: 'number', required: true, min: 5.8, max: 10 },
  longitude: { type: 'number', required: true, min: 79.5, max: 82 },
};

// Fields clients can see but never set; sending one is a 400.
const INSTALLATION_READ_ONLY = [
  'id',
  'substation_id',
  'district_id',
  'province_id',
  'created_at',
  'updated_at',
];

module.exports = { LOGIN, READING, INSTALLATION, INSTALLATION_READ_ONLY };
