const predef = require("./tools/predef");
const SMA = require("./tools/SMA");
const STDEV = require("./tools/StdDev");
const meta = require("./tools/meta");

const getTicksPerMinute = (time = new Date()) => {
    const totalMinutes = time.getUTCHours() * 60 + time.getUTCMinutes();
    const tickRates = {
        preMarket: 60,      // ~22% of the morning session (65/300)
        morningSession: 300, // 100% of the morning session
        lunchHour: 180,     // ~65% of the morning session (195/300)
        afternoonSession: 240, // ~62% of the morning session (185/300)
        postMarket: 60,     // ~12% of the morning session (35/300) (make bigger for testing purposes)
        overnight: 60       // ~3% of the morning session (10/300) (make bigger for testing purposes)
    };

    return totalMinutes >= 780 && totalMinutes < 870 ? tickRates.preMarket :        // 8:00 AM - 9:30 AM EST
           totalMinutes >= 870 && totalMinutes < 1020 ? tickRates.morningSession :  // 9:30 AM - 12:00 PM EST
           totalMinutes >= 1020 && totalMinutes < 1080 ? tickRates.lunchHour :      // 12:00 PM - 1:00 PM EST
           totalMinutes >= 1080 && totalMinutes < 1200 ? tickRates.afternoonSession : // 1:00 PM - 4:00 PM EST
           totalMinutes >= 1200 && totalMinutes < 1320 ? tickRates.postMarket :     // 4:00 PM - 6:00 PM EST
           tickRates.overnight;                                                    // 6:00 PM - 8:00 AM EST
};

var ticksPerSecond = Math.round(getTicksPerMinute() / 60);
console.log(`Estimated ticks per second: ${ticksPerSecond}`);

var lastIdx = null;
var volumeWindow = ticksPerSecond * 60;
var stdevMultiplier = 2;

var volumes = [];
var lastBarVolume = null;
var sma = SMA(volumeWindow);
var std = STDEV(volumeWindow);

var memory = null;
var numticks = 0;
var tpsHistory = EMA(3);

var bars = 0;

class VolumeSpike {
    init() {
        lastIdx = null;

        volumes = [];
        lastBarVolume = null;
        sma = SMA(volumeWindow);
        std = STDEV(volumeWindow);

        memory = null;
        tpsHistory = SMA(5);
        numticks = 0;
        bars = 0;
    }

    map(d, idx) {
        if (!d.isLast()){
            return 0;
        }

        // Reset volume each candle
        if (lastIdx != idx){
            lastIdx = idx;
            lastBarVolume = null;
            bars = bars + 1;

            if (numticks) {
                const z = getTicksPerMinute(d.timestamp());
                ticksPerSecond = Math.max(numticks / 60, bars == 1 ? z : 1);
                ticksPerSecond = Math.round(tpsHistory(ticksPerSecond));
                console.log(`idx:${idx} numticks:${numticks} bartps:${numticks/60} tps:${ticksPerSecond}`);
            }
            numticks = 0;
        }

        numticks = numticks + 1;

        // Volume Spike
        const barVolume = d.volume();
        const tickVolume = lastBarVolume ? barVolume - lastBarVolume : 0;
        volumes.push(tickVolume);
        lastBarVolume = barVolume;

        const averageVolume = sma(tickVolume);
        const stdDevVolume = std(tickVolume);
        const multiplier = Math.round(Math.abs((tickVolume - averageVolume) / stdDevVolume));

        if (multiplier >= stdevMultiplier) {
            // console.log(`Volume spike: ${multiplier} at ${d.value()}: ${tickVolume} (at ${d.timestamp().toLocaleTimeString()})`);
        }

        if (memory && memory.length) {
            // console.log(memory);
        }

        if (multiplier >= stdevMultiplier && (!memory || !memory.length || multiplier > memory.length)){
            memory = [...Array(Math.min(Math.ceil(multiplier), ticksPerSecond * 2)).fill(multiplier)];
        }

        if (memory && memory.pop()){
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
