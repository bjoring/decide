var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport();
transporter.sendMail({
    from: 'Beagle-1 <shape@beagle-1>',
    to: 'tdr5wc@goog.email.virginia.edu',
    subject: 'Test Message from NodeMailer',
    text: 'Hello world!'
});
