var cp = require("child_process");
var logger = require("winston");
var _ = require("underscore");
var path = require("path");
var util = require("./util");
var glob = require("glob");
var fs = require("fs");

function stim_duration(path, callback) {

    var proc = cp.spawn("sndfile-info", [path]);
    var seconds;
    proc.stdout.on("data", function(data) {
        var rex = /^Duration\W+:\W+(\d+):(\d+):(\d+.\d+)/m.exec(data);
        if (rex) {
            seconds = parseInt(rex[1]) * 60 * 24 + parseInt(rex[2]) * 60 + parseFloat(rex[3])
            logger.debug("%s duration (s):", path, seconds)
            callback(null, seconds * 1000);
        }
    });
    proc.on("close", function() {
        if (!seconds) callback("no such file " + path);
    });
}

function aplayer(params, name, pub) {

    var par = {
        device: "dummy",
        root: null
    };
    util.update(par, params);
    par.device = "dummy";

    var meta = {
        type: "sound",
        name: "sound playback",
        dir: "output",
        variables: {
            playing: [false, true],
            stimulus: [null, ".wav"]
        },
    };

    if (par.root) {
        // populate list of stimuli
        var wavfiles = glob.sync(path.join(par.root, "*.wav"));
        if (wavfiles.length > 0)
            meta.stimuli = { root: fs.realpathSync(par.root),
                             files: _.map(wavfiles, function(x) { return path.basename(x); })};
    }

    var state = {
        stimulus: null,             // path of stimulus file
        playing: false              // set to true to start playback
    };

    var me = {
        req: function(msg, data, rep) {
            // error handling: if success, reply immediately, PUB start of playback,
            // PUB end of playback. If failure, reply immediately with error message
            // from aplay
            var err;
            if (msg == "change-state") {
                if (state.playing) {
                    rep("playback already in progress");
                }
                else if (data.playing) {
                    logger.debug("'playing':", data.stimulus);
                    var stim = (data.root) ? path.resolve(data.root, data.stimulus) : data.stimulus;
                    stim_duration(stim, function(err, dur) {
                        rep(err);
                        if (!err) {
                            util.update(state, data);
                            pub.emit("state-changed", name, state);
                            _.delay(function() {
                                state.playing = false;
                                pub.emit("state-changed", name, state);
                            }, dur)
                        }
                    })
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
