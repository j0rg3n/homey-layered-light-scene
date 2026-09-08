'use strict';

// eslint-disable-next-line no-unused-vars
var exports = {}; // SDK injects Object.defineProperty(exports,'__esModule',...) at line 2; needs an object
var sceneStates = {};
var deviceInfo = {};
var variablesList = [];
var previewTimers = {};
var statusTimer = null;

function initApp(devices, variables) {
  sceneStates = {};
  deviceInfo = {};
  variablesList = variables || [];
  previewTimers = {};

  for (var i = 0; i < devices.length; i++) {
    deviceInfo[devices[i].id] = devices[i];
  }

  var spinner = document.getElementById('device-spinner');
  if (spinner) spinner.style.display = 'none';

  populateVariableSelects(variables);
  populateDeviceCheckboxes(devices);

  document.getElementById('var-load-btn').addEventListener('click', onLoadVariable);
  document.getElementById('copy-btn').addEventListener('click', onCopy);
  document.getElementById('write-btn').addEventListener('click', onWriteVariable);
}

function addOption(select, id, name) {
  var opt = document.createElement('option');
  opt.value = id;
  opt.textContent = name;
  select.appendChild(opt);
}

function populateVariableSelects(variables) {
  var loadSelect = document.getElementById('var-load-select');
  var writeSelect = document.getElementById('var-write-select');

  for (var i = 0; i < variables.length; i++) {
    var v = variables[i];
    addOption(loadSelect, v.id, v.name);
    addOption(writeSelect, v.id, v.name);
  }
}

function populateDeviceCheckboxes(devices) {
  var container = document.getElementById('device-checkboxes');
  container.innerHTML = '';

  for (var i = 0; i < devices.length; i++) {
    var dev = devices[i];

    var label = document.createElement('label');
    label.className = 'device-row';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.deviceId = dev.id;
    cb.dataset.deviceName = dev.name;
    cb.dataset.hasColor = dev.caps.hasColor ? '1' : '0';
    cb.dataset.hasTemp = dev.caps.hasTemp ? '1' : '0';

    cb.addEventListener('change', (function (d) {
      return function () { onDeviceToggle(d.id, this.checked, d); };
    }(dev)));

    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + dev.name));
    container.appendChild(label);
  }
}

// A light with both colour and white is in exactly one mode at a time — Homey's light_mode
// capability decides which axis it actually applies. Seeding both hue/sat and temp made the
// temperature slider a no-op, so the state carries a mode and only that mode's values.
function defaultState(info, on) {
  var state = { on: on };
  if (info.caps.hasDim) { state.dim = 1; }

  if (info.caps.hasColor) {
    state.colorMode = 'color';
    state.hue = 0;
    state.sat = 1;
  } else if (info.caps.hasTemp) {
    state.colorMode = 'temperature';
    state.temp = 0.5;
  }

  return state;
}

// Switching mode drops the other axis, so the scene string and the preview cannot disagree
// about which one the user meant.
function setColorMode(deviceId, mode) {
  var state = sceneStates[deviceId];
  if (!state) return;

  state.colorMode = mode;
  if (mode === 'temperature') {
    delete state.hue;
    delete state.sat;
    if (state.temp === undefined) state.temp = 0.5;
  } else {
    delete state.temp;
    if (state.hue === undefined) state.hue = 0;
    if (state.sat === undefined) state.sat = 1;
  }
}

function onDeviceToggle(deviceId, checked, info) {
  if (checked) {
    sceneStates[deviceId] = defaultState(info, true);
  } else {
    sceneStates[deviceId] = null;
  }
  renderDeviceCards();
  updateSceneOutput();
}

