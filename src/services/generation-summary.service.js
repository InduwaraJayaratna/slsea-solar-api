// The district generation summary: a processing resource, computed on request
// from the installations and readings of one district. Nothing is stored.
const repositories = require('../repositories');
const clock = require('../utils/clock');
const AppError = require('../utils/app-error');
const { sriLankaDay, sriLankaDayOf } = require('../utils/sri-lanka-time');
const { getDistrict } = require('./district.service');
const { readingAge, dayEnergyKwh, roundKwh } = require('./reading.service');

// `date` (YYYY-MM-DD, already validated) is the Sri Lanka day to summarise;
// it defaults to today. The day decides energy_today_kwh and the peak; the
// reporting and current-power figures always describe now.
async function getDistrictGenerationSummary(user, districtId, date) {
  const district = await getDistrict(user, districtId); // 404 or 403
  const nowMs = clock.now();
  const day = date ? sriLankaDayOf(date) : sriLankaDay(nowMs);
  if (day.startMs > nowMs) {
    throw AppError.badRequest('Invalid query parameters', [
      { parameter: 'date', message: 'must not be in the future' },
    ]);
  }

  const [installations, substations] = await Promise.all([
    repositories.installations.findAll({ district_id: districtId }),
    repositories.substations.findAll({ district_id: districtId }),
  ]);
  const { installations: entries, peak } = await repositories.readings.summariseByInstallations(
    installations.map((installation) => installation.id),
    new Date(day.startMs).toISOString(),
    new Date(day.endMs).toISOString(),
  );

  // Per-installation figures, then totals for the district and each substation.
  const perInstallation = installations.map((installation, i) => {
    const entry = entries[i];
    const reporting = entry.latest !== null && !readingAge(entry.latest, nowMs).stale;
    return {
      substationId: installation.substation_id,
      capacityKw: installation.capacity_kw,
      reporting,
      // Only reporting installations count towards current power: an old
      // reading says nothing about what an installation produces now.
      currentPowerKw: reporting ? entry.latest.power_kw : 0,
      energyKwh: dayEnergyKwh(entry),
    };
  });
  const sum = (items, field) => items.reduce((total, item) => total + item[field], 0);

  const currentPowerKw = sum(perInstallation, 'currentPowerKw');
  const installedCapacityKw = sum(perInstallation, 'capacityKw');
  const reportingCount = perInstallation.filter((item) => item.reporting).length;

  return {
    district,
    date: day.date,
    generated_at: new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    installation_count: installations.length,
    reporting_count: reportingCount,
    offline_count: installations.length - reportingCount,
    current_power_kw: roundKwh(currentPowerKw),
    energy_today_kwh: roundKwh(sum(perInstallation, 'energyKwh')),
    installed_capacity_kw: roundKwh(installedCapacityKw),
    // Share of installed capacity being generated right now, as a percentage.
    utilisation_pct:
      installedCapacityKw > 0
        ? Number(((currentPowerKw / installedCapacityKw) * 100).toFixed(2))
        : 0,
    peak_power_kw: peak ? roundKwh(peak.power_kw) : 0,
    peak_at: peak ? peak.timestamp : null,
    by_substation: substations.map((substation) => {
      const onSubstation = perInstallation.filter((item) => item.substationId === substation.id);
      return {
        substation_id: substation.id,
        name: substation.name,
        installation_count: onSubstation.length,
        current_power_kw: roundKwh(sum(onSubstation, 'currentPowerKw')),
        energy_today_kwh: roundKwh(sum(onSubstation, 'energyKwh')),
      };
    }),
  };
}

module.exports = { getDistrictGenerationSummary };
