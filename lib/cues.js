var b = require("./starboard");
var util = require("./util");
var winston = require("winston");

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

    // ignore pub messages
    this.pub = function () {};

    this.req = function (msg, rep) {
        winston.debug(msg);
        // errors get returned in the reply; successes get returned as a PUB
        function cb(err, data) {
            if (!err) {
                state = data;
                callback(err, data);
            }
            rep(err);
        }
        if (msg.req == "change-state") {
            if (msg.data.brightness == state.brightness)
                rep();
            else if (msg.data.trigger == "timer")
                b.led_timer(par.device, msg.data.period, cb);
            else if (msg.data.trigger == "oneshot")
                b.led_oneshot(par.device, msg.data.period, cb);
            else
                b.led_write(par.device, msg.data.brightness, cb);
        }
        else if (msg.req == "get-state")
            rep(null, state);
        else if (msg.req == "get-meta")
            rep(null, meta);
        else if (msg.req == "get-params")
            rep(null, par);
        else
            rep("invalid REQ type");
    };
}

module.exports = cues;
