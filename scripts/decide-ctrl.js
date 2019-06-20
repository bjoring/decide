#!/usr/bin/env node
// this is the controller process for the device - it's intended to be integrated as
// a component of the apparatus, but it relays messages to and from other clients
const _ = require("underscore");
const {format} = require("util");
const os = require("os");
const express = require("express");
const bodyParser = require('body-parser');
const http = require("http");
const sockets = require("socket.io");
const stoppable = require("stoppable");
const request = require("request");
const semver = require("semver");

const logger = require("../lib/log");
const apparatus = require("../lib/apparatus");
const util = require("../lib/util");
const jsonl = require("../lib/jsonl");

const version = require('../package.json').version;
const host_params = util.load_config("host-config.json");
const bbb_params = util.load_config("bbb-config.json");

const argv = require("yargs")
      .usage("Start the controller interface.\nUsage: $0 [-u @slack-id]")
      .describe("u", "set slack user id for notifications")
      .array("u")
      .demand(0)
      .argv;

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
            res.status(500).send({error: err});
        else
            res.send(rep);
    });
});

app.use(bodyParser.json());
app.put(/^\/state\/(\w+)$/, function(req, res) {
    req.body["name"] = req.params[0];
    apparatus.req("change-state", req.body, function(err, rep) {
        if (err)
            res.status(500).send({error: err});
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
            util.slack(format("%s was started on %s", client_key, os.hostname()), argv.u);
            rep("ok");
        }
    });

    socket.on("unroute", function(msg, rep) {
        rep = rep || function() {};
        if (client_key) {
            apparatus.unregister(client_key);
            util.slack(format("%s was stopped on %s", client_key, os.hostname()), argv.u);
            client_key = null;
            rep("ok");
        }
        else
            rep("err", "no address associated with this connection");
    });

    socket.on("trial-data", function(msg) {
        logger.log("pub", "trial-data", msg);
        host.forward("trial-data", msg);
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

// the host proxy's job is to route messages to and from the host socket
function host_proxy(params, name, pub) {

    // current implementation is stateless, so we're 'connected' all the time
    const connected = !host_params.standalone;

    const par = {
        host: null
    };
    util.update(par, params);

    const meta = {
        type: "host"
    };

    const state = {
        hostname: os.hostname(),
        server: null,
        version: version
    }
    let dropped = 0;

    const conn = request.defaults({
        baseUrl: host_params.addr,
        json: true,
        forever: true
    });

    if (connected) {
        // hit the api/info endpoint
        conn.get("/info/", function(error, response, body) {
            logger.debug("API query returned: ", body);
            if (error)
                logger.error("unable to connect to host: %s", error.code);
            else if (response && response.statusCode != 200)
                logger.error("unable to connect to host: status = %s", response.statusCode);
            else if (!body.api_version)
                logger.error("unexpected response to API query");
            else if (!semver.satisfies(semver.coerce(body.api_version), "1.x"))
                logger.error("Wrong API version: %s (needs to be 1.x)", body.api_version);
            else {
                logger.info("connected to %s (api: %s) at %s", body.host, body.api_version, host_params.addr);
                pub.state_changed(name, {server: host_params.addr}, state);
            }
            if (!state.server)
                shutdown();
        });
    }
    else
        pub.state_changed(name, state);

    function post(url, msg) {
        if (!connected) return;
        msg["addr"] = state.hostname;
        msg["time"] /= 1e6;
        conn.post({url: url, body: msg},
                  function(e, r, body) {
                      if (e || (r && r.statusCode != 201)) {
                          dropped += 1
                          if (dropped % 1000 == 1)
                              notify(format("decide-host has dropped %d messages", dropped));
                      }
                  });
    }

    // forward PUB messages from the apparatus to connected clients and host
    // accept both "packaged" and "unpackaged" messages
    pub.on("state-changed", function(name, data, time) {
        const msg = (_.has(name, "name")) ? name :
            _.extend({name: name, time: time || util.now()}, data);
        logger.log("pub", "state-changed", msg);
        io.emit("state-changed", msg);
        post("/events/", msg);
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
            if (msg_t == "trial-data")
                post("/trials/", msg);
            else
                throw "unknown message type: " + msg_t;
        },
        disconnect: function() {
            //if (conn) conn.close();
        }
    };
    return me;
}

// *********************************
// This function is used to notify the user that something serious has happened.
// It will try to send a slack message and then email the admin if that fails.
// It does not shut the process down, because even though the experiment may be
// compromised, the experiment process may be providing food and managing
// lights, so we don't want to quit.
function notify(msg) {
    logger.warn(msg);
    util.slack(format("an error occurred on %s: %s", os.hostname(), msg),
               _.union(argv.u, [apparatus.experimenter()]),
               function(err, info) {
                   if (!err) return;
                   const to = host_params.admins;
                   util.mail(os.hostname(), to, "decide-ctrl error on " + os.hostname(), msg,
                             function(err, info) {
                                 if (err) logger.warn("unable to send mail:", err);
                                 else logger.info("sent error email");
                             });
               });
}

// start the controller
const host = apparatus.register("host", host_proxy);

// initialize the apparatus
apparatus.init(bbb_params);

util.slack("decide-ctrl was started on " + os.hostname(), argv.u);

function shutdown() {
    logger.debug("shutting down because of error or interrupt");
    // TODO: nicely tell experiment clients to shut down
    apparatus.shutdown();
    server.stop(function() {
        util.slack("decide-ctrl was shut down on " + os.hostname(), argv.u);
        logger.info("finished processing all HTTP requests");
        logger.info("it's safe to kill this process with -9 now if it hangs");
    });

}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
