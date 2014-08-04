// this is the broker process for the device - it's intended to be integrated as
// a component of the apparatus, but it relays messages to and from other clients
var _ = require("underscore");
var fs = require("fs");
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

var host_params = JSON.parse(fs.readFileSync(__dirname + "/host-config.json"));
var bbb_params = JSON.parse(fs.readFileSync(__dirname + "/bbb-config.json"));

// NB: communication code is at module level b/c broker really is a singleton

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
                       socket.handshake.address.address);
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
                       socket.handshake.address.address);
    // key used to route to client - needed for unrouting due to disconnect
    var client_key = null;
    winston.info("connection on REQ:", client_addr);

    socket.on("msg", function(msg, rep) {
        rep = rep || function() {};
        apparatus.req(msg, function(err, data) {
            if (err)
                rep("req-err", err);
            else
                rep("req-ok");
        });
    });

    socket.on("route", function(key, rep) {
        // register a client in the apparatus
        // TODO handle name collisions
        apparatus.register(key, {
            // client gets pubs through socket already
            pub: function() {},
            req: function(msg, rep) {
                socket.emit("msg", msg, _.partial(rep, null));
            }
        });
        client_key = key;
        rep("route-ok");
    });

    socket.on("unroute", function(key, rep) {
        apparatus.unregister(key);
        client_key = null;
        rep("unroute-ok");
    });

    socket.on("disconnect", function() {
        if (client_key) {
            error("client %s disconnected - removing entry from route table", client_key)
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
var reqh = sock_cli.connect(host_addr + "/REQ")

// holds msg received while disconnected from host-server
var msg_store = [];

pubh.on("connection", function() {
    winston.info("connected to host socket %s", host_addr);
    winston.debug("sending log store (messages=%d)", msg_store.length);
    while (msg_store.length !== 0) {
        var msg = msg_store.shift();
        pubh.emit("msg", msg);
    }
});

pubh.on("disconnect", function() {
    winston.info("lost connection to host (now queuing messages)");
});

// the broker's job is to route messages to and from sockets
function broker(params, callback) {

    var par = {
        standalone: false
    };
    util.update(par, params);

    var meta = {
        type: "broker"
    };

    var state = {
        host: null,
        connected: false,
    }

    // pubh.on("register-box", function(reply) {
    //     reply(state.host_name, state.ip_address, par.port);
    //     winston.info(state.host_name, "registered in host");
    //     send_store();
    // });

    // PUB messages from the apparatus - forward to connected clients and to host
    this.pub = function(msg) {
        pubc.emit("msg", msg);
        // outgoing messages need hostname prefixed to address
        msg.addr = os.hostname() + "." + msg.addr;
        if (pubh.connected) {
            pubh.emit("msg", msg);
        }
        else {
            msg_store.push(msg);
        }
    };

    // REQ messages from the apparatus
    this.req = function(msg, rep) {
        winston.debug("req to broker: ", msg);
        if (msg.req == "change-state")
            set_state(msg.data, rep);
        else if (msg.req == "get-state")
            rep(null, state);
        else if (msg.req == "get-meta")
            rep(null, meta);
        else if (msg.req == "get-params")
            rep(null, par);
        else
            rep("invalid REQ type");
    };
}

// *********************************
// Error handling
function error() {
    winston.error(arguments);
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


// initialize the apparatus
apparatus.init(bbb_params);

// start the broker
apparatus.register("broker", new broker(bbb_params.broker));
