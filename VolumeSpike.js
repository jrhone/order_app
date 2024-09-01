const predef = require("./tools/predef");
const SMA = require("./tools/SMA");
const STDEV = require("./tools/StdDev");
const meta = require("./tools/meta");

var lastIdx = null;

var volumes = [];
var lastBarVolume = null;
var sma = SMA(100);
var std = STDEV(100);

// TODO reset speed for each bar or recent activity
// TODO how to show sustained momentum?
// - smoothing or averaging (ema)
// TODO get stats on max, avg and distribution of speeds during IB

class VolumeSpike {
    init() {
        lastIdx = null;

        volumes = [];
        lastBarVolume = null;
        sma = SMA(100);
        std = STDEV(100);
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
        const dynamicThreshold = averageVolume + (3 * stdDevVolume);
        // console.log(`other ${idx} ${tickVolume} ${stdDevVolume}`);

        const isVolumeSpike = tickVolume > dynamicThreshold;
        if (isVolumeSpike) {
            console.log(`Volume spike detected at ${d.value()}: ${tickVolume} > ${dynamicThreshold} (at ${d.timestamp().toLocaleTimeString()})`);
        }
        return isVolumeSpike ? 1 : 0
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
