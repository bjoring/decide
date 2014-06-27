/* state machine for house lights */
var b = require("./bonescript-lite");
var util = require("./util");

// reference for calculating solar irradiance
// http://www.powerfromthesun.net/Book/chapter02/chapter02.html

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
    ephemera: true,     // true if lights governed by sun position
    lat: 38.03,
    lon: -78.51,
    day_start: 7,      // start/stop of day, in hours (ignored if ephemera true)
    day_stop: 19
  };

  util.update(par, params);

  var state = {
    brightness: 0,           // ranges between 0 and 255
    clock_interval: false,   // set to positive integer for ms between clock
    // updates, or to falsey value for manual control
    sun_altitude: 0          // ranges between 0 and pi (ignored if ephemera is false)
  };

  this.event = function(evt) {
    if (evt.id == "modify-state") {
      util.update(state, evt);
    }
    else if (evt.id == "tick") {
      if (state.clock_on && state.clock_on > 0) {
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
    }
    b.led_write(led, state.brightness, function(err, value) {
      if (err) {
        emit("error", {
          id: "error",
          time: Date.now(),
          source: "lights",
          reason: err
        })
      }
      else {
        state.brightness = value.brightness;
        var ret = {
          id: "state-changed",
          time: Date.now(),
          source: "lights",
        };
        util.extend(ret, state);
        emit("state-changed", ret);
      }
    });
    // ignored if clock_on isn't a positive integer
    util.make_timer(state.clock_on, this.event);
  };

  // return current state
  this.state = function() {
    return state;
  };

  this.emitter = require("events").EventEmitter;

  this.subscribe = function(name, listener) {
    this.emitter.on(name, listener);
  };

  this.unsubscribe = function(name, listener) {
    this.emitter.removeListener(name, listener);
  };

}
