/* play files to the sound card */
var cp = require("child_process");
var winston = require("winston");
var util = require("./util");

function aplayer(params, addr, pub) {

    var par = {
        device: "default"
    };

    var meta = {
        type: "sound",
        name: "sound playback",
        dir: "output",
        variables: {
            playing: [false, true],
            stimulus: [null, ".wav"]
        }
    };

    var state = {
        stimulus: null,             // path of stimulus file
        playing: false              // set to true to start playback
        // TODO: report sample position?
    };

    util.update(par, params);

    this.req = function(msg, data, rep) {
        winston.debug("req to aplayer %s:", par.device, msg, data);
        // error handling: if success, reply immediately, PUB start of playback,
        // PUB end of playback. If failure, reply immediately with error message
        // from aplay
        var err;
        if (msg == "change-state") {
            if (state.playing) {
                rep("playback already in progress");
            }
            if (data.playing) {
                var aplay = cp.spawn("aplay", ["-D", par.device, data.stimulus]);
                aplay.stderr.on("data", function(data) {
                    // I don't get this test (CDM): if (/^Playing/.test(data) ||
                    ///Rate/.test(data.toString()) ||
                    ///bit/.test(data.toString()))
                    if (/^Playing/.test(data))
                    {
                        state = data;
                        rep();
                        pub.emit("state-changed", addr, state);
                    }
                    else {
                        rep(data.toString().trimRight());
                    }
                });
                aplay.on("close", function (code) {
                    state.playing = false;
                    if (code == 0) {
                        pub.emit("state-changed", addr, state);
                    }
                });
            }
        }
        else if (msg == "reset-state")
            rep();
        else if (msg == "get-state")
            rep(null, state);
        else if (msg == "get-meta")
            rep(null, meta);
        else if (msg == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    }

    pub.emit("state-changed", addr, state);
}

module.exports = aplayer;
