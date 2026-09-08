'use strict';

/* global window */ // dual-target module: required by Jest, loaded as a script by the page

/**
 * Convert a map of device states to a canonical LayeredLight scene string.
 *
 * @param {Object} deviceStates - Keys are device names, values are state objects or null
 *   State object: { on: boolean, dim: number (0-1), hue?: number (0-1), sat?: number (0-1), temp?: number (0-1) }
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

    if (state.passthrough) {
      token = 'null';
    } else if (state.on === false) {
      token = 'off';
    } else if (state.hue !== undefined && state.sat !== undefined) {
      token = `h${toHex(state.hue)}${toHex(state.sat)}${toHex(state.dim)}`;
    } else if (state.temp !== undefined) {
      token = `${toHex(state.dim)}${toHex(state.temp)}`;
    } else {
      token = toHex(state.dim);
    }

    parts.push(`${name}:${token}`);
  }

  return parts.join(' ');
}

/**
 * Parse a scene string into a map of device name -> value token.
 *
 * Ported from SceneManager.getSceneFromString so the settings page and the engine agree on
 * the grammar. Device names may contain spaces, so the string cannot be split on whitespace:
 * split on ':', the value is the first non-space run after the colon, and the remainder up to
 * the next colon is the next device's name.
 *
 * @param {string} sceneString - e.g. "Kjøkkenbenk Ytre:ff80 Taklys:ff"
 * @returns {Object} device name -> token, e.g. { 'Kjøkkenbenk Ytre': 'ff80', Taklys: 'ff' }
 */
function parseSceneString(sceneString) {
  const tokens = {};
  if (!sceneString) return tokens;

  const groups = String(sceneString).split(':');
  let name = groups[0].trim();

  for (let i = 1; i < groups.length; i++) {
    const match = groups[i].match(/\s*(\S+)(?:\s+([\s\S]+))?/);
    if (!match) break;

    if (name) tokens[name] = match[1];
    name = match[2] === undefined ? '' : match[2].trim();
  }

  return tokens;
}

if (typeof module !== 'undefined') {
  module.exports = { buildSceneString, parseSceneString };
} else {
  window.buildSceneString = buildSceneString;
  window.parseSceneString = parseSceneString;
}
