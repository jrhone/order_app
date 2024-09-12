const predef = require("./tools/predef");
const EMA = require("./tools/EMA");
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

var ticksPerSecond = getTicksPerMinute() / 60;
console.log(`Estimated ticks per second: ${ticksPerSecond}`);

// TODO these need to be adjusted for new tick per second
var deltaWindow = ticksPerSecond * 5;
var speedWindow = ticksPerSecond * 60;
var stdevMultiplier = 4;

var lastDelta = null;
var maxSpeed = 1e-10; // TODO change divide by 0 checks
var lastIdx = null;
var ema = EMA(deltaWindow);

var speeds = [];
var averageSpeeds = SMA(speedWindow);
var speedStdev = STDEV(speedWindow);

var numticks = 0;
var tpsHistory = SMA(5);

var memory = null;
var bars = 0;

// TODO get stats on max, avg and distribution of speeds during IB
// TODO a candle with really high speed will show low speed intracandle after

class DeltaSpeed {
    init() {
        lastDelta = null;
        maxSpeed = 1e-10;
        lastIdx = null;
        ema = EMA(deltaWindow);

        speeds = [];
        averageSpeeds = SMA(speedWindow);
        speedStdev = STDEV(speedWindow);

        memory = null;
        tpsHistory = SMA(5);
        numticks = 0;
        bars = 0;
    }

    map(d, idx) {
        if (!d.isLast()){
            return 0;
        }

        // Reset stuff each candle
        if (lastIdx != idx){
            lastIdx = idx;
            bars = bars + 1;

            if (numticks) {
                const z = getTicksPerMinute(d.timestamp());
                const bt =  Math.round(Math.max(numticks / 60, bars == 1 ? z : 1));
                ticksPerSecond = Math.round(tpsHistory(bt));
                console.log(`idx:${idx} numticks:${numticks} bartps:${numticks/60} tps:${ticksPerSecond}`);
            }
    
            numticks = 0;
        }

        numticks = numticks + 1;

        const bidVolume = d.bidVolume();
        const askVolume = d.offerVolume();
        const delta = askVolume - bidVolume;

        const speed = lastDelta ? delta - lastDelta : 0;
        lastDelta = delta;

        speeds.push(speed);
        maxSpeed = Math.max(...speeds.slice(-speedWindow).map(Math.abs));
        
        const tickSpeed = ema(speed);
        const averageSpeed = averageSpeeds(tickSpeed);
        const stdDevSpeed = speedStdev(tickSpeed);
        const rawMultiplier =  (tickSpeed - averageSpeed) / stdDevSpeed;
        const multiplier = Math.round(Math.abs(rawMultiplier));

        if (multiplier >= stdevMultiplier) {
            console.log(`High speed: ${multiplier} at ${d.value()}: ${tickSpeed.toFixed(2)} (at ${d.timestamp().toLocaleTimeString()})`);
        }

        if (memory && memory.length) {
            // console.log(memory);
        }

        if (multiplier >= stdevMultiplier && (!memory || !memory.length || multiplier > memory.length)){
            memory = [...Array(Math.min(Math.ceil(multiplier), ticksPerSecond * 2)).fill(rawMultiplier)]; // tickSpeed
        }

        if (memory){
            const y = memory.pop();
            if (y){
                return y;
            }
        }

        // if (!multiplier){
        // if (multiplier < stdevMultiplier){
        // if (multiplier < 0.5){
        if (Math.abs(rawMultiplier) < stdevMultiplier){ // stdevMultiplier (currently 3)
            return 0;
        }

        return rawMultiplier
        // return tickSpeed;
    }
}

module.exports = {
    name: "deltaSpeed",
    description: /*i18n*/ "Acceleration",
    calculator: DeltaSpeed,
    params: {
        period: predef.paramSpecs.period(14)
    },
    areaChoice: meta.AreaChoice.NEW,
    schemeStyles: predef.styles.solidLine("#8cecff")
};
