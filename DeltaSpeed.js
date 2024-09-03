const predef = require("./tools/predef");
const EMA = require("./tools/EMA");
const SMA = require("./tools/SMA");
const STDEV = require("./tools/StdDev");
const meta = require("./tools/meta");

// TODO dynamically calculate this, affects the windows below
var ticksPerSecond = 5;
var deltaWindow = ticksPerSecond * 1; // Math.ceil(ticksPerSecond / 2);
var speedWindow = ticksPerSecond * 60; //20;
var stdevMultiplier = 3;

var lastDelta = null;
var maxSpeed = 1e-10; // TODO change divide by 0 checks
var lastIdx = null;
var ema = EMA(deltaWindow);

var speeds = [];
var averageSpeeds = SMA(speedWindow); // hopefully 5min worth
var speedStdev = STDEV(speedWindow);

var numticks = 0;

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
    }

    map(d, idx) {
        if (!d.isLast()){
            return 0;
        }

        // Reset speed and volume each candle
        if (lastIdx != idx){
            lastIdx = idx;
            console.log(`idx:${idx} numticks:${numticks}`);
            numticks = 0;
        }

        numticks = numticks + 1;
        const now = new Date()

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
        const multiplier = Math.abs(Math.floor((tickSpeed - averageSpeed) / stdDevSpeed));

        if (multiplier >= stdevMultiplier) {
            console.log(`High speed: ${multiplier} at ${d.value()}: ${tickSpeed.toFixed(2)} (at ${d.timestamp().toLocaleTimeString()})`);
        }

        return tickSpeed;
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
