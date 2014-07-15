var _ = require("underscore");
var winston = require("winston");
var boxes = {};

var par = {
	port: 8027
}


var io = require('socket.io')(par.port);
console.log('Server running on: http://' + getIPAddress() + ':' + par.port);

io.sockets.on('connection', function(socket) {
	var name = "unregistered";
	var datafile = "data.json"
	var datalog = new(winston.Logger)({
		transports: [
		new(winston.transports.File)({
			filename: datafile,
			json: true,
			timestamp: function(){return Date.now()}
		})]
	});
	datalog.levels['data'] = 3;

	var eventfile = "event.json"
	var eventlog = new(winston.Logger)({
		transports: [
		new(winston.transports.File)({
			filename: "eventlog.json",
			json: true,
			timestamp: function(){return Date.now()}
		})]
	});
	eventlog.levels['event'] = 3;

	socket.emit('register-box', function(hostname, ip) {
		name = hostname;
		boxes[name] = {}
		boxes[name].ip = ip;
		boxes[name].socket = socket.id;
		console.log(name,"connected");
		test(name);
	});

	socket.on('msg', function(msg){
		msg.addr = msg.addr ? name+"."+msg.addr : name;
		if (msg.event == "trial-data") {
			if (datafile = "data.json") {
				datafile = msg.data.subject+"_"+msg.data.program+"_"+msg.data.box+".json";
				datalog.transports.file.filename = datafile;
				datalog.transports.file._basename = datafile;
			} 
				datalog.log('data',"data-logged", {data: msg.data});
		} 
		else {
			if (eventfile == "event.json" && name == "unregistered") {
				eventfile = name+"_events.json";
				eventlog.transports.file.filename = eventfile;
				eventlog.transports.file._basename = eventfile;
			}
			if (msg.event == "log"){
				if (msg.level = "error") eventlog.log('error', "error logged", msg);
				else eventlog.log('info', "info logged", msg);
			} else {
				eventlog.log('event',"event logged",msg);
			}
		}
	});

	socket.on("disconnect", function() {
		console.log(name,"disconnected");
		delete boxes[name];
	})
}); // io.sockets.on

function test(name) { io.to(boxes[name].socket).emit("test"); }

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