/* play files to the sound card */
const winston = require("winston");
const util = require("./util");
const path = require("path");
const glob = require("glob");
const fs = require("fs");
const wav = require("wav");
const Speaker = require("speaker");
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
            // error handling: need to capture an event from the reader, which
            // unfortunately means the synchronous callback is worthless.
            // Instead, throw the error so that the user knows the soundfile is
            // corrupt, etc.
            if (msg == "change-state") {
                if (state.playing) {
                    rep("playback already in progress");
                }
                else if (data.playing) {
                    let stim = (data.root) ? path.resolve(data.root, data.stimulus) : data.stimulus;
                    let reader = new wav.Reader();
                    let file = fs.createReadStream(stim);
                    reader.on('format', function(format) {
                        let start;
                        let stop;
                        let speaker = new Speaker(format);
                        speaker.on("open", function() {
                            start = util.now();
                            util.update(state, data);
                            pub.emit("state-changed", name, state, start);
                        });
                        speaker.on("close", function() {
                            stop = util.now();
                            state.playing = false;
                            pub.emit("state-changed", name, state, stop);
                            winston.debug("playback time: %d", stop - start);
                        });
                        reader.pipe(speaker);
                    });
                    reader.on("error", function(err) {
                        throw err;
                    }
                    file.pipe(reader);
                    rep();
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
