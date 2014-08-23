/* play files to the sound card */
var cp = require("child_process");
var winston = require("winston");
var util = require("./util");

function aplayer(params, callback) {

    var par = {
        device: "default"
    };

    var meta = {
        type: "sound",
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

    this.pub = function(){};
    this.req = function(msg, rep) {
        winston.debug("req to aplayer %s:", par.device, msg);
        // error handling: if success, reply immediately, PUB start of playback,
        // PUB end of playback. If failure, reply immediately with error message
        // from aplay
        var err;
        if (msg.req == "change-state") {
            if (state.playing) {
                rep("playback already in progress");
            }
            if (msg.data.playing) {
                var aplay = cp.spawn("aplay", ["-D", par.device, msg.data.stimulus]);
                aplay.stderr.on("data", function(data) {
                    // I don't get this test (CDM): if (/^Playing/.test(data) ||
                    ///Rate/.test(data.toString()) ||
                    ///bit/.test(data.toString()))
                    if (/^Playing/.test(data))
                    {
                        state = msg.data;
                        rep();
                        callback(null, state);
                    }
                    else {
                        rep(data.toString().trimRight());
                    }
                });
                aplay.on("close", function (code) {
                    state.playing = false;
                    if (code == 0) {
                        callback(null, state);
                    }
                });
            }
        }
        else if (msg.req == "reset-state")
            rep();
        else if (msg.req == "get-state")
            rep(null, state);
        else if (msg.req == "get-meta")
            rep(null, meta);
        else if (msg.req == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    }

    callback(null, state);
}

module.exports = aplayer;