function renderDeviceCards() {
  var container = document.getElementById('device-cards');

  var existingCards = container.querySelectorAll('.device-card');
  for (var i = 0; i < existingCards.length; i++) {
    var cardId = existingCards[i].dataset.deviceId;
    if (!sceneStates[cardId]) container.removeChild(existingCards[i]);
  }

  for (var id in sceneStates) {
    if (!sceneStates[id]) continue;
    if (container.querySelector('.device-card[data-device-id="' + id + '"]')) continue;

    var dev = deviceInfo[id];
    if (!dev) continue;

    var card = buildDeviceCard(dev);
    container.appendChild(card);
    attachCardHandlers(card, id, dev);
    var state = sceneStates[id];
    applyColorModeToCard(card, state);
    if (state && state.passthrough) {
      card.querySelector('.ctrl-mode').value = 'null';
      card.querySelector('.controls').style.display = 'none';
    } else if (state && state.on === false) {
      card.querySelector('.ctrl-mode').value = 'off';
    }
    updateColorSwatch(card, id);
  }
}

function makeSliderRow(className, labelText, defaultValue) {
  var row = document.createElement('div');
  row.className = 'control-row';
  var lbl = document.createElement('label');
  lbl.textContent = labelText;
  var input = document.createElement('input');
  input.type = 'range';
  input.className = className;
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = String(defaultValue);
  lbl.appendChild(input);
  row.appendChild(lbl);
  return row;
}

function buildDeviceCard(dev) {
  var card = document.createElement('div');
  card.className = 'device-card';
  card.dataset.deviceId = dev.id;

  var header = document.createElement('div');
  header.className = 'card-header';

  var nameSpan = document.createElement('span');
  nameSpan.className = 'device-name';
  nameSpan.textContent = dev.name;
  header.appendChild(nameSpan);

  var modeSelect = document.createElement('select');
  modeSelect.className = 'ctrl-mode';
  [['on', 'On'], ['off', 'Off'], ['null', 'Pass-through']].forEach(function (pair) {
    var opt = document.createElement('option');
    opt.value = pair[0];
    opt.textContent = pair[1];
    modeSelect.appendChild(opt);
  });
  header.appendChild(modeSelect);
  card.appendChild(header);

  var controls = document.createElement('div');
  controls.className = 'controls';

  if (dev.caps.hasDim) {
    controls.appendChild(makeSliderRow('ctrl-dim', 'Dim: ', 1));
  }

  if (dev.caps.hasColor && dev.caps.hasTemp) {
    var modeRow = document.createElement('div');
    modeRow.className = 'control-row';
    var modeLabel = document.createElement('label');
    modeLabel.textContent = 'Mode: ';
    var colorModeSelect = document.createElement('select');
    colorModeSelect.className = 'ctrl-colormode';
    [['color', 'Colour'], ['temperature', 'White']].forEach(function (pair) {
      var opt = document.createElement('option');
      opt.value = pair[0];
      opt.textContent = pair[1];
      colorModeSelect.appendChild(opt);
    });
    modeLabel.appendChild(colorModeSelect);
    modeRow.appendChild(modeLabel);
    controls.appendChild(modeRow);
  }

  if (dev.caps.hasColor) {
    var colorGroup = document.createElement('div');
    colorGroup.className = 'color-group';
    var swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    colorGroup.appendChild(swatch);
    colorGroup.appendChild(makeSliderRow('ctrl-hue', 'Hue: ', 0));
    colorGroup.appendChild(makeSliderRow('ctrl-sat', 'Saturation: ', 1));
    controls.appendChild(colorGroup);
  }

  if (dev.caps.hasTemp) {
    var tempGroup = document.createElement('div');
    tempGroup.className = 'temp-group';
    tempGroup.appendChild(makeSliderRow('ctrl-temp', 'Temp: ', 0.5));
    controls.appendChild(tempGroup);
  }

  card.appendChild(controls);
  return card;
}

