#!/usr/bin/env node
// this is the controller process for the device - it's intended to be integrated as
// a component of the apparatus, but it relays messages to and from other clients
const _ = require("underscore");
const {format} = require("util");
const os = require("os");
const logger = require("../lib/log");
const express = require("express");
const http = require("http");
const sockets = require("socket.io");
const stoppable = require("stoppable");
const host_zmq = require("../lib/host");
const apparatus = require("../lib/apparatus");
const util = require("../lib/util");
const jsonl = require("../lib/jsonl");

const version = require('../package.json').version;
const host_params = util.load_config("host-config.json");
const bbb_params = util.load_config("bbb-config.json");

logger.info("this is decide-ctrl, version", version);

// *********************************
// HTTP server
const app = express();
app.enable('trust proxy');
const server = stoppable(http.Server(app), 1000);
server.listen(host_params.port_ctrl);
server.on("listening", function() {
    const addr = server.address();
    logger.info("server listening on %s port %s", addr.address, addr.port);
})

app.get("/", function(req, res) {
    res.sendFile("controller.html", {root: __dirname + "/../static/"});
});

app.get(/^\/(state|components|params)\/(\w*)$/, function(req, res) {
    const cmd = "get-" + ((req.params[0] == "components") ? "meta" : req.params[0] );

    apparatus.req(cmd, {name: req.params[1] || ""}, function(err, rep) {
        if (err)
            res.send(500, {error: err});
        else
            res.send(rep);
    });
});

// all other static content resides in /static
app.use("/static", express.static(__dirname + "/../static"));


// *********************************
// socket.io server
const io = sockets(server);

io.on("connection", function(socket) {
    const client_addr = (socket.handshake.headers['x-real-ip'] ||
                       socket.conn.remoteAddress);
    logger.debug("header:", socket.handshake.headers);
    logger.info("connection from:", client_addr);

    // key used to route to client - needed for unrouting due to disconnect
    let client_key = null;

    // forward pub from clients to other clients and apparatus components
    socket.on("state-changed", function(msg) {
        logger.debug("PUB from", client_addr, msg);
        apparatus.pub.emit("state-changed", msg);
        socket.broadcast.emit("state-changed", msg);
    });

    // forward reqs to apparatus
    const req_msg = ["change-state", "reset-state", "get-state", "get-meta", "get-params"];
    req_msg.forEach( function(req) {
        socket.on(req, function(msg, rep) {
            rep = rep || function() {};
            msg.client = client_addr;
            apparatus.req(req, msg, function(err, data) {
                if (err)
                    rep("err", err);
                else
                    rep("ok", data);
            });
        });
    });

    // routing requests are always handled by the controller/broker
    socket.on("route", function(msg, rep) {
        rep = rep || function() {};
        if (client_key) {
            rep("err", "socket is already registered as " + client_key);
        }
        else if (apparatus.is_registered(msg.name)) {
            rep("err", "address " + msg.name + " already taken");
        }
        else {
            client_key = msg.name;
            function proxy() {
                return {
                    req: function(req, data, rep) {
                        // internal reqs get packaged into messages
                        logger.debug("req to socket:", req, data);
                        socket.emit(req, _.extend({name: msg.name}, data),
                                    function(reply, result) {
                                        if (reply == "err")
                                            rep(result);
                                        else
                                            rep(null, result);
                                    });
                    }
                };
            }
            apparatus.register(client_key, proxy);
            rep("ok");
        }
    });

    socket.on("unroute", function(msg, rep) {
        rep = rep || function() {};
        if (client_key) {
            apparatus.unregister(client_key);
            client_key = null;
            rep("ok");
        }
        else
            rep("err", "no address associated with this connection");
    });

    socket.on("trial-data", function(msg) {
        logger.log("pub", "trial-data", msg);
        kontrol.forward("trial-data", msg);
    })

    socket.on("disconnect", function() {
        if (client_key) {
            notify("client " + client_key + " disconnected unexpectedly")
            apparatus.unregister(client_key);
            client_key = null;
            // reset the apparatus; TODO check if the client that disconnected
            // was actually running the experiment!
            apparatus.req("reset-state", {name: ""}, function() {})
        }
        logger.info("disconnect from:", client_addr);
    });
});

