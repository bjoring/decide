console.log('running');

process.on('exit', function(code) {
	console.log("Test exiting");
	loglog();
});

function loglog(){
	console.log("This logged!")
}

process.on('SIGINT', function() {
    console.log('SIGINT received. Killing experiment');
    process.exit();
});

process.on('message', function(m){
	console.log(m);
})