function attachCardHandlers(card, deviceId, dev) {
  var controls = card.querySelector('.controls');

  card.querySelector('.ctrl-mode').addEventListener('change', function () {
    if (!sceneStates) return;
    var mode = this.value;
    if (mode === 'null') {
      sceneStates[deviceId] = { passthrough: true };
      controls.style.display = 'none';
    } else {
      if (!sceneStates[deviceId] || sceneStates[deviceId].passthrough) {
        sceneStates[deviceId] = defaultState(dev, mode === 'on');
      } else {
        sceneStates[deviceId].on = (mode === 'on');
      }
      controls.style.display = '';
    }
    updateSceneOutput();
    schedulePreview(deviceId);
  });

  if (dev.caps.hasDim) {
    card.querySelector('.ctrl-dim').addEventListener('input', function () {
      onControlChange(deviceId, 'dim', parseFloat(this.value));
    });
  }

  if (dev.caps.hasColor) {
    card.querySelector('.ctrl-hue').addEventListener('input', function () {
      onControlChange(deviceId, 'hue', parseFloat(this.value));
    });
    card.querySelector('.ctrl-sat').addEventListener('input', function () {
      onControlChange(deviceId, 'sat', parseFloat(this.value));
    });
  }

  if (dev.caps.hasTemp) {
    card.querySelector('.ctrl-temp').addEventListener('input', function () {
      onControlChange(deviceId, 'temp', parseFloat(this.value));
    });
  }

  var colorModeSelect = card.querySelector('.ctrl-colormode');
  if (colorModeSelect) {
    colorModeSelect.addEventListener('change', function () {
      setColorMode(deviceId, this.value);
      applyColorModeToCard(card, sceneStates[deviceId]);
      updateColorSwatch(card, deviceId);
      updateSceneOutput();
      schedulePreview(deviceId);
    });
  }
}

// Only the active mode's controls are shown: a visible temperature slider on a lamp in colour
// mode is a control that provably does nothing.
function applyColorModeToCard(card, state) {
  var colorGroup = card.querySelector('.color-group');
  var tempGroup = card.querySelector('.temp-group');
  if (!colorGroup || !tempGroup) return;

  var mode = (state && state.colorMode) || 'color';
  var select = card.querySelector('.ctrl-colormode');
  if (select) select.value = mode;

  colorGroup.style.display = mode === 'temperature' ? 'none' : '';
  tempGroup.style.display = mode === 'temperature' ? '' : 'none';
}

function schedulePreview(deviceId) {
  clearTimeout(previewTimers[deviceId]);
  previewTimers[deviceId] = setTimeout(function () { sendPreview(deviceId); }, 300);
}

function onControlChange(deviceId, field, value) {
  if (!sceneStates || !sceneStates[deviceId]) return;

  sceneStates[deviceId][field] = value;

  var card = document.getElementById('device-cards')
    .querySelector('.device-card[data-device-id="' + deviceId + '"]');
  if (card) updateColorSwatch(card, deviceId);

  updateSceneOutput();

  schedulePreview(deviceId);
}

function updateColorSwatch(card, deviceId) {
  var swatch = card.querySelector('.color-swatch');
  if (!swatch) return;

  var state = sceneStates[deviceId];
  if (!state) return;

  var hue = state.hue !== undefined ? state.hue : 0;
  var sat = state.sat !== undefined ? state.sat : 1;
  var dim = state.dim !== undefined ? state.dim : 1;

  // HSV → HSL: l = dim*(1-sat/2); s = (dim-l)/min(l,1-l) when l is neither 0 nor 1
  var l = dim * (1 - sat / 2);
  var s = (l === 0 || l === 1) ? 0 : (dim - l) / Math.min(l, 1 - l);

  swatch.style.backgroundColor = 'hsl(' + (hue * 360) + ',' + (s * 100) + '%,' + (l * 100) + '%)';
}

function updateSceneOutput() {
  var byName = {};
  for (var id in sceneStates) {
    var dev = deviceInfo[id];
    if (dev) byName[dev.name] = sceneStates[id];
  }
  document.getElementById('scene-output').value = buildSceneString(byName);
}

function sendPreview(deviceId) {
  if (typeof Homey === 'undefined') return;
  if (!sceneStates[deviceId] || sceneStates[deviceId].passthrough) return;

  var state = sceneStates[deviceId];
  var mode = state.colorMode || (state.temp !== undefined ? 'temperature' : 'color');

  var body = { deviceId: deviceId, mode: mode, onoff: state.on };
  if (state.dim !== undefined) body.dim = state.dim;

  // Send only the axis the mode governs — the other one is not just redundant, it overrides.
  if (mode === 'temperature') {
    if (state.temp !== undefined) body.temp = state.temp;
  } else {
    if (state.hue !== undefined) body.hue = state.hue;
    if (state.sat !== undefined) body.sat = state.sat;
  }

  var name = deviceInfo[deviceId] ? deviceInfo[deviceId].name : deviceId;
  Homey.api('POST', '/preview', body, function (err) {
    // An empty callback here is what made the original bug invisible: a rejected preview and
    // an unresponsive lamp looked identical.
    if (err) {
      dbg('preview error for ' + name + ': ' + JSON.stringify(err));
      showStatus('Preview failed for ' + name + ': ' + (err.message || err), true);
    }
  });
}

