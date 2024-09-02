const predef = require("./tools/predef");
const SMA = require("./tools/SMA");
const STDEV = require("./tools/StdDev");
const meta = require("./tools/meta");

var lastIdx = null;

var ticksPerSecond = 5;
var volumeWindow = ticksPerSecond * 60; // 20;
var stdevMultiplier = 2;

var volumes = [];
var lastBarVolume = null;
var sma = SMA(volumeWindow);
var std = STDEV(volumeWindow);

// TODO reset speed for each bar or recent activity
// TODO how to show sustained momentum?
// - smoothing or averaging (ema)
// TODO get stats on max, avg and distribution of speeds during IB

class VolumeSpike {
    init() {
        lastIdx = null;

        volumes = [];
        lastBarVolume = null;
        sma = SMA(volumeWindow);
        std = STDEV(volumeWindow);
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
        // console.log(`vol ${idx} ${barVolume} ${lastBarVolume} ${tickVolume}`);
        lastBarVolume = barVolume;

        const averageVolume = sma(tickVolume);
        const stdDevVolume = std(tickVolume);
        const multiplier = Math.abs(Math.floor((tickVolume - averageVolume) / stdDevVolume));
        // TODO volume spikes seem rare by 10.45 am, maybe 3 deviations is too much then
        //      they do happen tho, but saw a dump where there was only one
        // console.log(`other ${idx} ${tickVolume} ${stdDevVolume}`);

        // const dynamicThreshold = averageVolume + (3 * stdDevVolume);
        // const isVolumeSpike = tickVolume > dynamicThreshold;
        // if (isVolumeSpike) {
        // return isVolumeSpike ? 1 : 0
        if (multiplier >= stdevMultiplier) {
            console.log(`Volume spike: ${multiplier} at ${d.value()}: ${tickVolume} (at ${d.timestamp().toLocaleTimeString()})`);
        }
        // return multiplier > 1 ? multiplier : 0;

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
