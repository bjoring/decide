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

var rledRed = "P8_16";
var rledGreen = "P8_15";
var rledBlue = "P8_14";
var cledRed = "P8_19";
var cledGreen = "P8_18";
var cledBlue = "P8_17";
var centerPeck = "P8_43";

b.pinMode(centerPeck, b.INPUT, 7, 'pullup');

// I should probably change the update procedure to use attachIntterutps...
b.attachInterrupt(centerPeck, true, b.CHANGE, updateClients);

var pins = [rledRed, rledGreen, rledBlue, cledRed, cledGreen, cledBlue];
configOutput(pins);
 
io.sockets.on('connection', function (socket) {
  // listen to sockets and write analog values to LED's
  socket.on('updateLEDs', function (data){
    updateLEDs(data);
    updateClients();
  });
});

function updateClients() {
    data = getLEDStates();
    io.sockets.emit('updateState',data);
    console.log("LEDs updated " + data);
}


// sets the LED states
function updateLEDs(data){
  b.digitalWrite(rledRed, data[0]);
  b.digitalWrite(rledGreen, data[1]);
  b.digitalWrite(rledBlue, data[2]);
  b.digitalWrite(cledRed, data[3]);
  b.digitalWrite(cledGreen, data[4]);
  b.digitalWrite(cledBlue, data[5]);
}

// gets the LED states
function getLEDStates() {
  var state = [b.digitalRead(rledRed), b.digitalRead(rledGreen), 
              b.digitalRead(rledBlue), b.digitalRead(cledRed), 
              b.digitalRead(cledGreen), b.digitalRead(cledBlue),
              b.digitalRead(centerPeck)];
  return state;
}

// configure pins as outputs and set all low
function configOutput(pins) {
  for (i = 0; i < pins.length; i++) {
    b.pinMode(pins[i], b.OUTPUT);
    b.digitalWrite(pins[i],0);
  }
}

// the handler
function handler (req, res) {
  if (req.url == "/favicon.ico"){ // handle requests for favico.ico
  res.writeHead(200, {'Content-Type': 'image/x-icon'} );
  res.end();
  console.log('favicon requested');
  return;
  }
  fs.readFile('proto.html', // load html file
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }
    res.writeHead(200);
    res.end(data);
  });
  var initialState = getLEDStates();
  setTimeout(function(){io.sockets.emit('updateState', initialState);}, 1000);
}

// get server IP address on LAN
function getIPAddress() {
  var interfaces = require('os').networkInterfaces();
  for (var devName in interfaces) {
    var iface = interfaces[devName];
    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
        return alias.address;
    }
  }
  return '0.0.0.0';
}