function onLoadVariable() {
  var varId = document.getElementById('var-load-select').value;
  if (!varId) return;

  var variable = null;
  for (var i = 0; i < variablesList.length; i++) {
    if (variablesList[i].id === varId) { variable = variablesList[i]; break; }
  }
  if (!variable || !variable.value) return;

  parseSceneStringIntoState(variable.value);
  renderDeviceCards();
  syncCheckboxes();
  updateSceneOutput();
}

function parseSceneStringIntoState(sceneStr) {
  var parts = sceneStr.trim().split(/\s+/);

  var nameToId = {};
  for (var id in deviceInfo) nameToId[deviceInfo[id].name] = id;

  for (var i = 0; i < parts.length; i++) {
    var colonIdx = parts[i].indexOf(':');
    if (colonIdx < 0) continue;

    var name = parts[i].substring(0, colonIdx);
    var token = parts[i].substring(colonIdx + 1);
    var devId = nameToId[name];
    if (!devId) continue;

    sceneStates[devId] = parseToken(token);
  }
}

function parseToken(token) {
  if (token === 'null') return { passthrough: true };
  if (token === 'off') return { on: false };

  if (token.charAt(0) === 'h' && token.length === 7) {
    return {
      on: true,
      colorMode: 'color',
      hue: parseInt(token.substring(1, 3), 16) / 255,
      sat: parseInt(token.substring(3, 5), 16) / 255,
      dim: parseInt(token.substring(5, 7), 16) / 255
    };
  }

  if (token.length === 4) {
    return {
      on: true,
      colorMode: 'temperature',
      dim: parseInt(token.substring(0, 2), 16) / 255,
      temp: parseInt(token.substring(2, 4), 16) / 255
    };
  }

  if (token.length === 2) {
    return { on: true, dim: parseInt(token, 16) / 255 };
  }

  return { on: true, dim: 1 };
}

function syncCheckboxes() {
  var checkboxes = document.querySelectorAll('#device-checkboxes input[type=checkbox]');
  for (var i = 0; i < checkboxes.length; i++) {
    var cb = checkboxes[i];
    cb.checked = Boolean(sceneStates[cb.dataset.deviceId]);
  }
}

function onCopy() {
  var text = document.getElementById('scene-output').value;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(function () { showStatus('Copied!', false); })
      .catch(function () { showStatus('Copy failed', true); });
  } else {
    showStatus('Clipboard not available', true);
  }
}

function onWriteVariable() {
  var varId = document.getElementById('var-write-select').value;
  if (!varId) { showStatus('Select a variable first', true); return; }

  var value = document.getElementById('scene-output').value;
  Homey.api('POST', '/variable', { id: varId, value: value }, function (err) {
    if (err) showStatus('Error: ' + err.message, true);
    else showStatus('Saved!', false);
  });
}

function showStatus(message, isError) {
  var el = document.getElementById('status');
  el.textContent = message;
  el.className = (isError ? 'error' : 'success') + ' visible';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(function () { el.textContent = ''; el.className = ''; }, 3000);
}

window.initApp = initApp;

function dbg(msg) {
  console.log('[LayeredLight]', msg);
}

// eslint-disable-next-line no-unused-vars
function onHomeyReady(Homey) {
  Homey.ready();
  dbg('onHomeyReady called');
  Homey.api('GET', '/devices', null, function (err, devices) {
    if (err) { dbg('devices error: ' + JSON.stringify(err)); return; }
    dbg('devices ok: ' + JSON.stringify(devices));
    Homey.api('GET', '/variables', null, function (err2, variables) {
      if (err2) { dbg('variables error: ' + JSON.stringify(err2)); return; }
      dbg('variables ok, calling initApp');
      initApp(devices, variables);
    });
  });
}
