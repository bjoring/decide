/* play files to the sound card */
const cp = require("child_process");
const winston = require("winston");
const util = require("./util");
const path = require("path");
const glob = require("glob");
const fs = require("fs");
const _ = require("underscore");

function aplayer(params, name, pub) {

    const par = {
        device: "default",
        root: null
    };

    const meta = {
        type: "sound",
        name: "sound playback",
        dir: "output",
        variables: {
            playing: [false, true],
            stimulus: [null, ".wav"]
        },
    };

    const state = {
        stimulus: null,             // path of stimulus file
        playing: false              // set to true to start playback
        // TODO: report sample position?
    };
    util.update(par, params);

    if (par.root) {
        // populate list of stimuli. Another way of doing this would be to keep
        // the list in state and update it each time the directory was modified,
        // but that seems more complex than needed at present
        let wavfiles = glob.sync(path.join(par.root, "*.wav"));
        if (wavfiles.length > 0)
            meta.stimuli = { root: fs.realpathSync(par.root),
                             files: _.map(wavfiles, function(x) { return path.basename(x); })};
    }


    const me = {
        req: function(msg, data, rep) {
            winston.debug("req to aplayer %s:", par.device, msg, data);
            // error handling: if success, reply immediately, PUB start of playback,
            // PUB end of playback. If failure, reply immediately with error message
            // from aplay
            let err;
            if (msg == "change-state") {
                if (state.playing) {
                    rep("playback already in progress");
                }
                if (data.playing) {
                    let stim = (data.root) ? path.resolve(data.root, data.stimulus) : data.stimulus;
                    winston.debug("playback cmd: aplay -D", par.device, stim);
                    let aplay = cp.spawn("aplay", ["-D", par.device, stim]);
                    aplay.stderr.on("data", function(buf) {
                        // NB: buffer may not be split by line
                        if (!state.playing) {
                            if (/^Playing/.test(buf)) {
                                util.update(state, data);
                                rep();
                                pub.emit("state-changed", name, state);
                            }
                            else {
                                let err = buf.toString().trimRight()
                                winston.error("error playing sound:", err);
                                rep(err);
                            }
                        }
                    });
                    aplay.on("close", function (code) {
                        state.playing = false;
                        if (code == 0) {
                            pub.emit("state-changed", name, state);
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
    }

    pub.emit("state-changed", name, state);
    return me;
}

module.exports = aplayer;
