// What clients see of each resource. Every field is listed explicitly (an
// allow-list), so a field added to the data later, or an internal one such as
// device_key_hash, is never sent unless it is added here on purpose.

function serializeProvince(province) {
  return { id: province.id, name: province.name };
}

function serializeDistrict(district) {
  return { id: district.id, name: district.name, province_id: district.province_id };
}

function serializeSubstation(substation) {
  return {
    id: substation.id,
    name: substation.name,
    district_id: substation.district_id,
    voltage_kv: substation.voltage_kv,
    capacity_mva: substation.capacity_mva,
    latitude: substation.latitude,
    longitude: substation.longitude,
  };
}

// device_key_hash is deliberately left out: even a hash of a secret is internal.
function serializeInstallation(installation) {
  return {
    id: installation.id,
    substation_id: installation.substation_id,
    district_id: installation.district_id,
    province_id: installation.province_id,
    meter_id: installation.meter_id,
    inverter_id: installation.inverter_id,
    site_name: installation.site_name,
    address: installation.address,
    capacity_kw: installation.capacity_kw,
    panel_count: installation.panel_count,
    status: installation.status,
    commissioned_at: installation.commissioned_at,
    latitude: installation.latitude,
    longitude: installation.longitude,
    created_at: installation.created_at,
    updated_at: installation.updated_at,
  };
}

function serializeReading(reading) {
  return {
    id: reading.id,
    installation_id: reading.installation_id,
    timestamp: reading.timestamp,
    power_kw: reading.power_kw,
    energy_kwh: reading.energy_kwh,
    voltage_v: reading.voltage_v,
  };
}

// A short reference to a parent resource, for embedding (e.g. in an overview).
function serializeReference(record) {
  return { id: record.id, name: record.name };
}

module.exports = {
  serializeProvince,
  serializeDistrict,
  serializeSubstation,
  serializeInstallation,
  serializeReading,
  serializeReference,
};
