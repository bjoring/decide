#!/usr/bin/env node
// this is the controller process for the device - it's intended to be integrated as
// a component of the apparatus, but it relays messages to and from other clients
var _ = require("underscore");
var os = require("os");
var logger = require("../lib/log");
var express = require("express");
var http = require("http");
var sockets = require("socket.io");
var sock_cli = require("socket.io-client");
var apparatus = require("../lib/apparatus");
var util = require("../lib/util");
var jsonl = require("../lib/jsonl");

var version = require('../package.json').version;
var host_params = util.load_config("host-config.json");
var bbb_params = util.load_config("bbb-config.json");

logger.info("this is bbb-server, version", version);

var triallog = (host_params.log_local_trials) ? util.defaultdict(jsonl) : util.defaultdict(function() {});
var eventlog = (host_params.log_local_events) ? jsonl("events.jsonl") : function() {};

// *********************************
// HTTP server
var app = express();
app.enable('trust proxy');
var server = http.Server(app);
server.listen(host_params.port_ext);
server.on("listening", function() {
    var addr = server.address();
    logger.info("server listening on %s port %s", addr.address, addr.port);
})

app.get("/", function(req, res) {
    res.sendfile("interface.html", {root: __dirname + "/../static/"});
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

io.on("connection", function(socket) {
    var client_addr = (socket.handshake.headers['x-forwarded-for'] ||
                       socket.request.connection.remoteAddress);
    logger.info("connection from:", client_addr);

    // key used to route to client - needed for unrouting due to disconnect
    var client_key = null;

    // forward pub from clients to other clients and apparatus components
    socket.on("state-changed", function(msg) {
        logger.debug("PUB from", client_addr, msg);
        apparatus.pub.emit("state-changed", msg.addr, msg.data);
        socket.broadcast.emit("state-changed", msg);
    });

    // trial data is logged to disk locally
    socket.on("trial-data", function(msg) {
        logger.info("trial-data", msg);
        // flatten the record
        var data = _.extend(_.omit(msg, "data"), msg.data);
        triallog(msg.data.subject + "_" + msg.addr + ".jsonl")(data);
    });

    // req message types
    var req_msg = ["change-state", "reset-state", "get-state", "get-meta", "get-params"];
    req_msg.forEach( function(req) {
        socket.on(req, function(msg, rep) {
            rep = rep || function() {};
            logger.debug("REQ from", client_addr, req, msg);
            apparatus.req(req, msg.addr, msg.data, function(err, data) {
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
        else if (apparatus.is_registered(msg.ret_addr)) {
            rep("err", "address " + msg.ret_addr + " already taken");
        }
        else {
            client_key = msg.ret_addr;
            function proxy() {
                this.req = function(req, data, rep) {
                    // internal reqs get packaged into messages
                    logger.debug("req to socket:", req, data);
                    socket.emit(req, _.extend({addr: msg.ret_addr}, data), function(reply, result) {
                        if (reply == "err")
                            rep(result);
                        else
                            rep(null, result);
                    });
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

    socket.on("disconnect", function() {
        if (client_key) {
            error("client " + client_key + " disconnected unexpectedly")
            apparatus.unregister(client_key);
            client_key = null;
            // TODO: check if experiment needs to be reset
        }
        logger.info("disconnect from:", client_addr);
    });
});

// *********************************
// socket.io connection to host
var host_addr = "http://" + host_params.addr_int + ":" + host_params.port_int;
var host = sock_cli.connect(host_addr, {transports: ["websocket"]});

// the controller's job is to route messages to and from the host socket
function controller(params, addr, pub) {

    var par = {
        host: null
    };
    util.update(par, params);

    var meta = {
        type: "controller"
    };

    var state = {
        hostname: os.hostname(),
        server: null
    }

    host.on("connection", function() {
        logger.info("connected to host socket %s", host_addr);
        state.server = host_addr;
        // callback(null, state);
    });

    host.on("disconnect", function() {
        logger.info("lost connection to host (queuing messages)");
        state.server = null;
        // callback(null, state);
    });

    // brokers PUB messages from the apparatus
    pub.on("state-changed", function(addr, data, time) {
        var msg = {
            addr: addr,
            time: time || Date.now(),
            data: data
        };
        logger.log("pub", "state-changed", msg);
        io.emit("state-changed", msg);
        // outgoing messages need hostname prefixed to address
        msg.addr = os.hostname() + "." + msg.addr;
        // NB: messages are queued during disconnects
        host.emit("msg", msg);
        eventlog(_.extend({addr: addr, time: msg.time}, data));
    });

    // REQ messages from the apparatus
    this.req = function(msg, data, rep) {
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
    };

    pub.emit("state-changed", addr, state);
}

// *********************************
// Error handling
function error(msg) {
    logger.error(msg);
    if (host_params.send_emails && apparatus.experiment && apparatus.experiment.user) {
        util.mail("bbb-server", apparatus.experiment.user, msg.substr(0,30), msg);
    }
}

if (host_params.send_emails) {
    process.on("uncaughtException", function(err) {
        var subject = "fatal exception";
        var message = err;
        logger.error("fatal error: ", err);
        util.mail("bbb-server", host_params.mail_list, subject, message, process.exit);
    });
}

// start the controller
apparatus.register("controller", controller, bbb_params.controller);

// initialize the apparatus
apparatus.init(bbb_params);