// *********************************
// socket.io connection to host

// the controller's job is to route messages to and from the host socket
function controller(params, name, pub) {

    const par = {
        host: null
    };
    util.update(par, params);

    const meta = {
        type: "controller"
    };

    const state = {
        hostname: os.hostname(),
        server: null,
        version: version
    }

    let conn;

    if (!host_params.standalone) {
        const host_addr = "tcp://" + host_params.addr + ":" + host_params.port
        conn = host_zmq();
        let dropped = 0;
        conn.on("connect", function() {
            logger.info("connected to decide-host at %s", host_addr);
            pub.state_changed(name, {server: host_params.addr}, state);
        })
        conn.on("error", function(err) {
            logger.error("error registering with host: %s", err);
            shutdown();
        })
        conn.on("disconnect", function() {
            logger.warn("disconnected from decide-host at %s", host_addr)
            pub.state_changed(name, {server: state.server + " (disconnected)"}, state);
        })
        conn.on("dropped", function() {
            dropped += 1;
            if (dropped % 1000 == 1) {
                notify("decide-host is dropping or not receiving data!");
                // really this should go into a log
                pub.state_changed(name, {warning: "dropped messages"}, state);
            }
        })
        conn.on("closed", function() {
            logger.info("closed connection to decide-host");
        })
        conn.connect(host_addr);
    }

    // forward PUB messages from the apparatus to connected clients and host
    // accept both "packaged" and "unpackaged" messages
    pub.on("state-changed", function(name, data, time) {
        const msg = (_.has(name, "name")) ? name :
            _.extend({name: name, time: time || util.now()}, data);
        logger.log("pub", "state-changed", msg);
        io.emit("state-changed", msg);
        if (conn) conn.send("state-changed", msg);
    });

    // Warning messages are passed on to the experimenter.
    pub.on("warning", function(name, err, time) {
        const msg = format("warning from '%s': %s", name, err);
        notify(msg);
    });

    const me = {
        // REQ messages from the apparatus
        req: function(msg, data, rep) {
            logger.debug("req to controller: ", msg, data);
            if (msg == "reset-state")
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
        // provides a means to forward trial data to host
        forward: function(msg_t, msg) {
            if (conn) conn.send(msg_t, msg);
        },
        disconnect: function() {
            if (conn) conn.close();
        }
    };
    pub.state_changed(name, state);
    return me;
}

// *********************************
// This function is used to notify the user that something serious has happened.
// It will try to send email. It does not shut the process down, because even
// though the experiment may be compromised, the experiment process may be
// providing food and managing lights, so we don't want to quit.
function notify(msg) {
    logger.warn(msg);
    const to = host_params.admins;
    if (apparatus.experiment && apparatus.experiment.user)
        to.push(apparatus.experiment.user);
    util.mail(os.hostname(), to, "decide-ctrl warning: " + msg,
              "A serious problem has occurred on " + os.hostname() + ":\n\n" +msg,
              function(err, info) {
                  if (err) logger.warn("unable to send mail:", err);
                  else logger.info("sent error email");
              });
}

// start the controller
const kontrol = apparatus.register("controller", controller, bbb_params.controller);

// initialize the apparatus
apparatus.init(bbb_params);

function shutdown() {
    logger.debug("shutting down because of error or interrupt");
    // TODO: nicely tell experiment clients to shut down
    apparatus.shutdown();
    server.stop(function() {
        logger.info("finished processing all HTTP requests");
        logger.info("it's safe to kill this process with -9 now if it hangs");
    });

}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
