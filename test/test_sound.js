
var sound = new (require("../lib/alsa"))();

sound.subscribe("state-changed", console.log);
sound.subscribe("warning", console.log);
sound.subscribe("error", console.log);

sound.event({id: "modify-state", stimulus: "musicbox2.wav", playing: true});
