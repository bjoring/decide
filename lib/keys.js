// monitor key events
var fs = require("fs");
var events = require("events");
var util = require("./util");

function keypress(params) {
  // monitors a /dev/input device. This is used to capture events from GPIO
  // inputs that have been defined with gpio-keys in the device tree. For each
  // rising or falling event, callback is called with the timestamp [seconds,
  // microseconds], the key code, and the value (1 for falling and 0 for
  // rising). Dev is usually input1 or event1 for the BBB.

  var EV_KEY = 1;
  var bufsize = 24;
  var buf = new Buffer(bufsize);
  var fd;

  var par = {
    device: "/dev/input/event1",
    keymap: ["hopper_up", "peck_left", "peck_center", "peck_right"]
  };
  util.update(par, params);

  // the state vector is populated as keys are pressed
  var state = {};

  var emitter = new events.EventEmitter();

  function reader() {
    fs.read(fd, buf, 0, bufsize, null, function(err, N) {
      if (err) {
        util.make_event(emitter, "error", par.device, { reason: err });
        return;
      }
      // buffer is { struct timeval, unsigned short type, unsigned short code,
      // unsigned int value }
      if (buf.readUInt16LE(8) === EV_KEY) {
        var keycode = buf.readUInt16LE(10);
        var keyname = par.keymap[keycode - 1];
        var data = {
          id: "state-changed",
          time: buf.readUInt32LE(0) * 1000 + buf.readUInt32LE(4) / 1000,
          source: par.device
        };
        data[keyname] = buf.readUInt32LE(12);
        if (data[keyname] != state[keyname]) {
          state[keyname] = data[keyname];
          emitter.emit("state-changed", data);
        }

      }
      // I'm surprised this can recurse indefinitely...
      if (fd !== null)
        reader();
    });
  }

  // close the file and stop the state machine. Only takes effect on the next
  // read, though.
  this.close = function() {
    fs.close(fd, function() {
      fd = null;
      util.make_event(emitter, "stopped", par.device, {reason: "file closed"});
    });
  };

  // accepts modify-state events to generate dummy keypresses
  this.event = function(evt) {
    if (evt.id != "modify-state") return;
    var upd = {};
    par.keymap.forEach(function(x) {
      if (x in evt) {
        state[x] = upd[x] = evt[x];
      }});
    util.make_event(emitter, "state-changed", par.device, upd);
  }

  this.state = function() {
      return state;
  };

  this.subscribe = function(name, listener) {
    emitter.on(name, listener);
  };

  this.unsubscribe = function(name, listener) {
    emitter.removeListener(name, listener);
  };

  fs.open(par.device, "r", function(err, fdx) {
    fd = fdx;
    if (err)
      util.make_event(emitter, "error", par.device, { reason: err });
    else
      reader();
  });
}

module.exports = keypress;
