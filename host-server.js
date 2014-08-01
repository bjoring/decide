var _ = require("underscore");
var winston = require("winston");
var express = require("express");
var app = require("express")();
var server = require("http").Server(app);
var util = require(__dirname+"/lib/util");

var debug = process.env.DEBUG ? true : false;

var par = {
	address: null, // set to 'localhost' for deployment
	port: 8010,
	mail_list: "robbinsdart@gmail.com",
	log_path: __dirname + "/logs/",
	send_emails: true
};

var boxes = {};

server.listen(par.port, par.address);

var io = require('socket.io')(server);

server.on('listening', function() {
	console.log('Server listening on http://%s', util.getIPAddress());
});


// channels for communicating with BBBs
var bpub = io.of("/BPUB");
var breq = io.of("/BREQ");

// channels for communicating with host-side clients
var hpub = io.of("/HPUB");
var hreq = io.of("/HREQ");

// temporarily disabled for debugging
// console.log("Starting baby-sitter");
// var babysitter = require('child_process').fork(__dirname + "/baby-sitter.js");


bpub.on('connection', function(socket) {
	var name = "unregistered";

	socket.emit('register-box', function(hostname, ip, port) {
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

	socket.on('msg', function(msg) {
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

			datalog.log('data', "data-logged", {
				data: msg.data
			});
			console.log(name + ": data logged");
		} else {
			var eventfile = name + "_events.json";
			eventlog.transports.file.filename = eventlog.transports.file._basename = eventfile;

			if (msg.event == "log") {
				if (msg.level == "error") {
					eventlog.log('error', "error-logged", msg);
					console.log(name + ": error logged");
				} else {
					eventlog.log('info', "info-logged", msg);
					console.log(name + ": info logged");
				}
			} else {
				eventlog.log('event', "event-logged", msg);
				console.log(name + ": event logged");
			}
		}

		socket.on('graceful-exit', function() {
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
				filename: par.log_path + "data.json",
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
				filename: par.log_path + "eventlog.json",
				json: true,
				timestamp: function() {
					return Date.now();
				}
			})
		]
	});
	eventlog.levels.event = 3;
}); // io.sockets.on

if (!debug) {
	process.on('uncaughtException', function(err) {
		var subject = "Uncaught Exception";
		var message = 'Caught exception: ' + err;
		util.mail("host-server", par.mail_list, subject, message, process.exit);
	});
}

function get_store(name) {
	console.log("requesting " + name + " log store");
	io.to(boxes[name].socket).emit("send-store");
}

// handle http requests from clients
app.get("/", function(req, res) {
	res.sendfile(__dirname + "/static/directory.html");
});

app.get("/boxes", function(req, res) {
	res.send(boxes);
});

// all other static content resides in /static
app.use("/static", express.static(__dirname + "/static"));