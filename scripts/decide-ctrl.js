#!/usr/bin/env node
// this is the controller process for the device - it's intended to be integrated as
// a component of the apparatus, but it relays messages to and from other clients
var _ = require("underscore");
var os = require("os");
var logger = require("../lib/log");
var express = require("express");
var http = require("http");
var sockets = require("socket.io");
var host = require("../lib/host");
var apparatus = require("../lib/apparatus");
var util = require("../lib/util");

var version = require('../package.json').version;
var host_params = util.load_config("host-config.json");
var bbb_params = util.load_config("bbb-config.json");

logger.info("this is decide-ctrl, version", version);

// *********************************
// HTTP server
var app = express();
app.enable('trust proxy');
var server = http.Server(app);
server.listen(host_params.port_ctrl);
server.on("listening", function() {
    var addr = server.address();
    logger.info("server listening on %s port %s", addr.address, addr.port);
})

app.get("/", function(req, res) {
    res.sendfile("controller.html", {root: __dirname + "/../static/"});
});

app.get(/^\/(state|components|params)\/(\w*)$/, function(req, res) {
    var cmd = "get-" + ((req.params[0] == "components") ? "meta" : req.params[0] );
    apparatus.req(cmd, req.params[1] || "", null, function(err, rep) {
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
var io = sockets(server);

function register_req(sock) {
    var req_msg = ["change-state", "reset-state", "get-state", "get-meta", "get-params"];
    req_msg.forEach( function(req) {
        sock.on(req, function(msg, rep) {
            rep = rep || function() {};
            apparatus.req(req, msg.name, msg.data, function(err, data) {
                if (err)
                    rep("err", err);
                else
                    rep("ok", data);
            });
        });
    });
}

io.on("connection", function(socket) {
    var client_addr = (socket.handshake.headers['x-forwarded-for'] ||
                       socket.request.connection.remoteAddress);
    logger.info("connection from:", client_addr);

    // key used to route to client - needed for unrouting due to disconnect
    var client_key = null;

    // forward pub from clients to other clients and apparatus components
    socket.on("state-changed", function(msg) {
        logger.debug("PUB from", client_addr, msg);
        apparatus.pub.emit("state-changed", msg.name, msg.data);
        socket.broadcast.emit("state-changed", msg);
    });

    register_req(socket);

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
                        socket.emit(req, _.extend({name: msg.name}, data), function(reply, result) {
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
            error("client " + client_key + " disconnected unexpectedly")
            apparatus.unregister(client_key);
            client_key = null;
            // reset the apparatus; TODO check if the client that disconnected
            // was actually running the experiment!
            apparatus.req("reset-state", "", null, function() {})
        }
        logger.info("disconnect from:", client_addr);
    });
});

// *********************************
// socket.io connection to host

// the controller's job is to route messages to and from the host socket
function controller(params, name, pub) {

    var par = {
        host: null
    };
    util.update(par, params);

    var meta = {
        type: "controller"
    };

    var state = {
        hostname: os.hostname(),
        server: null,
        version: version
    }

    if (!host_params.standalone) {
        var host_addr = "tcp://" + host_params.addr + ":" + host_params.port
        var conn = host(host_addr, function(err) {
            if (err) {
                logger.error("error registering with host: %s", err);
                process.exit(-1);
            }
            state.server = host_params.addr;
            pub.emit("state-changed", name, {server: state.server});
        })
    }

    // forward PUB messages from the apparatus to connected clients and host
    pub.on("state-changed", function(name, data, time) {
        var msg = {
            name: name,
            time: time || Date.now(),
            data: data
        };
        logger.log("pub", "state-changed", msg);
        io.emit("state-changed", msg);
        if (conn) conn("state-changed", msg);
    });

    var me = {
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
        forward: function(msg_t, msg) {
            if (conn) conn(msg_t, msg);
        },
        disconnect: function() {
            if (conn) conn.close();
        }
    };
    pub.emit("state-changed", name, state);
    return me;
}

// *********************************
// Error handling

function error(msg) {
    logger.error(msg);
    if (host_params.send_emails && apparatus.experiment && apparatus.experiment.user) {
        util.mail("decide-ctrl", apparatus.experiment.user, msg.substr(0,30), msg);
    }
}

// start the controller
var kontrol = apparatus.register("controller", controller, bbb_params.controller);

// initialize the apparatus
apparatus.init(bbb_params);

function shutdown() {
    kontrol.disconnect();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
