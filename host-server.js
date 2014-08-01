// this is the broker process for the host
var fs = require("fs");
var winston = require("winston");
var express = require("express");
var http = require("http");
var sockets = require("socket.io");
var util = require("./lib/util");
var par = JSON.parse(fs.readFileSync(__dirname + "/host-config.json"));

var boxes = {};

// server listens on two ports - one facing devices, one facing clients
var app_dev = express();
var serv_dev = http.Server(app_dev);
serv_dev.listen(par.port_int, par.addr_int);
serv_dev.on("listening", function() {
    var addr = serv_dev.address();
    winston.info("endpoint for devices: http://%s:%s", addr.address, addr.port);
});
var io_dev = sockets(serv_dev);

var app_cli = express();
var serv_cli = http.Server(app_cli);
serv_cli.listen(par.port_ext, par.addr_ext);
serv_cli.on("listening", function() {
    var addr = serv_cli.address();
    winston.info("endpoint for clients: http://%s:%s", addr.address, addr.port);
});
var io_cli = sockets(serv_cli);

// channels for communicating with BBBs
var bpub = io_dev.of("/PUB");
var breq = io_dev.of("/REQ");

// channels for communicating with host-side clients
var hpub = io_cli.of("/PUB");
var hreq = io_cli.of("/REQ");

// temporarily disabled for debugging
// winston.info("Starting baby-sitter");
// var babysitter = require("child_process").fork(__dirname + "/baby-sitter.js");

// handling PUB messages from devices
bpub.on("connection", function(socket) {
    var name = "unregistered";

    socket.emit("register-box", function(hostname, ip, port) {
        name = hostname;
        boxes[name] = {};
        boxes[name].name = hostname;
        boxes[name].ip = ip;
        boxes[name].port = port;
        boxes[name].socket = socket.id;
        boxes[name].graceful_exit = false;
        console.log(name, "connected");
        hpub.emit("msg", {
            addr: "",
            time: Date.now(),
            event: "box-registered",
            data: boxes[name]
        });
        get_store(name);
    });

    socket.on("msg", function(msg) {
        // add the BBB hostname to the front of pub addresses
        msg.addr = msg.addr ? name + "." + msg.addr : name;

        // forward BBB pub messages to the host-side clients
        hpub.emit("msg", msg);

        // log trial-data
        // TODO: separate this into own component
        if (msg.event == "trial-data") {
            var datafile = msg.data.subject + "_" + msg.data.program + "_" + msg.data.box + ".json";
            datalog.transports.file.filename = datalog.transports.file._basename = datafile;

            if (msg.data.end == 0) msg.error = "LOG ERROR: Trial terminated early";

            datalog.log("data", "data-logged", {
                data: msg.data
            });
            console.log(name + ": data logged");
        } else {
            var eventfile = name + "_events.json";
            eventlog.transports.file.filename = eventlog.transports.file._basename = eventfile;

            if (msg.event == "log") {
                if (msg.level == "error") {
                    eventlog.log("error", "error-logged", msg);
                    console.log(name + ": error logged");
                } else {
                    eventlog.log("info", "info-logged", msg);
                    console.log(name + ": info logged");
                }
            } else {
                eventlog.log("event", "event-logged", msg);
                console.log(name + ": event logged");
            }
        }

        socket.on("graceful-exit", function() {
            boxes[name].graceful_exit = true;
        });
    });

    socket.on("disconnect", function() {
        console.log(name, "disconnected");
        if (boxes[name].graceful_exit === false) util.mail("host-server",par.mail_list,"Beaglebone disconnect", name + " disconnected from host - " + Date.now());
        hpub.emit("msg", {
            addr: "",
            time: Date.now(),
            event: "box-unregistered",
            data: boxes[name]
        });
        delete boxes[name];

    });

    // set up unique loggers for each box
    var datalog = new(winston.Logger)({
        transports: [
            new(winston.transports.File)({
                filename: __dirname + par.log_path + "/data.json",
                json: true,
                timestamp: function() {
                    return Date.now();
                }
            })
        ]
    });
    datalog.levels.data = 3;

    var eventlog = new(winston.Logger)({
        transports: [
            new(winston.transports.File)({
                filename: __dirname + par.log_path + "/eventlog.json",
                json: true,
                timestamp: function() {
                    return Date.now();
                }
            })
        ]
    });
    eventlog.levels.event = 3;
}); // io.sockets.on

if (par.send_emails) {
    process.on("uncaughtException", function(err) {
        var subject = "Uncaught Exception";
        var message = "Caught exception: " + err;
        util.mail("host-server", par.mail_list, subject, message, process.exit);
    });
}

function get_store(name) {
    console.log("requesting " + name + " log store");
    io.to(boxes[name].socket).emit("send-store");
}

// handle http requests from clients
app_cli.get("/", function(req, res) {
    res.sendfile(__dirname + "/static/directory.html");
});

app_cli.get("/boxes", function(req, res) {
    res.send(boxes);
});

// all other static content resides in /static
app_cli.use("/static", express.static(__dirname + "/static"));
