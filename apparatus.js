/* 
apparatus.js 
	This script starts a webserver on the beaglebone
	through which to monitor and control the device's
	state. It communicates with both the web interface,
	the operant scripts, managing all interaction
	between them and the beaglebone itself.

	To run the script:
		node apparatus.js
*/

// Import required packages
var b = require('./bonescript-lite'); // Javascript-beaglebone I/O
var winston = require('winston'); // logger
var all_starboards = require("./starboards.json"); // JSON containing starboard model information

// Webserver and socket packages
var app = require('http').createServer(handler);
var io = require('socket.io').listen(app);
var fs = require('fs');
var favicon = require('serve-favicon');
var _favicon = favicon('favicon.ico');

// Default values for the command line argument values 
var port = 8000; // port for web interface 
var star_version = "00A0"; // starboard version number (default = dummyboard)
var app_logfile = 'apparatus.log'; //log file name

// Command line arrgument parser
process.argv.forEach(function (val, index, array) {
	if (val == "-p") port = array[index + 1];
	else if (val == "-v") star_version = array[index + 1];
	else if (val == "-l") app_logfile = array[index + 1];
}); // process.argv.forEach

// Setup the winston logger
var logger = new (winston.Logger)( {
	transports: [
  new (winston.transports.File)( {
		filename: 'apparatus.log',
		json: true,
		timestamp: false // the script will insert its own timestamps later
	}),
	new (winston.transports.Console)()]
}); // logger

logger.on("logging", function (transport, level, msg, meta) {
	if (transport.name == "file") io.sockets.emit('appLog', msg);
}); // logger.on

// Set the starboard model
var starboard = all_starboards[star_version];

// Initialize the omni-device objects 
var starstate = {}; // object detailing the apparatus' state
var leds = {};
var feeders = {};
var hl;

// Initialize other global variables
var blinktimer;

// Prepares interaction with starboard and set inital state
setup(starboard);
getAllStates(starboard);

// Start the server
app.listen(port);
logger.info('Server running on: http://' + getIPAddress() + ':' + port, {
	timestamp: timeStamp()
}); // logger.info


/* SETUP FUNCTIONS */
// prepares the board to read inputs and write outputs
function setup(board) { // creates objects for controlling starboard outputs 
	b.init_overlay("BBB-StarBoard", star_version);
	for (var key in board) {
		if (board[key].type == "led") leds[key] = new LED(starboard[key]);
		if (board[key].type == "feed") feeders[key] = new Feeder(starboard[key]);
		if (board[key].type == "houselights") hl = new houseLights(starboard[key]);
		if (board[key].type == "beambreak") starstate[key] = 1;
	} // for
} // setup

b.gpio_monitor("event1", function (err, data) { // creates an event monitor for 
	var timestamp = Date.now();
	var device;

	for (var peck in starboard) {
		if (starboard[peck].type == "beambreak" && data.key == starboard[peck].inputkey) device = starboard[peck].key;
	} // for

	var change = {
		"key": device,
		"state": data.value,
		"name": starboard[device].name
	}; // change

	starstate[device] = change.state;
	updateClients(change, timestamp);
	io.sockets.emit('simulatedPeck', change);
}); // b.gpio_monitor


/* STATE MANIPULATION FUNCTIONS*/
// Updates starboard states into state dictionary
function getAllStates(board) {
	for (var device in board) {
		if (starboard[device].io == "output") getState(device);
	} // for
} //getAllStates

function getState(device, callback) {
	b.led_read(starboard[device].id, function (err, data) {
		starstate[device] = data.value;
		var timestamp = Date.now();
		if (callback) {
			callback(timestamp);
		} // if
	}); // b.led_read
} // getState

// Writes specifieds state to starborad
function writeAllStates(data) {
	for (var device in data) {
		if (starboard[device].io == "output") {
			writeState(device, data[device]);
		} // if
	} // for
} // writeAllStates

function writeState(device, data) {
	b.led_write(starboard[device].id, data);
} // writeState

// Writes, reads state and then updates client on result
function changeState(change) {
	writeState(change.key, change.state);
	getState(change.key, function (time) {
		updateClients(change, time);
	}); // getState

} // changeState

// Tells all clients the current state
function updateClients(change, updatestamp) {
	io.sockets.emit('updateState', starstate);
	if (change && updatestamp && !change.surpress) {
		logger.info("state updated - " + starboard[change.key].name + " : " + printState(change), {
			timestamp: timeStamp(updatestamp)
		}); // logger.info
	} // if
} // updateClients

