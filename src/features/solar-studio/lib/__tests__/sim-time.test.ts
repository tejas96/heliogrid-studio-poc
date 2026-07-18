import { describe, expect, it } from 'vitest';
import { simTimeDate } from '../sim-time';
import { solarHourDate, sunPosition, sunriseSunset } from '../solar';

const PUNE = { lat: 18.5204, lng: 73.8567 };

/** The exact direction-vector formula shared by Scene3D and the engine. */
function sunDir(altitude: number, azimuth: number): [number, number, number] {
  return [
    Math.cos(altitude) * Math.sin(azimuth),
    Math.sin(altitude),
    -Math.cos(altitude) * Math.cos(azimuth),
  ];
}

describe('sim time: one basis for visual sun and engine', () => {
  it('simTimeDate === the engine solarHourDate for the same solar hour', () => {
    const date = new Date(2026, 5, 21); // 21 Jun 2026 (local calendar day)
    for (const h of [6, 9.5, 12, 15.25, 18]) {
      expect(simTimeDate(date, h, PUNE.lng).getTime()).toBe(
        solarHourDate(2026, 5, 21, h, PUNE.lng).getTime(),
      );
    }
  });

  it('visual sun vector === analytic sun vector at every sampled hour', () => {
    const date = new Date(2026, 11, 21); // winter solstice
    for (let h = 6; h <= 18; h += 0.5) {
      const visual = sunPosition(simTimeDate(date, h, PUNE.lng), PUNE.lat, PUNE.lng);
      const engine = sunPosition(solarHourDate(2026, 11, 21, h, PUNE.lng), PUNE.lat, PUNE.lng);
      const v = sunDir(visual.altitude, visual.azimuth);
      const e = sunDir(engine.altitude, engine.azimuth);
      for (let i = 0; i < 3; i++) expect(v[i]).toBeCloseTo(e[i], 12);
    }
  });

  it('solar noon has the sun near its daily maximum (the old wall-clock basis was ~34 min off in IST)', () => {
    const date = new Date(2026, 2, 21);
    const altAt = (h: number) =>
      sunPosition(simTimeDate(date, h, PUNE.lng), PUNE.lat, PUNE.lng).altitude;
    const noon = altAt(12);
    // solar noon must beat every hour ±1h away — true only on the solar basis
    expect(noon).toBeGreaterThan(altAt(11));
    expect(noon).toBeGreaterThan(altAt(13));
    // and the azimuth at MEAN solar noon points roughly due south from Pune —
    // the equation of time (±16 min, ignored by mean-solar hours) can swing
    // this a few degrees; the wall-clock basis was tens of degrees off
    const az = sunPosition(simTimeDate(date, 12, PUNE.lng), PUNE.lat, PUNE.lng).azimuth;
    const azDeg = ((az * 180) / Math.PI + 360) % 360;
    expect(Math.abs(azDeg - 180)).toBeLessThan(10);
  });

  it('sun-path arc crosses the horizon where the sunrise/sunset labels say', () => {
    const date = new Date(2026, 8, 21);
    const { sunrise, sunset } = sunriseSunset(date, PUNE.lat, PUNE.lng);
    const at = (h: number) =>
      sunPosition(simTimeDate(date, h, PUNE.lng), PUNE.lat, PUNE.lng).altitude;
    // altitude flips sign within one scan step (2 min) of the labeled times
    expect(at(sunrise - 0.1)).toBeLessThan(0);
    expect(at(sunrise + 0.1)).toBeGreaterThan(0);
    expect(at(sunset - 0.1)).toBeGreaterThan(0);
    expect(at(sunset + 0.1)).toBeLessThan(0);
  });
});
