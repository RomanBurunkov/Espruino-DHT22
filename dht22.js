function DHT22(pin) {
  var ht = this;
  this.pin = pin;
  this.state = 0; // 0 - idle, 1 - reading.
  this.d;
  this.watch;
  this.readDefMaxAttempts = 10;
  this.readStopTimeout = 50;
  this.lastRead;
  this.lastResult = { raw: '', rh: -1, temp: -1 };
  this.checksumMap = [2, 10, 18, 26];

  // Returns current sensor state so user can check if it is ready to read data.
  this.getState = function() { return ht.state === 0 ? 'ready' : 'busy'; };
  // Calculates recieved data checksum.
  this.calcChecksum = function(d) {
    return ht.checksumMap.reduce(function(a, b){
      return a + parseInt(d.substr(b, 8), 2);
    }, 0);
  };
  // Checks if calcuated checksum equal checksum from the sensor.
  this.checkChecksum = function(cks, d) { return cks && ((cks&0xFF) == parseInt(d.substr(34, 8), 2)); };
  // Returns sucsessfull results.
  this.successResult = function(d) {
    return {
      raw: d,
      rh: parseInt(d.substr(2, 16), 2) * 0.1,
      temp: parseInt(d.substr(19, 15), 2) * 0.2 * (0.5 - d[18])
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
  // Starts watching changes on sensors's pin.
  this.startWatch = function(){
    ht.d = '';
    digitalWrite(ht.pin, 0);
    pinMode(ht.pin, 'output'); // force pin state to output.
    // start watching for state change
    ht.watch = setWatch(function(t) {
      ht.d += 0 | (t.time - t.lastTime > 0.00005);
    }, ht.pin, { repeat: true, edge: -1 });
    // raise pulse after 2ms, since dht22 datasheet says time should be 1ms at least.
    setTimeout(function() {
      pinMode(ht.pin,'input_pullup');
      pinMode(ht.pin);
    }, 2);
  };
  // Checks results and starts next attempt if previous failed.
  this.checkResult = function(cb, n) {
    // Checks ft.watch before clearing, since in v.2.03 it leads to an error.
    if (ht.watch) clearWatch(ht.watch);
    ht.watch = null;
    var cks = ht.calcChecksum(ht.d);
    // 
    if (ht.checkChecksum(cks, ht.d)) {
      ht.state = 0;
      ht.lastResult = ht.successResult(ht.d);
      return cb(ht.lastResult);
    }
    // 
    if (n < 1) {
      ht.state = 0;
      ht.lastResult = ht.failedResult(ht.d, cks);
      return cb(ht.lastResult);
    }
    //
    setTimeout(function() {
      ht.state === 0;
      n -= 1;
      ht.read(cb, n);
    }, 500);
  };
  //
  this.read = function (cb, n) {
    // check if we are still reading data from the sensor's pin.
    if (ht.state === 1) return cb({ err: true, state: 'busy', rh: -1, temp: -1 });
    ht.state === 1;
    // check if last read was less then two seconds ago.
    if (ht.lastRead - Date.now() < 2000) return cb(ht.lastResult);

    n = n || ht.readDefMaxAttempts;
    ht.startWatch();
    // Stop looking and check results after ht.readStopTimeout ms.
    setTimeout(function() { ht.checkResult(cb, n); }, ht.readStopTimeout);
  };
}

exports.connect = function(pin) {
    return new DHT22(pin);
};
