// Takes simple stats
//  NOTE: very barebones!

// TODO:
// Get config file from host?
// Send emails?

var _ = require("underscore");
var io = require("socket.io-client");
var winston = require("winston");
//var mailer = require("nodemailer").createTransport();

var par = {
	port: 8027,
	log_path: __dirname +"/logs/",
	//mail_list: "robbinsdart@gmail.com",
	//send_emails: false
}

var pub = io.connect("http://localhost:"+par.port+"/HPUB");
var req = io.connect("http://localhost:"+par.port+"/HREQ");

var stats = {};

var sitterlog = new(winston.Logger)({
	transports: [
	new(winston.transports.File)({
		filename: par.log_path+"data.json",
		json: true,
		timestamp: function(){return Date.now()}
	})]
});
sitterlog.levels['stats'] = 3;

pub.on("connect", function(){
	console.log("Baby-sitter running");
});

pub.on("msg", function(msg){
	if (msg.event == "trial-data") {
		var data = msg.data;
		
		var datafile = data.subject+"_"+data.program+"_"+msg.data.box+"_"+"stats"+".json";
		sitterlog.transports.file.filename = sitterlog.transports.file._basename = datafile;

		if (!stats[data.subject]) stats[data.subject] = data.subject = {};
		if (!stats[data.subject[data.program]]) stats[data.subject[data.program]] = {
			"trials":0, "times_fed":0, "duration":0, "dur_avg":0
		};
		var prev = 	stats[data.subject[data.program[data.trial-1]]];
		var select = stats[data.subject[data.program[data.trial]]] = {};

		select.trials = data.trial;
		if (data.fed == true) select.times_fed = prev.times_fed + 1;
		else select.times_fed = prev.times_fed;
		
		select.feed_trial_ratio = select.times_fed/select.trials;
		select.duration = data.end - data.begin;
		select.dur_avg = (select.duration + prev.dur_avg * prev.trials) / select.trials;
		sitterlog.log("stats", data.box+": stats logged", {"stats": select});
	}
})
