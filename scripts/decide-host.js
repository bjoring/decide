#!/usr/bin/env node
// this is the broker process for the host
var fs = require("fs");
var express = require("express");
var http = require("http");
var sockets = require("socket.io");
var logger = require("../lib/log");
var util = require("../lib/util");

var par = util.load_config("host-config.json");

var boxes = {};

// *********************************
// HTTP servers: one facing devices, one facing clients
var app_int = express();
var serv_int = http.Server(app_int);
serv_int.listen(par.port_int, par.addr_int);
serv_int.on("listening", function() {
    var addr = serv_int.address();
    logger.info("endpoint for devices: http://%s:%s", addr.address, addr.port);
});

var app_ext = express();
app_ext.enable('trust proxy');
var serv_ext = http.Server(app_ext);
// serv_ext.listen(par.port_ext, par.addr_ext);
serv_ext.listen(8030, "localhost")
serv_ext.on("listening", function() {
    var addr = serv_ext.address();
    logger.info("endpoint for clients: http://%s:%s", addr.address, addr.port);
});

// handle http requests from clients
app_ext.get("/", function(req, res) {
    res.sendfile(__dirname + "/static/directory.html");
});

app_ext.get("/boxes", function(req, res) {
    res.send(boxes);
});

// all other static content resides in /static
app_ext.use("/static", express.static(__dirname + "/static"));


// *********************************
// socket.io servers
var io_int = sockets(serv_int);
var io_ext = sockets(serv_ext);

// PUB messages from devices
io_int.on("connection", function(socket) {
    var client_key = null;
    var client_addr = (socket.handshake.headers['x-forwarded-for'] ||
                       socket.request.connection.remoteAddress);
    logger.info("connection on internal port from:", client_addr);

    // state-changed messages are forwarded to clients and logged locally
    socket.on("state-changed", function(msg) {
        logger.debug("PUB from", client_addr, msg);
        io_ext.emit("state-changed", msg);
    });

    // route messages are used to register the client
    socket.on("route", function(msg, rep) {
        rep = rep || function() {};
        if (client_key) {
            rep("err", "socket is already registered as " + client_key);
        }
        else if (_.has(boxes, msg.ret_addr)) {
            rep("err", "address " + msg.ret_addr + " already taken");
        }
        else {
            client_key = msg.ret_addr;
            boxes[client_key] = {
                address: client_addr
            }
            logger.info("%s registered as", client_addr, client_key);
            rep("ok");
        }
    });

    socket.on("unroute", function(msg, rep) {
        rep = rep || function() {};
        delete boxes[client_key];
        logger.info("%s unregistered as", client_addr, client_key);
        client_key = null;
        rep("ok")
    });

    socket.on("disconnect", function() {
        if (client_key) {
            error("client " + client_key + " disconnected unexpectedly")
            delete boxes[client_key];
            client_key = null;
        }
        else
            logger.info("disconnection from internal port by", client_addr)
    })

    // socket.on("msg", function(msg) {
    //     // add the BBB hostname to the front of pub addresses
    //     msg.addr = msg.addr ? name + "." + msg.addr : name;

    //     // forward BBB pub messages to the host-side clients
    //     hpub.emit("msg", msg);

    //     // log trial-data
    //     // TODO: separate this into own component
    //     if (msg.event == "trial-data") {
    //         var datafile = msg.data.subject + "_" + msg.data.program + "_" + msg.data.box + ".json";
    //         datalog.transports.file.filename = datalog.transports.file._basename = datafile;

    //         if (msg.data.end == 0) msg.error = "LOG ERROR: Trial terminated early";

    //         datalog.log("data", "data-logged", {
    //             data: msg.data
    //         });
    //         console.log(name + ": data logged");
    //     } else {
    //         var eventfile = name + "_events.json";
    //         eventlog.transports.file.filename = eventlog.transports.file._basename = eventfile;

    //         if (msg.event == "log") {
    //             if (msg.level == "error") {
    //                 eventlog.log("error", "error-logged", msg);
    //                 console.log(name + ": error logged");
    //             } else {
    //                 eventlog.log("info", "info-logged", msg);
    //                 console.log(name + ": info logged");
    //             }
    //         } else {
    //             eventlog.log("event", "event-logged", msg);
    //             console.log(name + ": event logged");
    //         }
    //     }

    //     socket.on("graceful-exit", function() {
    //         boxes[name].graceful_exit = true;
    //     });
    // });

    // // set up unique loggers for each box
    // var datalog = new(logger.Logger)({
    //     transports: [
    //         new(logger.transports.File)({
    //             filename: __dirname + par.log_path + "/data.json",
    //             json: true,
    //             timestamp: function() {
    //                 return Date.now();
    //             }
    //         })
    //     ]
    // });
    // datalog.levels.data = 3;

    // var eventlog = new(logger.Logger)({
    //     transports: [
    //         new(logger.transports.File)({
    //             filename: __dirname + par.log_path + "/eventlog.json",
    //             json: true,
    //             timestamp: function() {
    //                 return Date.now();
    //             }
    //         })
    //     ]
    // });
    // eventlog.levels.event = 3;
});


// temporarily disabled for debugging
// logger.info("Starting baby-sitter");
// var babysitter = require("child_process").fork(__dirname + "/baby-sitter.js");

// *********************************
// Error handling
if (par.send_emails) {
    process.on("uncaughtException", function(err) {
        var subject = "Uncaught Exception";
        var message = "Caught exception: " + err;
        util.mail("host-server", par.mail_list, subject, message, process.exit);
    });
}