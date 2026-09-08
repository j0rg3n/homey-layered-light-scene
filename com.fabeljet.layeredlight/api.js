'use strict';

// Homey serializes capability calls per device, so the order below is the order the light
// applies them: mode first (it decides whether colour or temperature is even live), then the
// colour axes, then brightness, then on/off. Sending dim/onoff first makes the lamp flash its
// previous colour before the new one arrives.
function previewCommands(body, hasCapability) {
  const {
    mode, dim, hue, sat, temp, onoff,
  } = body;

  const commands = [];

  const wantsTemp = mode === 'temperature';
  const wantsColor = mode === 'color' || (mode === undefined && hue !== undefined);

  // A lamp in colour mode ignores light_temperature, and one in temperature mode ignores
  // hue/saturation, so the mode has to be set before the values it governs.
  if (hasCapability('light_mode') && (wantsTemp || wantsColor)) {
    commands.push({ capabilityId: 'light_mode', value: wantsTemp ? 'temperature' : 'color' });
  }

  if (wantsTemp) {
    if (temp !== undefined) commands.push({ capabilityId: 'light_temperature', value: temp });
  } else {
    if (hue !== undefined) commands.push({ capabilityId: 'light_hue', value: hue });
    if (sat !== undefined) commands.push({ capabilityId: 'light_saturation', value: sat });
  }

  if (dim !== undefined) commands.push({ capabilityId: 'dim', value: dim });
  if (onoff !== undefined) commands.push({ capabilityId: 'onoff', value: onoff });

  return commands.filter((c) => hasCapability(c.capabilityId));
}

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
          hasMode: 'light_mode' in (d.capabilitiesObj ?? {}),
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
    const { deviceId } = body;
    const device = await homey.app.homeyApi.devices.getDeviceById({ id: deviceId });
    const capabilities = device.capabilitiesObj ?? {};
    const commands = previewCommands(body, (id) => id in capabilities);

    homey.app.log(`Preview ${device.name}: ${JSON.stringify(body)} -> ${commands.map((c) => c.capabilityId).join(', ') || 'nothing'}`);

    if (commands.length === 0) {
      // Silence here is what made the original bug invisible — say so instead.
      const available = Object.keys(capabilities).join(', ');
      throw new Error(`No applicable capabilities on ${device.name} (has: ${available})`);
    }

    // Sequential, not Promise.all: the order is the point (see previewCommands).
    for (const { capabilityId, value } of commands) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await device.setCapabilityValue({ capabilityId, value });
      } catch (error) {
        homey.app.error(`Preview ${device.name} ${capabilityId}=${value} failed: ${error.message}`);
        throw new Error(`${device.name}: ${capabilityId} failed — ${error.message}`);
      }
    }

    return { ok: true };
  },

  // Exported for unit testing the ordering rules without a Homey device.
  _previewCommands: previewCommands,

};
