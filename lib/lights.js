/* state machine for house lights */
// reference for calculating solar irradiance:
// http://www.powerfromthesun.net/Book/chapter02/chapter02.html
var b = require("./starboard");
var util = require("./util");
var suncalc = require("suncalc");
var winston = require("winston");

// fakes the sun's altitude. Goes from 0 to pi from dawn to dusk. Values at
// night are greater than pi but not linear
function fake_sun_position(now, dawn, dusk) {
    var x = (now + 24 - dawn) % 24; // hours since dawn
    var y = (dusk + 24 - dawn) % 24; // hours in day
    return Math.min(2, x / y) * Math.PI;
}

function lights(params, callback) {

    var meta = {
        type: "lights",
        dir: "output",
        variables: {
            brightness: "0-255",
            clock_on: [true, false]
        }
    };

    var par = {
        device: "starboard::lights",
        max_brightness: 255,
        clock_interval: 60000,
        ephemera: true, // true if lights governed by sun position at lat/lon
        lat: 38.03,
        lon: -78.51,
        day_start: 7, // start of day, in hours (ignored if ephemera true)
        day_stop: 19
    };
    util.update(par, params);

    var state = {
        // ranges between 0 and 255
        brightness: 0,
        // set to true for automatic updates
        clock_on: false,
        // ranges between 0 and 2*pi
        sun_altitude: 0,
    };
    var reset = _.clone(state);

    var timer;

    function clock_brightness(rep) {
        // sets brightness based on clock
        var now = Date.now();
        if (par.ephemera) {
            state.sun_altitude =
                suncalc.getPosition(now, par.lat, par.lon)
                .altitude;
        } else {
            state.sun_altitude = fake_sun_position(now, par.day_start, par.day_stop);
        }
        state.brightness = Math.max(
            0,
            Math.round(Math.sin(state.sun_altitude) * par.max_brightness));
        // threshold at some point? TODO test in apparatus
        set_brightness(rep);
    }

    function set_brightness(rep) {
        b.led_write(par.device, state.brightness, function (err, value) {
            if (rep)
                rep(err);
            if (!err)
                state.brightness = value.brightness;
            callback(err, state);
        });
    }

    function set_state(data, rep) {
        util.update(state, data);
        clearTimeout(timer);

        if (state.clock_on) {
            clock_brightness(rep);
            timer = setTimeout(set_state, par.clock_interval);
        } else
            set_brightness(rep);
    }

    this.req = function (msg, rep) {
        winston.debug("req to feeder %s: %s", par.device, msg);
        if (msg.req == "change-state")
            set_state(msg.data, rep);
        else if (msg.req == "reset-state")
            set_state(reset, rep);
        else if (msg.req == "get-state")
            rep(null, state);
        else if (msg.req == "get-meta")
            rep(null, meta);
        else if (msg.req == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    };

    this.pub = function (msg) {};


};

module.exports = lights;
