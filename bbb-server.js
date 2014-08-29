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
    var cmd = "get-" + ((req.params[0] == "components") ? "meta" : req.params[0] );
    apparatus.req(cmd, req.params[1] || "", null, function(err, rep) {
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

// message types
var pub_msg = ["state-changed", "trial-data", "log"];
var req_msg = ["change-state", "reset-state", "get-state", "get-meta", "get-params"];

io.on("connection", function(socket) {
    var client_addr = (socket.handshake.headers['x-forwarded-for'] ||
                       socket.handshake.address);
    winston.info("connection from:", client_addr);

    // key used to route to client - needed for unrouting due to disconnect
    var client_key = null;

    // forward pub from clients to other clients and apparatus components
    pub_msg.forEach( function(pub) {
        socket.on(pub, function(msg) {
            winston.debug("PUB from", client_addr, msg);
            apparatus.pub.emit(pub, msg.addr, msg.data);
            socket.broadcast.emit(pub, msg);
        });
    });

    req_msg.forEach( function(req) {
        socket.on(req, function(msg, rep) {
            rep = rep || function() {};
            winston.debug("REQ from", client_addr, req, msg);
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
                    winston.debug("req to socket:", req, data);
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
        }
        winston.info("disconnect from:", client_addr);
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

    // brokers PUB messages from the apparatus
    pub.on("state-changed", function(addr, data, time) {
        var msg = {
            addr: addr,
            time: time || Date.now(),
            data: data
        };
        winston.log("pub", "state-changed", msg);
        io.emit("state-changed", msg);
        // outgoing messages need hostname prefixed to address
        msg.addr = os.hostname() + "." + msg.addr;
        // NB: messages are queued during disconnects
        if (pubh) {
            pubh.emit("msg", msg);
        }
    });

    // REQ messages from the apparatus
    this.req = function(msg, data, rep) {
        winston.debug("req to controller: ", msg, data);
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
    winston.error(msg);
    if (host_params.send_emails && apparatus.experiment && apparatus.experiment.user) {
        util.mail("bbb-server", apparatus.experiment.user, msg.substr(0,30), msg);
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
