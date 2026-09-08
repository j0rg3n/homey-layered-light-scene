'use strict';

module.exports = {

  async getDevices({ homey }) {
    const devices = await homey.app.homeyApi.devices.getDevices();
    return Object.values(devices)
      .filter((d) => d.class === 'light' || d.virtualClass === 'light')
      .map((d) => ({
        id: d.id,
        name: d.name,
        caps: {
          hasDim: 'dim' in (d.capabilitiesObj ?? {}),
          hasColor: 'light_hue' in (d.capabilitiesObj ?? {}),
          hasTemp: 'light_temperature' in (d.capabilitiesObj ?? {}),
        },
      }));
  },

  async getVariables({ homey }) {
    const vars = await homey.app.homeyApi.logic.getVariables();
    return Object.values(vars)
      .filter((v) => v.type === 'string')
      .map((v) => ({ id: v.id, name: v.name, value: v.value }));
  },

  async postVariable({ homey, body }) {
    const { id, value } = body;
    await homey.app.homeyApi.logic.updateVariable({ id, variable: { value } });
    return { ok: true };
  },

  async postPreview({ homey, body }) {
    const {
      deviceId, dim, hue, sat, temp, onoff,
    } = body;

    homey.app.log(`Preview request: ${JSON.stringify(body)}`);

    // getDevice is the only getOne operation ManagerDevices exposes — getDeviceById does not
    // exist and throws `no such function`, which is what made preview a no-op from the start.
    const device = await homey.app.homeyApi.devices.getDevice({ id: deviceId });

    const caps = [];
    if (onoff !== undefined) caps.push({ capabilityId: 'onoff', value: onoff });
    if (dim !== undefined) caps.push({ capabilityId: 'dim', value: dim });
    if (hue !== undefined) caps.push({ capabilityId: 'light_hue', value: hue });
    if (sat !== undefined) caps.push({ capabilityId: 'light_saturation', value: sat });
    if (temp !== undefined) caps.push({ capabilityId: 'light_temperature', value: temp });

    homey.app.log(`Preview ${device.name}: setting ${caps.map((c) => `${c.capabilityId}=${c.value}`).join(', ') || 'nothing'}`);

    const results = await Promise.all(caps.map(async ({ capabilityId, value }) => {
      try {
        await device.setCapabilityValue({ capabilityId, value });
        return null;
      } catch (error) {
        homey.app.error(`Preview ${device.name} ${capabilityId}=${value} failed: ${error.message}`);
        return `${capabilityId}: ${error.message}`;
      }
    }));

    const failures = results.filter((r) => r !== null);
    if (failures.length > 0) {
      // Throwing is what puts the reason in front of the user instead of leaving the page
      // looking like an unresponsive lamp.
      throw new Error(`${device.name} — ${failures.join('; ')}`);
    }

    homey.app.log(`Preview ${device.name}: ok`);
    return { ok: true };
  },

};