/* SOCKET AND SERVER FUNCTIONS */ 
// Receiving requests through socket.io
io.sockets.on('connection', function (socket) {

	socket.on('shapeLog', function (msg, meta) { // handle client log information
		io.sockets.emit('shapeLog', msg, meta);
	});

	socket.on('updateServer', function (timestamp, data) { //request to update apparatus' state
		var change = data;
		var requestTime = timestamp;

		logger.info("client request - " + starboard[change.key].name + " : " + printState(change), {
			timestamp: timeStamp(requestTime)
		});
		changeState(change);
	});

	socket.on('simulatePeck', function (timestamp, data) { // request to register a peck
		var change = data;
		var requestTime = timestamp;

		starstate[change.key] = change.state;

		logger.info("client request: simulate " + starboard[change.key].name, {
			timestamp: timeStamp(requestTime)
		});

		var updatestamp = Date.now();
		io.sockets.emit('updateState', starstate);
		io.sockets.emit('simulatedPeck', change);
		logger.info(starboard[change.key].name, "simulated", {
			timestamp: timeStamp(updatestamp)
		});

		starstate[change.key] = 1;
	});

	socket.on('stateQuery', function () { // request for apparatus to return its state 
		updateClients();
	});

	socket.on("ledRequest", function (led, request, blinkparam) { // handles led requests from experiment scripts
		!blinkparam ? leds[led][request]() : blinkLED(leds[led], blinkparam[0], blinkparam[1]);
	});

	socket.on("houseRequest", function (houselights, request, brightness) { // handles house lights requests 
		hl[request](brightness);
	});

	socket.on("feedRequest", function (feeder, request) { // handles feeder requests
		feeders[feeder][request]();
	});
}); // io.sockets.on

// Handles http requests from clients
function handler(req, res) {
	if (req.url == "/favicon.ico") { // handle requests for favico.ico
		_favicon(req, res, function onNext(err) {
			if (err) {
				res.statusCode = 500;
				res.end();
				return ;
			} // if 
		}); // _favicon
	} // if

	if (req.url == "/starboard") { // handles requests for starboard setup
		res.writeHead(200, { 
			'content-type': 'application/json'
		}); // res.writeHead
		res.write(JSON.stringify(starboard));
		res.end();
	} // if

	if (req.url == "/starstate") { // handles requests for starboard's state
		getAllStates();
		res.writeHead(200, {
			'content-type': 'application/json'
		}); // res.writeHead
		res.write(JSON.stringify(starstate));
		res.end();
	} // if

	fs.readFile('interface-prototype.html', // load interface html file
		function (err, data) {
				if (err) {
					res.writeHead(500);
					return res.end('Error loading index.html');
				} // if
				res.writeHead(200);
				res.end(data);
			}); // fs.readFile
} // handler

// get server IP address on LAN
function getIPAddress() {
	var interfaces = require('os').networkInterfaces();
	for (var devName in interfaces) {
		var iface = interfaces[devName];
		for (var i = 0; i < iface.length; i++) {
			var alias = iface[i];
			if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) return alias.address;
		} // for
	} // for
	return '0.0.0.0';
} // getIPAddress

/* OUTPUT OBJECTS */
// LED object for easy state changes
function LED(object) { 
	var togglestate = 0;
	var key = object.key;

	return {
		key: key,
		on: function () {
			changeState( {
				"key": object.key,
				"state": 1
			}); // changeState
		}, // on
		off: function () {
			changeState( {
				"key": object.key,
				"state": 0
			}); // changeState
		}, // off
		toggle: function () {
			togglestate = togglestate ? 0 : 1;
			changeState( {
				"key": object.key,
				"state": togglestate,
				"surpress": true
			}); // changeState
		}, // toggle
		stopBlink: function () {
			clearInterval(blinktimer);
			changeState( {
				"key": object.key,
				"state": 0
			}); // changeState
		} // stopBlink
	}; // return
} // LED

// Houselights object. (An LED object that supports 255 brightness states)
function houseLights(object) {
	var key = object.key;
	return {
		key: key,
		on: function (brightness) {
			changeState( {
				"key": object.key,
				"state": brightness
			}); // changeState
		}, // on
		off: function () {
			changeState( {
				"key": object.key,
				"state": 0
			}); // changeState
		}, // off
	}; // return
} // houseLights

// Function for blinking LEDs or houselights
function blinkLED(led, rate, duration) {
	clearInterval(blinktimer);
	blinktimer = setInterval(led.toggle, rate);
	if (duration > 0) setTimeout(led.stopBlink, duration);
	logger.info("blinking", starboard[led.key].name, "every", rate + "ms", {
		timestamp: timeStamp()
	}); // if
} // blinkLED

// Feeder object. (Again, essentially an LED)
function Feeder(object) {
	return {
		raise: function () {
			changeState( {
				"key": object.key,
				"state": 1
			});
		},
		lower: function () {
			changeState( {
				"key": object.key,
				"state": 0
			});
		}
	};
}

/* MISC FUNCTIONS*/
// Quick timestamp function
function timeStamp(time) {
	var unixstamp;

	if (time) unixstamp = time;
	else unixstamp = Date.now();

	var utcstamp = new Date(unixstamp);

	return utcstamp.toJSON();
} // timeStamp

// Interperts the device state for easier logging and reading
function printState(device) {
	var statement = "";
	if (starboard[device.key].type == "led") {
		statement = device.state == 1 ? "on" : "off";
	} else if (starboard[device.key].type == "beambreak") {
		statement = device.state === 0 ? "beam broken (peck)" : "beam unbroken";
	} else if (starboard[device.key].type == "houselights") {
		statement = device.state === 0 ? "off" : (device.state / 255).toFixed(2) * 100 + "% brightness";
	} else if (starboard[device.key].type == "feed") {
		statement = device.state == 1 ? "feeding" : "not feeding";
	} // if

	return statement;
} // printState
