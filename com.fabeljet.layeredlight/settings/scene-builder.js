'use strict';

/**
 * Convert a map of device states to a canonical LayeredLight scene string.
 *
 * @param {Object} deviceStates - Keys are device names, values are state objects or null
 *   State object: { on: boolean, dim: number (0-1), hue?: number (0-1), sat?: number (0-1),
 *     temp?: number (0-1), colorMode?: 'color' | 'temperature' }
 *   colorMode decides which axis is meaningful on a device that has both; without it, the
 *   presence of hue/sat or temp decides.
 *   null → device is omitted from the scene string
 *
 * @returns {string} Scene string, e.g. "Kitchen:h00ffff Bedroom:ff80 Hall:off"
 */
function toHex(value) {
  return Math.round(value * 255).toString(16).padStart(2, '0');
}

function buildSceneString(deviceStates) {
  const parts = [];

  for (const [name, state] of Object.entries(deviceStates)) {
    if (state === null) continue;

    let token;

    const hasColor = state.hue !== undefined && state.sat !== undefined;
    const hasTemp = state.temp !== undefined;
    // A device with both axes is in exactly one mode; colorMode says which. Falling back to
    // "colour wins" is what silently dropped the temperature the user had set.
    const useTemp = state.colorMode
      ? state.colorMode === 'temperature'
      : (hasTemp && !hasColor);

    if (state.passthrough) {
      token = 'null';
    } else if (state.on === false) {
      token = 'off';
    } else if (useTemp && hasTemp) {
      token = `${toHex(state.dim)}${toHex(state.temp)}`;
    } else if (hasColor) {
      token = `h${toHex(state.hue)}${toHex(state.sat)}${toHex(state.dim)}`;
    } else if (hasTemp) {
      token = `${toHex(state.dim)}${toHex(state.temp)}`;
    } else {
      token = toHex(state.dim);
    }

    parts.push(`${name}:${token}`);
  }

  return parts.join(' ');
}

if (typeof module !== 'undefined') {
  module.exports = { buildSceneString };
} else {
  window.buildSceneString = buildSceneString;
}
