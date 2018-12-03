

// var sound = new (require("../lib/alsa"))();

// sound.subscribe("state-changed", console.log);
// sound.subscribe("warning", console.log);
// sound.subscribe("error", console.log);

// sound.event({id: "modify-state", stimulus: "musicbox2.wav", playing: true});

// import { PassThrough } from 'stream'
// const merge = (...streams) => {
//     let pass = new PassThrough()
//     let waiting = streams.length
//     for (let stream of streams) {
//         pass = stream.pipe(pass, {end: false})
//         stream.once('end', () => --waiting === 0 && pass.emit('end'))
//     }
//     return pass
// }

const fs = require("fs");
const wav = require("wav");
const Speaker = require("speaker");
let reader = new wav.Reader();
let file1 = fs.createReadStream("stimuli/st15_ac3.wav");
let file2 = fs.createReadStream("stimuli/st15_aq3.wav");

file1.pipe(reader);


reader.on('format', function(format) {
    console.log(format);
    reader.pipe(new Speaker(format));
});
