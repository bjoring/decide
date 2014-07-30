// this is the broker process for the controller

var fs = require("fs");
var _ = require("underscore");
var express = require("express");
var winston = require("winston"); // logger
var apparatus = require("./lib/apparatus");
var util = require("./lib/util");

// Log pub and req events at info level. TODO disable after debugging?
winston.levels['pub'] = 3
winston.levels['req'] = 3

var app = require("express")();
var server = require("http").Server(app);

function controller(params) {

  var meta = {
	type: "controller"
  };

  var par = {
	port: 8000,
	exp_dir: __dirname + "/experiments/"
  };
  util.update(par, params);

  var io = require("socket.io").listen(server);

  var state = {
	host_name: null,
	online: false,
	ip_address: null,
	protocol: null
  };

  state.host_name = require('os').hostname();

  server.listen(par.port, function() {
	state.online = true;
	state.ip_address = getIPAddress();
	winston.info("server listening on", state.ip_address);
  })

  var pubc = io.of("/PUB");
  var reqc = io.of("/REQ");

  // host server interaction
  var clientio = require('socket.io-client');
  var host_pub = clientio.connect('http://aplonis.local:8010/BPUB');
  host_pub.on("connection", function() {
	  winston.info("connected to host");
  });

	host_pub.on("disconnect", function() {
	  winston.info("disconnected from host")
		host_forward = false;
		winston.info("storing messages for next connect");
	});

	host_pub.on("register-box", function(reply) {
	   reply(state.host_name, state.ip_address, par.port);
		  winston.info(state.host_name,"registered in host");
		  send_store();
	});

	host_pub.on("send-store", function(){
	    send_store();
	});

	var msg_store = [];
	var host_forward = false;
	function send_store() {
		winston.info("sending log store");
		while(msg_store.length != 0) {
		   var msg = msg_store.shift();
		   host_pub.emit("msg",msg);
		}
		host_forward = true;
	}


  // these methods are called by the apparatus module
  this.pub = function(msg) {
	// forward to connected clients
	pubc.emit("msg", msg);
	// forward to host
	if (host_forward) host_pub.emit("msg",msg);
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
	winston.info("connection on PUB:", socket.handshake.address)
	socket.on("msg", function(msg) {
	  apparatus.pub(msg);
	  socket.broadcast.emit("msg", msg);
   });

	socket.on("disconnect", function() {
	  winston.info("disconnect on PUB:", socket.handshake.address)
	})
  });


  var exp;

  // route req to apparatus
  reqc.on("connection", function(socket) {
	winston.info("connection on REQ:", socket.handshake.address)
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
		req: function(msg, rep) { socket.emit("msg", msg, _.partial(rep, null)) }
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
		var rep;
		if (!exp) {
			var path = par.exp_dir+inexp
			// TODO: Fix awful, messy error handling
			if (fs.existsSync(path) || fs.existsSync(path+".js")) {
				if (args[0]) {
					for (var i = 0; i < args.length; i++) {
						if (args[i] == "-c") {
							var argpath = par.exp_dir+args[i+1];
							if (fs.existsSync(argpath) || fs.existsSync(argpath+".js") || fs.existsSync(argpath+".json")) {
								exp = require('child_process').fork(path, args, opt);
								rep = "Running " + inexp;
							} else {
								rep = "Error: No such config file";
							}
							i = args.length;
						}
					}
				} else {
					exp = require('child_process').fork(path, args, opt);
					rep = "Running " + inexp;
				}
			}
			else {
				rep = "Error: No such experiment";
			}
		}
		else rep = "Error: Experiment already running.";
		if (callback) callback(rep);
	});

	socket.on("killexp", function(callback){
		if (exp) {
			exp.kill('SIGINT');
			exp = null;
			callback("Experiment stopped. Warning: Some on/blinking cues may need to be manually turned off.");
		} else {
			callback("Error: No experiment to stop!");
		}
	});

	socket.on("disconnect", function() {
	  if (socket.apparatus_key)
		apparatus.unregister(socket.apparatus_key);
	  winston.info("disconnect on REQ:", socket.handshake.address)
	})
  })

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
  apparatus.req({ req: "get-state", addr: ""}, function(err, rep) {
	if (err)
	  res.send(500, err)
	else
	  res.send(rep);
  });
});

app.get("/components", function(req, res) {
  apparatus.req({ req: "get-meta", addr: ""}, function(err, rep) {
	if (err)
	  res.send(500, err)
	else
	  res.send(rep);
  });
});

// all other static content resides in /static
app.use("/static", express.static(__dirname + "/static"));

// initialize the apparatus
apparatus.init(params)

// start the broker
apparatus.register("controller", new controller(params.controller))

// getting the correct ip address
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

function mail(subject, message, callback) {
    console.log("SENDING MAIL");
    require('nodemailer').createTransport().sendMail({
		from: "controller@"+require('os').hostname(),
		to: "robbinsdart@gmail.com",
		subject: subject,
		text: message
	    }, function(){
		if (callback) callback();
    });
}

process.on('SIGINT', function() {
    console.log('SIGINT received.');
    console.log('Informing host of graceful exit');
    host_pub.emit('graceful_exit');
    console.log('Exiting gracefully');
    process.exit();
});

process.on('uncaughtException', function(err) {
    var subject = "Caught Exception - " + Date.now();
    var message = err;
    mail(subject, message, process.exit);
    console.log(subject);
});

