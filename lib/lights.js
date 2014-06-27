/* state machine for house lights */
// reference for calculating solar irradiance
// http://www.powerfromthesun.net/Book/chapter02/chapter02.html

var b = require("./bonescript-lite");
var util = require("./util");
var events = require("events");
var suncalc = require("suncalc");

// fakes the sun's altitude. Goes from 0 to pi from dawn to dusk.
function fake_sun_position(now, dawn, dusk) {
  var x = (now + 24 - dawn) % 24;  // hours since dawn
  var y = (dusk + 24 - dawn) % 24; // hours in day
  return Math.min(2, x / y) * Math.PI;
}

function lights(params) {

  var par = {
    led: "starboard::lights",
    max_brightness: 255,
    clock_interval: 60000,
    ephemera: true,     // true if lights governed by sun position
    lat: 38.03,
    lon: -78.51,
    day_start: 7,      // start of day, in hours (ignored if ephemera true)
    day_stop: 19
  };
  util.update(par, params);

  var state = {
    // ranges between 0 and 255
    brightness: 0,
    // set to true for automatic updates
    clock_on: false,
    // ranges between 0 and 2*pi
    sun_altitude: 0
  };

  var emitter = new events.EventEmitter();

  function event(evt) {
    if (evt.id == "modify-state") {
      util.update(state, evt);
    }
    // update brightness on any event so that we don't have to wait for next tick
    if (state.clock_on) {
      var now = new Date(evt.time);
      if (par.ephemera) {
        state.sun_altitude = suncalc.getPosition(now,
                                                 par.lat,
                                                 par.lon).altitude;
      }
      else {
        state.sun_altitude = fake_sun_position(now, par.day_start, par.day_stop);
      }
      state.brightness = Math.max(
        0,
        Math.round(Math.sin(state.sun_altitude) * par.max_brightness));
      // threshold at some point? test on apparatus
    }
    b.led_write(par.led, state.brightness, function(err, value) {
      if (err) {
        emitter.emit("error", {
          id: "error",
          time: Date.now(),
          source: "lights",
          reason: err
        })
      }
      else {
        state.brightness = value.value;
        var ret = {
          id: "state-changed",
          time: Date.now(),
          source: "lights",
        };
        util.extend(ret, state);
        emitter.emit("state-changed", ret);
      }
    });
    if (state.clock_on)
      util.make_timer(par.clock_interval, event);
  }

  this.event = event;

  this.state = function() {
      return state;
  };

  this.subscribe = function(name, listener) {
    emitter.on(name, listener);
  };

  this.unsubscribe = function(name, listener) {
    emitter.removeListener(name, listener);
  };

};

module.exports = lights;
