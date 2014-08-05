var b = require("./starboard");
var _ = require("underscore");
var winston = require("winston");
var util = require("./util");

function cues(params, callback) {

    var par = {
        device: "starboard:center:green"
    };
    util.update(par, params);

    var meta = {
        type: "led",
        dir: "output",
        color: par.device.split(":")[2],
        variables: {
            brightness: [0, 1],
            trigger: [null, "timer", "oneshot"]
        }
    };

    var state = {
        brightness: 0,
        trigger: null
    };
    var reset = _.clone(state);

    function set_state(data, rep) {
        function cb(err, data) {
            if (!err) {
                state = data;
                callback(err, data);
            }
            rep(err);
        }
        if (msg.data.brightness == state.brightness)
            rep();
        else if (msg.data.trigger == "timer")
            b.led_timer(par.device, msg.data.period, cb);
        else if (msg.data.trigger == "oneshot")
            b.led_oneshot(par.device, msg.data.period, cb);
        else
            b.led_write(par.device, msg.data.brightness, cb);
    }

    // ignore pub messages
    this.pub = function () {};

    this.req = function (msg, rep) {
        winston.debug("req to cue %s: %s", par.device, msg);
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
}

module.exports = cues;
