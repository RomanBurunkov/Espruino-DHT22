function DHT22(pin) {
  var ht = this;
  this.pin = pin;
  this.state = 0; // 0 - idle, 1 - reading.
  this.d;
  this.readDefMaxAttempts = 10;
  this.readStopTimeout = 50;
  this.lastRead;
  this.lastResult = { raw: '', rh: -1, temp: -1 };
  this.checksumMap = [0, 8, 16, 24];

  // Returns current sensor state so user can check if it is ready to read data.
  this.getState = function() { return ht.state === 0 ? 'ready' : 'busy'; };
  // Calculates recieved data checksum.
  this.calcChecksum = function(d) {
    return ht.checksumMap.reduce(function(a, b){
      return a + parseInt(d.substr(b, 8), 2);
    }, 0);
  };
  // Checks if calcuated checksum equal checksum from the sensor.
  this.checkChecksum = function(cks, d) { return cks && ((cks&0xFF) == parseInt(d.substr(32, 8), 2)); };
  // Returns sucsessfull results.
  this.successResult = function(d) {
    return {
      raw: d,
      rh: parseInt(d.substr(0, 16), 2) * 0.1,
      temp: parseInt(d.substr(17, 15), 2) * 0.2 * (0.5 - d[16])
    };
  };
  // Returns failed results.
  this.failedResult = function(d, cks) {
    return {
      err: true,
      checksumError: cks > 0,
      raw: d,
      rh: -1,
      temp: -1,
    };
  };
  // Starts reading data from sensors, returns watching id.
  this.startRead = function() {
    ht.d = '';
    digitalWrite(ht.pin, 0);
    pinMode(ht.pin, 'output'); // force pin state to output.
    // raise pulse after 2ms, since dht22 datasheet says time should be 1ms at least.
    setTimeout(function() {
      pinMode(ht.pin,'input_pullup');
      pinMode(ht.pin);
    }, 2);
    // start watching for state change
    return setWatch(function(t) {
      ht.d += 0 | (t.time - t.lastTime > 0.00005);
    }, ht.pin, { repeat: true, edge: -1 });
  };
  // Try next read attempt
  this.nextAttempt = function(cb, n) {
    // If read data failed and we already done n attempts.
    if (n < 1) {
      ht.state = 0;
      ht.lastResult = ht.failedResult(ht.d, cks);
      return cb(ht.lastResult);
    }
    // Try to read data one more time.
    setTimeout(function() {
      ht.state = 0;
      n -= 1;
      ht.read(cb, n);
    }, 500);
  };
  // Checks results and starts next attempt if previous failed.
  this.checkResult = function(cb, n) {
    // Sensor response should be 40 bits, if no trying to read data one more time.
    if (ht.d.length < 40) return ht.nextAttempt(cb, n);
    ht.d = ht.d.substr(-40);
    // Calculate and match checksums.
    var cks = ht.calcChecksum(ht.d);
    // Shecksum doesn't match with a data, trying to read data one more time.
    if (!ht.checkChecksum(cks, ht.d)) return ht.nextAttempt(cb, n);
    // Well done, return data to cb function.
    ht.state = 0;
    ht.lastResult = ht.successResult(ht.d);
    return cb(ht.lastResult);  
  };
  // Read data from the sensor.
  this.read = function (cb, n) {
    // check if we are still reading data from the sensor's pin.
    if (ht.state === 1) return cb({ err: true, state: 'busy', rh: -1, temp: -1 });
    ht.state = 1;
    // check if last read was less then two seconds ago.
    // if so return the last results from sensor.
    if (ht.lastRead - Date.now() < 2000) return cb(ht.lastResult);
    // Define read attempts amount.
    n = n || ht.readDefMaxAttempts;
    var watch = ht.startRead();
    // Stop looking data and check results after ht.readStopTimeout reached.
    setTimeout(function() {
      if (watch) clearWatch(watch); // Checks watch before clearing, since in v.2.03 it leads to an error.
      ht.checkResult(cb, n);
    }, ht.readStopTimeout);
  };
}

exports.connect = function(pin) {
  return new DHT22(pin);
};
