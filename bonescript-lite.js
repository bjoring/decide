/*
 * lightweight replacement for bonescript. Assumes you have everything set up
 * via device tree overlay
 */

var fs = require('fs');
var debug = process.env.DEBUG ? true : false;

var f = {};

f.read_eeprom = function(addr) {
  // reads the contents of a cape eeprom on the i2c bus at addr and returns the
  // contents
  var path = "/sys/bus/i2c/devices/" + addr + "/eeprom";
  var fd = fs.openSync(path, "r");
  var buf = new Buffer(244);
  fs.readSync(fd, buf, 0, 244, 0);
  return {
    // TODO strip nulls
    "board": buf.toString('ascii', 6, 6+32),
    "part": buf.toString('ascii', 58, 58+16),
    "revision": buf.toString("ascii", 38, 38+4),
    "serial": buf.toString("ascii", 76, 76+12)
  }
}

f.gpio_monitor = function(dev, callback) {
  // monitors a /dev/input device. This is used to capture events from GPIO
  // inputs that have been defined with gpio-keys in the device tree. For each
  // rising or falling event, callback is called with the timestamp [seconds,
  // microseconds], the key code, and the value (1 for falling and 0 for
  // rising).
  //
  // TODO: method to detach?

  var EV_KEY = 1;

  var bufsize = 24;
  var buf = new Buffer(bufsize);

  function reader(err, fd) {
    if (err) {
      callback(err, null);
      return;
    }
    fs.read(fd, buf, 0, bufsize, null, function(err, N) {
      if (err === null && buf.readUInt16LE(16) === EV_KEY) {
        callback(null, {
          'time': [buf.readUInt32LE(0), buf.readUInt32LE(8)],
          'key': buf.readUInt16LE(18),
          'value': buf.readUInt32LE(20)
        });
      }
      reader(err, fd);
    });
  }

  fs.open("/dev/input/" + dev, "r", reader);
};

f.led_read = function(led, callback) {
  // reads the current brightness of LED and returns it in a callback
  var led = "/sys/class/leds/" + led;
  fs.readFile(led + "/brightness", function(err, data) {
    if (err)
      callback(err, null);
    else {
      callback(null, {
        "led": led,
        "value": parseInt(data)
      });
    }
  });
};

f.led_write = function(led, value, callback) {
  // write a value to an LED. The LED trigger is set to 'none' and value is
  // written to brightness. For LEDs on a GPIO, any nonzero value turns the LED
  // on. For LEDs on a PWM, the value determines the duty of the timer. When the
  // write is complete, callback(err, {"led": led, "value": value}) is called.
  var led = "/sys/class/leds/" + led;
  fs.writeFileSync(led + "/trigger", "none");
  fs.writeFile(led + "/brightness", value, function(err) {
    if (err)
      callback(err, null);
    else
      callback(null, {
        "led": led,
        "value": value
      });
  });
};

f.led_timer = function(led, ms_on, ms_off, callback) {
  // flash an LED using the internal kernel timer. The LED trigger is set to
  // 'timer' and the ms_on and ms_off values are used to set the timer period
  // and duty cycle. When the setup is complete, callback is called. The
  // behavior during the first cycle may be undefined if the default on and off
  // times are different from the ones requested. Use led_write to turn the
  // timer off.
  var led = "/sys/class/leds/" + led;
  fs.writeFileSync(led + "/trigger", "timer");
  fs.writeFileSync(led + "/delay_on", ms_on);
  fs.writeFile(led + "/delay_off", ms_off, function(err) {
    if (err)
      callback(err, null);
    else
      callback(null, {
        "led": led,
        "value": "timer",
        "on_off": [ms_on, ms_off]
      });
  });
};

f.led_oneshot = function(led, ms_on, callack) {
  // Turn on a LED once for a specified period of time. The LED trigger is set
  // to 'oneshot'. When the LED is turned on, the callback is called. There
  // doesn't seem to be a way to generate a callback when the event is over. If
  // this is important, use led_write
  var led = "/sys/class/leds/" + led;
  fs.writeFileSync(led + "/trigger", "oneshot");
  fs.writeFileSync(led + "/delay_on", ms_on);
  fs.writeFileSync(led + "/delay_off", "0");
  fs.writeFile(led + "/shot", 1, function(err) {
    if (err)
      callback(err, null);
    else
      callback(null, {
        "led": led,
        "value": "oneshot",
        "on_off": [ms_on, ms_off]
      });
  })

}

module.exports = f;

console.log(f.read_eeprom('1-0054'));
