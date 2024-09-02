const predef = require("./tools/predef");
const EMA = require("./tools/EMA");
const SMA = require("./tools/SMA");
const STDEV = require("./tools/StdDev");
const meta = require("./tools/meta");

// TODO dynamically calculate this
var ticksPerSecond = 5;
var deltaWindow = ticksPerSecond * 1; // Math.ceil(ticksPerSecond / 2);
var speedWindow = ticksPerSecond * 60; //20;
var stdevMultiplier = 3;

var lastTime = null;
var lastDelta = null;
var maxSpeed = 1e-10;
var lastIdx = null;
var ema = EMA(deltaWindow);

var speeds = [];
var averageSpeeds = SMA(speedWindow); // hopefully 5min worth
var speedStdev = STDEV(speedWindow);

var numticks = 0;

// TODO reset speed for each bar or recent activity
// TODO how to show sustained momentum?
// - smoothing or averaging (ema)
// TODO get stats on max, avg and distribution of speeds during IB

class DeltaSpeed {
    init() {
        lastTime = null;
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

        // TODO does resetting the max speed messup the ema? 
        //      maybe we don't need the reset since the ema has a period
        //      but I think we'd need to periodize the max speed as well
        //      maybe don't need it tho since we normalize stuff so the outliers would be normalized
        //      maybe we want to keep big bars in the history we know when we're really hitting big acceleration
        //          not just small acceleration that's pretending to be big due to lack of history   !!!!!!!!!!!!!!!!

        // TODO a candle with really high speed will show low speed after compared to the high
        //      maybe create an average of recent max speeds

        // Reset speed and volume each candle
        if (lastIdx != idx){
            lastIdx = idx;
            console.log(`idx:${idx} numticks:${numticks}`);
            numticks = 0;
            // TODO use recent bucket of tick data so you don't have to do a full reset
            // maxSpeed = null; // TODO 1e-10; // change divide by 0 checks
        }

        numticks = numticks + 1;
        const now = new Date()

        const time = now.getTime();
        const elapsed = lastTime ? time - lastTime : null;
        // console.log(`idx:${idx} now:${time} last:${lastTime} elapsed:${elapsed}`);
        lastTime = time;

        const bidVolume = d.bidVolume();
        const askVolume = d.offerVolume();
        const delta = askVolume - bidVolume;

        const elapsedD = lastDelta ? delta - lastDelta : null;
        // console.log(`idx:${idx} now:${time} last:${lastDelta} elapsed:${elapsedD}`);
        lastDelta = delta;

        // TODO accumulate ticks over a period of time since num ticks per minute varies
        // const speed = elapsedD && elapsed ? elapsedD / elapsed : 0;
        const speed = elapsedD && elapsed ? elapsedD : 0;
        // console.log(`${elapsedD} ${elapsed} ${speed}`);

        speeds.push(speed);
        maxSpeed = Math.max(...speeds.slice(-speedWindow).map(Math.abs));
        // maxSpeed = Math.abs(speed) > maxSpeed ? Math.abs(speed) : maxSpeed;
        
        // const fancyNormalizedSpeed = maxSpeed ? this.normalizeDeltaSpeed(speed, maxSpeed) : 0;
        // const dumbNormalizedSpeed = maxSpeed ? speed / maxSpeed : 0;
        // const normalizedSpeed = dumbNormalizedSpeed;
        // console.log(`s ${speed} ${maxSpeed} ${dumbNormalizedSpeed} ${fancyNormalizedSpeed}`);

        // Threshold alert
        // if (normalizedSpeed > 0.8) {
        //     console.log(`Strong momentum detected at ${d.value()}: ${normalizedSpeed} (at ${d.timestamp().toLocaleTimeString()})`);
        // }

        // return ema(normalizedSpeed);
        // return normalizedSpeed;
        // return speed;
        const tickSpeed = ema(speed);
        const averageSpeed = averageSpeeds(tickSpeed);
        const stdDevSpeed = speedStdev(tickSpeed);
        const multiplier = Math.abs(Math.floor((tickSpeed - averageSpeed) / stdDevSpeed));

        // const dynamicThreshold = averageSpeed + (3 * stdDevSpeed);
        // if (tickSpeed > dynamicThreshold){
        if (multiplier >= stdevMultiplier) {
            console.log(`High speed: ${multiplier} at ${d.value()}: ${tickSpeed.toFixed(2)} (at ${d.timestamp().toLocaleTimeString()})`);
        }
        // else if (tickSpeed > averageSpeed + (2 * stdDevSpeed)){
        //     console.log(`High speed detected (2) at ${d.value()}: ${tickSpeed.toFixed(2)} (at ${d.timestamp().toLocaleTimeString()})`);
        // }

        // return multiplier;
        return tickSpeed;
    }

    // // TODO this is making negatives positive
    // normalizeDeltaSpeed(speed, maxSpeed) {
    //     // Apply logarithmic transformation
    //     const logD = Math.log(speed + 1);
    //     const logMaxSpeed = Math.log(maxSpeed + 1);

    //     // Normalize to range [0, 1]
    //     const normalizedValue = logD / logMaxSpeed;

    //     return normalizedValue;
    // }
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
