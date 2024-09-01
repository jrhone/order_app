const predef = require("./tools/predef");
const EMA = require("./tools/EMA");
const SMA = require("./tools/SMA");
const STDEV = require("./tools/StdDev");

var lastTime = null;
var lastDelta = null;
var maxSpeed = null;
var lastIdx = null;
var ema = EMA(3);

var volumes = [];
var lastBarVolume = null;
var sma = SMA(1000);
var std = STDEV(1000);

// TODO reset speed for each bar or recent activity
// TODO how to show sustained momentum?
// - smoothing or averaging (ema)
// TODO get stats on max, avg and distribution of speeds during IB

class issue {
    init() {
        lastTime = null;
        lastDelta = null;
        maxSpeed = null;
        lastIdx = null;
        ema = EMA(3);

        volumes = [];
        lastBarVolume = null;
        sma = SMA(1000);
        std = STDEV(1000);
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
            // TODO use recent bucket of tick data so you don't have to do a full reset
            maxSpeed = null; // TODO 1e-10; // change divide by 0 checks
            lastBarVolume = null;
        }

        const now = new Date()

        const time = now.getTime();
        const elapsed = lastTime ? time - lastTime : null;
        // console.log(`idx:${idx} now:${time} last:${lastTime} elapsed:${elapsed}`);
        lastTime = time;

        // TODO this is returning current price in the simulator
        // const delta = d.value(this.props.deltaSource);
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

        maxSpeed = Math.abs(speed) > maxSpeed ? Math.abs(speed) : maxSpeed;
        const fancyNormalizedSpeed = maxSpeed ? this.normalizeDeltaSpeed(speed, maxSpeed) : 0;
        const dumbNormalizedSpeed = maxSpeed ? speed / maxSpeed : 0;
        const normalizedSpeed = dumbNormalizedSpeed;
        // console.log(`s ${speed} ${maxSpeed} ${dumbNormalizedSpeed} ${fancyNormalizedSpeed}`);

        // Threshold alert
        if (normalizedSpeed > 0.8) {
            console.log(`Strong momentum detected: ${normalizedSpeed} (at ${d.timestamp().toLocaleTimeString()})`);
        }

        // Volume Spike
        const barVolume = d.volume();
        // const tickVolume = barVolume - (lastBarVolume ? lastBarVolume : 0);
        const tickVolume = lastBarVolume ? barVolume - lastBarVolume : 0;
        volumes.push(tickVolume);
        // console.log(`vol ${idx} ${barVolume} ${lastBarVolume} ${tickVolume}`);
        lastBarVolume = barVolume;

        const averageVolume = sma(tickVolume);
        const stdDevVolume = std(tickVolume);
        // const dynamicThreshold = averageVolume * 2;
        const dynamicThreshold = averageVolume + (3 * stdDevVolume);
        // console.log(`other ${idx} ${tickVolume} ${averageVolume} ${stdDevVolume}`);

        const isVolumeSpike = tickVolume > dynamicThreshold;
        if (isVolumeSpike) {
            console.log(`Volume spike detected: ${tickVolume} > ${dynamicThreshold} (at ${d.timestamp().toLocaleTimeString()})`);
        }
        return isVolumeSpike ? 1 : 0;

        // return ema(normalizedSpeed);
        // return normalizedSpeed;
        // return speed;
        // return ema(speed);
    }

    // TODO this is making negatives positive
    normalizeDeltaSpeed(speed, maxSpeed) {
        // Apply logarithmic transformation
        const logD = Math.log(speed + 1);
        const logMaxSpeed = Math.log(maxSpeed + 1);

        // Normalize to range [0, 1]
        const normalizedValue = logD / logMaxSpeed;

        return normalizedValue;
    }
}

module.exports = {
    name: "issue",
    description: /*i18n*/ "Acceleration",
    calculator: issue,
    params: {
        period: predef.paramSpecs.period(14)
    },
    schemeStyles: predef.styles.solidLine("#8cecff")
};
