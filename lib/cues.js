var b = require("./starboard");
var _ = require("underscore");
var winston = require("winston");
var util = require("./util");

function cues(params, pub) {

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

    var reset = {
        brightness: 0,
        trigger: "none"
    };
    var led = new b.led(par.device);

    function set_state(data, rep) {
        function cb(data) {
            pub.emit("state-changed", data);
            rep();
        }
        if (data.trigger == "timer")
            led.timer(data.period, cb);
        else if (data.trigger == "oneshot")
            led.oneshot(data.period, cb);
        else
            led.write(data.brightness, "none", cb);
    }

    this.req = function (msg, data, rep) {
        winston.debug("req to cue %s:", par.device, msg, data);
        if (msg == "change-state")
            set_state(data, rep);
        else if (msg == "reset-state")
            set_state(reset, rep);
        else if (msg == "get-state")
            led.read(rep);
        else if (msg == "get-meta")
            rep(null, meta);
        else if (msg == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    };

    set_state(reset, function() {});
}

module.exports = cues;
