/* utility functions */
var mailer = require('nodemailer').createTransport();
f = {};

// updates fields in object x with corresponding values in object y
f.update = function(x, y) {
  if (y === undefined || y === null) return;
  for (var key in x) {
    if (x.hasOwnProperty(key) && y.hasOwnProperty(key)) {
      x[key] = y[key];
    }
  }
};

// updates fields in object x with values in y, including fields only in y
f.extend = function(x, y) {
  if (y === undefined || y === null) return;
  for (var key in y) {
    if (y.hasOwnProperty(key)) {
      x[key] = y[key];
    }
  }
};

// returns a new object with keys and values as specified
f.mapzip = function(keys, values) {

}

// get server IP address on LAN
f.getIPAddress = function() {
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

f.mail = function(from, to, subject, message, callback) {
  if (par.send_emails) {
    console.log("sending email");
    mailer.sendMail({
      from: from + "@" + require('os').hostname(),
      to: to,
      subject: subject,
      text: message,
    }, function() {
      if (callback) callback();
    });
  }
}


module.exports = f;
