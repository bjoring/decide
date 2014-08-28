var b = require("./starboard");
var _ = require("underscore");
var winston = require("winston");
var util = require("./util");

function cues(params, addr, pub) {

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

    // state is managed by the led object
    var led = new b.led(par.device);
    var reset = {
        brightness: 0,
        trigger: "none"
    };

    function set_state(data, rep) {
        console.log(data);
        function cb(result) {
            pub.emit("state-changed", addr, result);
            rep();
        }
        if (data.trigger == "timer")
            led.timer(data.period, cb);
        else if (data.trigger == "oneshot")
            led.oneshot(data.period, cb);
        else
            led.write(data.brightness, "none", cb);
    }

    this.req = function (req, data, rep) {
        winston.debug("req to cue %s:", par.device, req, data);
        if (req == "change-state")
            set_state(data, rep);
        else if (req == "reset-state")
            set_state(reset, rep);
        else if (req == "get-state")
            led.read( _.partial(rep, null));
        else if (req == "get-meta")
            rep(null, meta);
        else if (req == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    };

    set_state(reset, function() {});
}

module.exports = cues;
