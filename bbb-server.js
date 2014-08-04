// this is the broker process for the device - it's intended to be integrated as
// a component of the apparatus, but it relays messages to and from other clients
var _ = require("underscore");
var fs = require("fs");
var os = require("os");
var proc = require("child_process");
var winston = require("winston");
var express = require("express");
var http = require("http");
var sockets = require("socket.io");
var sock_cli = require("socket.io-client");
var apparatus = require("./lib/apparatus");
var util = require("./lib/util");

// Log pub and req events at info level. TODO disable after debugging?
winston.levels.pub = 3;
winston.levels.req = 3;

var host_par = JSON.parse(fs.readFileSync(__dirname + "/host-config.json"));

// NB: communication code is at module level b/c controller really is a singleton

// *********************************
// HTTP server
var app = express();
var server = http.Server(app);
server.listen(host_par.port_int);
server.on("listening", function() {
    var addr = server.address();
    winston.info("server listening on %s port %s", addr.address, addr.port);
})

app.get("/", function(req, res) {
    res.sendfile(__dirname + "/static/interface.html");
});

app.get("/state", function(req, res) {
    apparatus.req({
        req: "get-state",
        addr: ""
    }, function(err, rep) {
        if (err)
            res.send(500, err);
        else
            res.send(rep);
    });
});

app.get("/components", function(req, res) {
    apparatus.req({
        req: "get-meta",
        addr: ""
    }, function(err, rep) {
        if (err)
            res.send(500, err);
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
    // holds key used to route client
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
        apparatus.register(key, {
            // client gets pubs through socket already
            pub: function() {},
            req: function(msg, rep) {
                socket.emit("msg", msg, _.partial(rep, null));
            }
        });
        // TODO clients asking for same name?
        client_key = key;
        rep("route-ok");
    });

    socket.on("unroute", function(key, rep) {
        apparatus.unregister(key);
        client_key = null;
        rep("unroute-ok");
    });

    socket.on("hugz", function(data, rep) {
        rep("hugz-ok");
    });

    socket.on("killexp", function(callback) {
        if (exp) {
            exp.kill("SIGINT");
            exp = null;
            callback("Experiment stopped.");
        } else {
            callback("Error: No procedure to stop!");
        }
    });

    socket.on("disconnect", function() {
        if (client_key) {
            apparatus.unregister(client_key);
            client_key = null;
        }
        winston.info("disconnect on REQ:", client_addr);
    });
});

// *********************************
// socket.io connection to host
var host_addr = "http://" + host_par.addr_int + ":" + host_par.port_int;
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

function controller(params, callback) {

    var meta = {
        type: "controller"
    };

    var par = {};
    util.update(par, params);

    var state = {
        procedure: null,
        params: null
    }

    function set_state(data, rep) {
        if (state.procedure === null) {
            if (data.procedure === null) {
                state.params = null;
                rep(null, state);
            }
        }
        else {
            if (data.procedure === null) {
                // attempt to terminate running procedure
            }
            else {
                rep("procedure is running; terminate first to change");
            }
        }

    }

socket.on("runexp", function(inexp, args, opt, callback) {
        // Spawns an procedure process after error handling
        var rep;
        // check if procedure is not already running
        if (!exp) {
            var path = par.exp_dir + inexp;
            // check if procedure file exists
            if (fs.existsSync(path) || fs.existsSync(path + ".js")) {
                if (args[0]) {
                    for (var i = 0; i < args.length; i++) {
                        if (args[i] == "-c") {
                            var argpath = par.exp_dir + args[i + 1];
                            // if given, check for config file's existence
                            if (fs.existsSync(argpath) || fs.existsSync(argpath + ".js") || fs.existsSync(argpath + ".json")) {
                                exp = require("child_process")
                                    .fork(path, args, opt);
                                rep = "Running " + inexp;
                            } else {
                                rep = "Error: No such config file";
                            }
                            i = args.length;
                        }
                    }
                } else {
                    exp = require("child_process")
                        .fork(path, args, opt);
                    rep = "Running " + inexp;
                }
            } else {
                rep = "Error: No such procedure";
            }
        } else rep = "Error: Experiment already running.";
        if (callback) callback(rep);
    })

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
        if (msg.req == "get-state") {
            rep(null, state);
        }
        else if (msg.req == "change-state") {
            set_state(msg.data, rep);
        }
        rep(null, {});
    };
}

// *********************************
// Error handling
process.on("SIGINT", function() {
    console.log("SIGINT received.");
    console.log("Informing host of graceful exit");
    prepare_host_disconnect();
    console.log("Exiting gracefully");
    process.kill();
});

if (host_par.send_emails) {
    process.on("uncaughtException", function(err) {
        var subject = "Caught Exception - " + Date.now();
        var message = err;
        util.mail("controller", host_par.mail_list, subject, message, process.exit);
        console.log(subject);
    });
}

// TODO be smarter about this if run as script
var params = {};
if (process.argv.length > 3) {
    var buf = fs.readFileSync(process.argv[2]);
    params = JSON.parse(buf);
}

// initialize the apparatus
apparatus.init(params);

// start the broker
apparatus.register("controller", new controller(params.controller));
