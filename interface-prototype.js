// Create websocket with socket.io
var app = require('http').createServer(handler);
var io = require('socket.io').listen(app);
var fs = require('fs');
var b = require('bonescript');

app.listen(8000);

// socket.io options go here
//io.set('log level', 2); // reduce logging - set 1 for warn, 2 for info, 3 for debug
//io.set('browser client minification', true); // send minified client
//io.set('browser client etag', true); // apply etag caching logic based on version number

console.log('Server running on: http://' + getIPAddress() + ':8000');

var RGHT_RED = "P8_16";
var RGHT_GRN = "P8_15";
var RGHT_BLU = "P8_14";
var CENT_RED = "P8_19";
var CENT_GREEN = "P8_18";
var CENT_BLU = "P8_17";
var CENT_PECK = "P8_43";

b.pinMode(CENT_PECK, b.INPUT, 7, 'pullup');

var pins = [RGHT_RED, RGHT_GRN, RGHT_BLU, CENT_RED, CENT_GREEN, CENT_BLU];
configOutput(pins);

var starboard = { // the  six leds
  "rcr": { // right red
    "name": "right red led",
    "type": "led",
    "color": "red",
    "state": 0,
    "abstract_state": "off",
  },
  "rcg": { // right green
    "name": "right green led",
    "type": "led",
    "color": "green",
    "state": 0,
    "abstract_state": "off",
  },
  "rcb": { //right blue
    "name": "right blue led",
    "color": "blue",
    "type": "led",
    "state": 0,
    "abstract_state": "off"
  },
  "ccr": { // center red
    "name": "center red led",
    "type": "led",
    "color": "red",
    "state": 0,
    "abstract_state": "off"
  },
  "ccg": { // center green
    "name": "center green led",
    "type": "led",
    "color": "green",
    "state": 0,
    "abstract_state": "off",
  },
  "ccb": { //center blue
    "name": "center blue led",
    "type": "led",
    "color": "blue",
    "state": 0,
    "abstract_state": "off"
  },
  // the beam break detectors (pecks)
  "cp": { // center peck
    "name": "center peck",
    "type": "beambreak",
    "state": 1,
    "abstract_state": "nopeck"
  }
}


// I should probably change the update procedure to use attachIntterutps...
b.attachInterrupt(CENT_PECK, true, b.CHANGE, updateClients);

io.sockets.on('connection', function(socket) {
  // listen to sockets and write analog values to LED's
  socket.on('updateServer', function(data) {
    writeAllStates(data);
    updateClients();
  });
});

function updateClients() {
  readAllStates();
  io.sockets.emit('updateState', starboard);
  console.log("State updated");
}


// turns the physical leds on or off
function writeAllStates(data) {
  writeState(data.rcr, RGHT_RED);
  writeState(data.rcg, RGHT_GRN);
  writeState(data.rcb, RGHT_BLU);
  writeState(data.ccr, CENT_RED);
  writeState(data.ccg, CENT_GREEN);
  writeState(data.ccb, CENT_BLU);
}

function writeState(device, port) {
  b.digitalWrite(port, device.state);
}

// sets the LED states
function readAllStates() {
  readState(starboard.rcr, RGHT_RED);
  readState(starboard.rcb, RGHT_BLU);
  readState(starboard.rcg, RGHT_GRN);
  readState(starboard.ccr, CENT_RED);
  readState(starboard.ccg, CENT_GREEN);
  readState(starboard.ccb, CENT_BLU);
  readState(starboard.cp, CENT_PECK);
}

function readState(device, port) {
  device.state = b.digitalRead(port);
  if (device.type == "led") {
    if (device.state == 0) device.abstract_state = "off";
    else device.abstract_state = "on";
  }
  else if (device.type == "beambreak") {
    if (device.state == 1) device.abstract_state = "nopeck";
    else device.abstract_state = "peck";
  }
}

// configure pins as outputs and set all low
function configOutput(pins) {
  for (i = 0; i < pins.length; i++) {
    b.pinMode(pins[i], b.OUTPUT);
    b.digitalWrite(pins[i], 0);
  }
}

// the handler
function handler(req, res) {
  if (req.url == "/favicon.ico") { // handle requests for favico.ico
    res.writeHead(200, {
      'Content-Type': 'image/x-icon'
    });
    res.end();
    console.log('favicon requested');
    return;
  }
  fs.readFile('interface-prototype.html', // load html file
  function(err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }
    res.writeHead(200);
    res.end(data);
  });
  readAllStates();
  setTimeout(function() {
    io.sockets.emit('updateState', starboard);
  }, 1000);
}

// get server IP address on LAN
function getIPAddress() {
  var interfaces = require('os').networkInterfaces();
  for (var devName in interfaces) {
    var iface = interfaces[devName];
    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) return alias.address;
    }
  }
  return '0.0.0.0';
}