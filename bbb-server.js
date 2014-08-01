// this is the broker process for the device
var _ = require("underscore");
var fs = require("fs");
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

// http/websockets server
var app = express();
var server = http.Server(app);
var io = sockets.listen(server);

// host connection
var host_addr = "http://" + host_par.addr_int + ":" + host_par.port_int + "/PUB";
var pubh = sock_cli.connect(host_addr);

pubh.on("connection", function() {
    winston.info("connected to host socket %s", host_addr);
});

pubh.on("disconnect", function() {
    winston.info("lost connection to host (now queuing messages)");
    host_forward = false;
});

function controller(params) {

    var meta = {
        type: "controller"
    };

    var par = {
        mail_list: "robbinsdart@gmail.com",
        host: "mino",
        host_port: 8010
    };

    util.update(par, params);

    var exp; // will hold the experiment child process


    var state = {
        host_name: null,
        online: false,
        ip_address: null,
        protocol: null
    };

    state.host_name = require("os").hostname();

    server.listen(par.port, function() {
        state.online = true;
        state.ip_address = util.getIPAddress();
        winston.info("server listening on", state.ip_address);
    });

    var pubc = io.of("/PUB");
    var reqc = io.of("/REQ");


    pubh.on("register-box", function(reply) {
        reply(state.host_name, state.ip_address, par.port);
        winston.info(state.host_name, "registered in host");
        send_store();
    });

    pubh.on("send-store", function() {
        send_store();
    });

    // holds msg received while disconnected from host-server
    var msg_store = [];
    // whether msgs should be directly forwarded to host-server
    var host_forward = false;

    function send_store() {
        winston.info("sending log store");
        while (msg_store.length !== 0) {
            var msg = msg_store.shift();
            pubh.emit("msg", msg);
        }

        // directly forward messages only after mst_store is empty
        host_forward = true;
    }

    function prepare_host_disconnect() {
        // tell host-server not to send an email upon this disconnect
        pubh.emit("graceful-exit");
    }


    // these methods are called by the apparatus module
    this.pub = function(msg) {
        // forward to connected clients
        pubc.emit("msg", msg);
        // forward to host
        if (host_forward) pubh.emit("msg", msg);
        else {
            msg_store.push(msg);
        }
    };

    // no requests expected from apparatus
    this.req = function(msg, rep) {
        var ret = {};
        if (msg.req == "get-state") {
            ret = state;
        }
        rep(null, ret);
    };

    // forward pub to connected clients and apparatus components
    pubc.on("connection", function(socket) {
        winston.info("connection on PUB:", socket.handshake.address);
        socket.on("msg", function(msg) {
            apparatus.pub(msg);
            socket.broadcast.emit("msg", msg);
        });

        socket.on("disconnect", function() {
            winston.info("disconnect on PUB:", socket.handshake.address);
        });
    });

    // route req to apparatus
    reqc.on("connection", function(socket) {
        winston.info("connection on REQ:", socket.handshake.address);
        socket.on("msg", function(msg, rep) {
            rep = rep || function() {};
            apparatus.req(msg, function(err, data) {
                if (err)
                    rep("req-err", err);
                else
                    rep("req-ok", data);
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
            socket.apparatus_key = key;
            // TODO clients asking for same name?
            rep("route-ok");
        });

        socket.on("unroute", function(key, rep) {
            apparatus.unregister(key);
            socket.apparatus_key = undefined;
            rep("unroute-ok");
        });

        socket.on("hugz", function(data, rep) {
            rep("hugz-ok");
        });

        socket.on("runexp", function(inexp, args, opt, callback) {
            // Spawns an experiment process after error handling
            var rep;
            // check if experiment is not already running
            if (!exp) {
                var path = par.exp_dir + inexp;
                // check if experiment file exists
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
                    rep = "Error: No such experiment";
                }
            } else rep = "Error: Experiment already running.";
            if (callback) callback(rep);
        });

        socket.on("killexp", function(callback) {
            if (exp) {
                exp.kill("SIGINT");
                exp = null;
                callback("Experiment stopped.");
            } else {
                callback("Error: No experiment to stop!");
            }
        });

        socket.on("disconnect", function() {
            if (socket.apparatus_key)
                apparatus.unregister(socket.apparatus_key);
            winston.info("disconnect on REQ:", socket.handshake.address);
        });
    });
    process.on("SIGINT", function() {
        console.log("SIGINT received.");
        console.log("Informing host of graceful exit");
        prepare_host_disconnect();
        console.log("Exiting gracefully");
        process.kill();
    });
}

// TODO be smarter about this if run as script
var params = {};
if (process.argv.length > 3) {
    var buf = fs.readFileSync(process.argv[2]);
    params = JSON.parse(buf);
}

// handle http requests from clients
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

// initialize the apparatus
apparatus.init(params);

// start the broker
apparatus.register("controller", new controller(params.controller));

process.on("uncaughtException", function(err) {
    var subject = "Caught Exception - " + Date.now();
    var message = err;
    util.mail("controller", par.mail_list, subject, message, process.exit);
    console.log(subject);
});
