var READ_MIN_INTERVAL = 2000;
var READ_MAX_ATTEMPTS = 10;
var READ_STOP_TIMEOUT = 50;
var CHECKSUM_MAP = [0, 8, 16, 24];

// Console log if debug true.
function dht22DebugLog(ht, msg) {
  if (ht.debug !== true) return;
  console.log(msg);
}
// Calculates dht22 recieved data checksum.
function dht22Checksum(data) {
  if (data.length < 32) return 0;
  return CHECKSUM_MAP.reduce(function (a, b) {
    return a + parseInt(data.substr(b, 8), 2);
  }, 0);
}
// Checks if calcuated checksum equal checksum got from the sensor.
function dht22ChecksumMatch(checksum, data) {
  if (data.length < 40) return false;
  if (!checksum) return false;
  return (checksum & 0xFF) == parseInt(data.substr(32, 8), 2);
}
// Returns sucsessfull results.
function dht22OkResult(ht) {
  return {
    err: false,
    raw: ht.data,
    rh: parseInt(ht.data.substr(0, 16), 2) * 0.1,
    temp: parseInt(ht.data.substr(17, 15), 2) * 0.2 * (0.5 - ht.data[16]),
    attempts: ht.attempts
  };
}
// Returns failed results.
function dht22BadResult(ht, err) {
  return { err: err, raw: ht.data, rh: -1, temp: -1, attempts: ht.attempts };
}
// Starts reading data from DHT22 sensor, returns watching id.
// It raises pulse after 2ms, since dht22 datasheet says time should be 1ms at least.
function dht22StartRead(ht) {
  digitalWrite(ht.pin, 0);
  pinMode(ht.pin, 'output');
  setTimeout(function() {
    pinMode(ht.pin,'input_pullup');
    pinMode(ht.pin);
  }, 2);
  return setWatch(function(t) {
    ht.data += 0 | (t.time - t.lastTime > 0.00005);
  }, ht.pin, { repeat: true, edge: -1 });
}
// returns copy of the last results
function dht22GetLastResult(ht) {
  return {
    err: ht.lastResult.err,
    raw: ht.lastResult.raw,
    rh: ht.lastResult.rh,
    temp: ht.lastResult.temp,
    attempts: ht.attempts
  };
}
// Resets counters/timers/state and then returns copy of the last results into cb.
function dht22ReturnResult(ht, result) {
  ht.lastResult = result;
  var res = dht22GetLastResult(ht);
  var cb = ht.cb;
  if (ht.stopTimeout) clearTimeout(ht.stopTimeout);
  ht.state = 0;
  ht.attempts = 0;
  ht.attemptsMax = 0;
  ht.cb = null;
  cb(res);
}
// Try next read attempt if we haven't ran out of max attempts.
function dht22NextAttempt(ht, err) {
  err = err || 'Maximum attempts reached.';
  if (ht.attempts >= ht.attemptsMax) {
    dht22DebugLog(ht, 'Maximum attempts reached:' + ht.attempts);
    return dht22ReturnResult(ht, dht22BadResult(ht, err));
  }
  // Try to read data one more time.
  setTimeout(function() {
    ht.attempts += 1;
    dht22Read(ht);
  }, 500);
}
// Checks results and starts next attempt if previous failed.
// Sensor response should be 40 bits, if no trying to read data one more time.
function dht22CheckResult(ht) {
  if (ht.data.length < 40) {
    return dht22NextAttempt(ht.cb, 'Data length less then expected(40 bits).');
  }
  ht.data = ht.data.substr(-40);
  var cks = dht22Checksum(ht.data);
  if (!dht22ChecksumMatch(cks, ht.data)) {
    return dht22NextAttempt(ht, 'Checksum error.');
  }
  dht22ReturnResult(ht, dht22OkResult(ht));
}
// Set states and starts reading data from the sensor.
// It stops reading data and check results whether READ_STOP_TIMEOUT reached.
// It also checks watch before clearing it, since in v.2.03 it leads to an error.
function dht22Read(ht) {
  dht22DebugLog(ht, 'Start reading data from the sensor, attempt:' + ht.attempts);
  ht.state = 1;
  ht.d = '';
  ht.watch = dht22StartRead(ht);
  ht.stopTimeout = setTimeout(function() {
    dht22DebugLog(ht, 'Data from sensor: ' + ht.data);
    dht22DebugLog(ht, 'Stop reading data from the sensor, attempt:' + ht.attempts);
    if (ht.watch) clearWatch(ht.watch);
    dht22CheckResult(ht);
  }, READ_STOP_TIMEOUT);
}

/**
 * DHT22 Sensor Module
 *  state details: // 0 - idle, 1 - reading data.
 *  read method checks:
 *    if we are still reading data from the sensor.
 *    if last read was less then READ_MIN_INTERVAL.
 * @param pin - sensor pin
 * @param {boolean} debug - log some debug info is set to true.
 */
function DHT22(pin, debug) {
  this.pin = pin;
  this.debug = debug || false;
  this.state = 0;
  this.data = '';
  this.attempts = -1;
  this.attemptsMax = -1;
  this.cb = null;
  this.stopTimeout = null;
  this.lastRead = 0;
  this.lastResult = { raw: '', rh: -1, temp: -1 };

  this.getState = function() {
    return this.state === 0 ? 'ready' : 'reading';
  };

  this.read = function (cb, n) {
    if (this.state === 1) return cb(dht22BadResult(this, 'Read in progress.'));
    if (this.lastRead - Date.now() < READ_MIN_INTERVAL) return cb(dht22GetLastResult(this));
    this.attempts = 1;
    this.attemptsMax = n || READ_MAX_ATTEMPTS;
    this.cb = cb;
    dht22Read(this);
  };
}

exports.connect = function(pin) {
  return new DHT22(pin);
};
