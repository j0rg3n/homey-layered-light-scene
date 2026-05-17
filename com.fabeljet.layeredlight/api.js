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
    const { deviceId, dim, hue, sat, temp, onoff } = body;
    const device = await homey.app.homeyApi.devices.getDeviceById({ id: deviceId });
    const caps = [];
    if (onoff !== undefined) caps.push({ capabilityId: 'onoff', value: onoff });
    if (dim !== undefined) caps.push({ capabilityId: 'dim', value: dim });
    if (hue !== undefined) caps.push({ capabilityId: 'light_hue', value: hue });
    if (sat !== undefined) caps.push({ capabilityId: 'light_saturation', value: sat });
    if (temp !== undefined) caps.push({ capabilityId: 'light_temperature', value: temp });
    await Promise.all(caps.map(({ capabilityId, value }) => device.setCapabilityValue({ capabilityId, value })));
    return { ok: true };
  },

};
