// this is the controller process for the device - it's intended to be integrated as
// a component of the apparatus, but it relays messages to and from other clients
var _ = require("underscore");
var os = require("os");
var winston = require("winston");
var express = require("express");
var http = require("http");
var sockets = require("socket.io");
var sock_cli = require("socket.io-client");
var apparatus = require("./lib/apparatus");
var util = require("./lib/util");

// Log pub and req events at info level
winston.levels.pub = 3;
winston.levels.req = 3;
if (process.env.NODE_ENV == 'debug') {
    winston.level = 'debug';
}
else if (process.env.NODE_ENV == 'production') {
    winston.level = 'warn';
}

var host_params = util.load_config("host-config.json");
var bbb_params = util.load_config("bbb-config.json");

// *********************************
// HTTP server
var app = express();
app.enable('trust proxy');
var server = http.Server(app);
server.listen(host_params.port_int);
server.on("listening", function() {
    var addr = server.address();
    winston.info("server listening on %s port %s", addr.address, addr.port);
})

app.get("/", function(req, res) {
    res.sendfile(__dirname + "/static/interface.html");
});

app.get(/^\/(state|components|params)\/(\w*)$/, function(req, res) {
    var data = {
        req: "get-" + ((req.params[0] == "components") ? "meta" : req.params[0] ),
        addr: req.params[1]
    };
    apparatus.req(data, function(err, rep) {
        if (err)
            res.send(500, {error: err});
        else
            res.send(rep);
    });
});

// all other static content resides in /static
app.use("/static", express.static(__dirname + "/static"));


// *********************************
// socket.io server
var io = sockets(server);
var pubc = io.of("/PUB");
var reqc = io.of("/REQ");

pubc.on("connection", function(socket) {
    var client_addr = (socket.handshake.headers['x-forwarded-for'] ||
                       socket.handshake.address);
    winston.info("connection on PUB:", client_addr);

    // forward pub to connected clients and apparatus components
    socket.on("msg", function(msg) {
        apparatus.pub(msg);
        socket.broadcast.emit("msg", msg);
    });

    socket.on("disconnect", function() {
        winston.info("disconnect on PUB:", client_addr);
    });
});

reqc.on("connection", function(socket) {
    var client_addr = (socket.handshake.headers['x-forwarded-for'] ||
                       socket.handshake.address);
    // key used to route to client - needed for unrouting due to disconnect
    var client_key = null;
    winston.info("connection on REQ:", client_addr);

    socket.on("msg", function(msg, rep) {
        rep = rep || function() {};
        apparatus.req(msg, function(err, data) {
            if (err)
                rep("req-err", err);
            else
                rep("req-ok", data);
        });
    });

    socket.on("route", function(msg, rep) {
        // register the client in the apparatus
        if (client_key) {
            rep("route-err", "socket is already registered as " + client_key);
        }
        else if (apparatus.is_registered(msg.addr)) {
            rep("route-err", "address " + msg.addr + " already taken");
        }
        else {
            apparatus.register(key, {
                // client gets pubs through socket already
                pub: function() {},
                req: function(msg, rep) {
                    socket.emit("msg", msg, _.partial(rep, null));
                }
            });
            client_key = msg.addr;
            rep("route-ok");
        }
    });

    socket.on("unroute", function(msg, rep) {
        if (client_key) {
            apparatus.unregister(client_key);
            client_key = null;
            rep("unroute-ok");
        }
        else
            rep("unroute-err", "no address associated with this connection");
    });

    socket.on("disconnect", function() {
        if (client_key) {
            error("client " + client_key + " disconnected unexpectedly")
            apparatus.unregister(client_key);
            client_key = null;
        }
        winston.info("disconnect on REQ:", client_addr);
    });
});

// *********************************
// socket.io connection to host
var host_addr = "http://" + host_params.addr_int + ":" + host_params.port_int;
var pubh = sock_cli.connect(host_addr + "/PUB");
var reqh = sock_cli.connect(host_addr + "/REQ");

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

    pubh.on("connection", function() {
        winston.info("connected to host socket %s", host_addr);
        state.server = host_addr;
        callback(null, state);
    });

    pubh.on("disconnect", function() {
        winston.info("lost connection to host (queuing messages)");
        state.server = null;
        callback(null, state);
    });

    // pubh.on("register-box", function(reply) {
    //     reply(state.host_name, state.ip_address, par.port);
    //     winston.info(state.host_name, "registered in host");
    //     send_store();
    // });

    // PUB messages from the apparatus
    pub.on("state-changed", function(addr, data, time) {
        var msg = {
            addr: addr,
            time: time || Date.now(),
            data: data
        };
        winston.log("pub", msg);
        pubc.emit("state-changed", msg);
        // outgoing messages need hostname prefixed to address
        msg.addr = os.hostname() + "." + msg.addr;
        // NB: messages are queued during disconnects
        if (pubh) {
            pubh.emit("msg", msg);
        }
    });

    // REQ messages from the apparatus
    this.req = function(msg, rep) {
        winston.debug("req to controller: ", msg);
        if (msg.req == "reset-state")
            rep();
        else if (msg.req == "get-state")
            rep(null, state);
        else if (msg.req == "get-meta")
            rep(null, meta);
        else if (msg.req == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    };

    pub.emit("state-changed", addr, state);
}

// *********************************
// Error handling
function error(msg) {
    winston.error(msg);
    if (host.params.send_emails) {
        util.mail("bbb-server", host_params.mail_list, msg.substr(0,30), msg);
    }
}

if (host_params.send_emails) {
    process.on("uncaughtException", function(err) {
        var subject = "fatal exception";
        var message = err;
        winston.error("fatal error: ", err);
        util.mail("bbb-server", host_params.mail_list, subject, message, process.exit);
    });
}

// process.on("SIGINT", function() {
//     console.log("SIGINT received.");
//     console.log("Informing host of graceful exit");
//     prepare_host_disconnect();
//     console.log("Exiting gracefully");
//     process.kill();
// });

// start the controller
apparatus.register("controller", controller, bbb_params.controller);

// initialize the apparatus
apparatus.init(bbb_params);
