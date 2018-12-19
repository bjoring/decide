/* play stimuli by making requests to jstim(server) through zeromq sockets */

const winston = require("winston");
const _ = require("underscore");
const zmq = require("zeromq");
const util = require("./util");

function aplayer(params, name, pub) {

    const par = {
        req: "ipc:///tmp/org.meliza.jill/default/jstimserver/req",
        pub: "ipc:///tmp/org.meliza.jill/default/jstimserver/pub"
    }

    const meta = {
        type: "sound",
        name: "sound playback",
        dir: "output",
        variables: {
            server: ["stopped", "running"],
            playing: [false, true],
            stimulus: [null, ".wav"]
        },
    };

    const state = {
        server: "stopped",
        stimulus: null,             // path of stimulus file
        playing: false              // set to true to start playback
        // TODO: report sample position?
    };

    // connect to jstimserver sockets
    const req_sock = zmq.socket("dealer");
    const sub_sock = zmq.socket("sub");
    req_sock.connect(par.req);
    sub_sock.connect(par.pub);
    sub_sock.subscribe("");

    // populate stimulus list
    function update_stims() {
        req_sock.send("STIMLIST");
        req_sock.once("message", (msg) => {
            const server_params = JSON.parse(msg);
            if (server_params.stimuli.length > 0)
                meta.stimuli = {
                                 files: _.map(server_params.stimuli, (x) => { return x.name }) };
            winston.info("received stimulus list (n=%d) from jstim server", meta.stimuli.files.length);
            state.server = "running";
            pub.emit("state-changed", name, state);
        });
    }
    // TODO: set a timeout to check whether the server is available and throw an
    // error if not

    // set up listener for pub sock
    sub_sock.on("message", (msg) => {
        const time = util.now();
        const msg_parts = msg.toString("utf-8").split(" ");
        winston.debug("jstimserver says: ", msg_parts);
        if (msg_parts[0] == "PLAYING") {
            state.playing = true;
            state.stimulus = msg_parts[1];
        }
        else if (msg == "DONE") {
            state.playing = false;
            state.stimulus = null;
        }
        else if (msg == "STOPPING") {
            // FIXME this should be a fatal error as a server shutdown will ruin
            // any running experiments. We need some way of pushing errors back
            // to the top of the stack.
            winston.warn("jstimserver is shutting down!");
            state.server = "stopped";
        }
        else if (msg == "STARTING") {
            winston.info("jstimserver reconnected");
            update_stims();
        }
        pub.emit("state-changed", name, state, time);
    });


    const me = {
        req: function(msg, data, rep) {
            winston.debug("req to sound-jstim: %s", msg, data)
            if (msg == "change-state") {
                let request = "PLAY " + data.stimulus;
                req_sock.send(request);
                req_sock.once("message", (msg) => {
                    if (msg == "BUSY")
                        rep("playback already in progress");
                    else if (msg == "BADSTIM")
                        rep("no such stimulus");
                    else if (msg == "BADCMD")
                        throw("protocol error: jstimserver rejected request");
                    else if (msg == "OK")
                        rep();
                    else
                        throw("protocol error: unexpected response from jstimserver");
                });
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
        },

        disconnect: function() {
            winston.info("disconnecting from jstimserver");
            req_sock.close();
            sub_sock.close();
        }
    }

    update_stims();
    return me;
}

module.exports = aplayer;
