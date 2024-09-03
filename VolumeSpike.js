const predef = require("./tools/predef");
const SMA = require("./tools/SMA");
const STDEV = require("./tools/StdDev");
const meta = require("./tools/meta");

var lastIdx = null;

var ticksPerSecond = 5;
var volumeWindow = ticksPerSecond * 60;
var stdevMultiplier = 2;

var volumes = [];
var lastBarVolume = null;
var sma = SMA(volumeWindow);
var std = STDEV(volumeWindow);

var memory = null;

class VolumeSpike {
    init() {
        lastIdx = null;

        volumes = [];
        lastBarVolume = null;
        sma = SMA(volumeWindow);
        std = STDEV(volumeWindow);

        memory = null;
    }

    map(d, idx) {
        if (!d.isLast()){
            return 0;
        }

        // Reset volume each candle
        if (lastIdx != idx){
            lastIdx = idx;
            lastBarVolume = null;
        }

        // Volume Spike
        const barVolume = d.volume();
        const tickVolume = lastBarVolume ? barVolume - lastBarVolume : 0;
        volumes.push(tickVolume);
        lastBarVolume = barVolume;

        const averageVolume = sma(tickVolume);
        const stdDevVolume = std(tickVolume);
        const multiplier = Math.abs(Math.floor((tickVolume - averageVolume) / stdDevVolume));

        if (multiplier >= stdevMultiplier) {
            console.log(`Volume spike: ${multiplier} at ${d.value()}: ${tickVolume} (at ${d.timestamp().toLocaleTimeString()})`);
        }

        if (memory && memory.length) {
            console.log(memory);
        }

        if (multiplier >= stdevMultiplier && (!memory || !memory.length || multiplier > memory.length)){
            memory = [...Array(Math.min(multiplier, ticksPerSecond)).fill(multiplier)];
        }

        if (memory && memory.pop()){
            // Uncomment to do one extra tick instead
            // memory = null;
            return 1;
        }

        return multiplier >= stdevMultiplier ? 1 : 0;
    }
}

module.exports = {
    name: "volumeSpike",
    description: /*i18n*/ "Volume Spike",
    calculator: VolumeSpike,
    params: {
        period: predef.paramSpecs.period(14)
    },
    areaChoice: meta.AreaChoice.NEW,
    schemeStyles: predef.styles.solidLine("#48abde")
};
