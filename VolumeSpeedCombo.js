const predef = require("./tools/predef");
const EMA = require("./tools/EMA");
const SMA = require("./tools/SMA");
const STDEV = require("./tools/StdDev");
const meta = require("./tools/meta");
const {px, du, op} = require('./tools/graphics');

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
var deltaWindowEma = EMA(deltaWindow);

var volumeWindow = ticksPerSecond * 60;
var volumes = [];
var lastBarVolume = null;
var volumeWindowSma = SMA(volumeWindow);
var volumeWindowStd = STDEV(volumeWindow);

var speeds = [];
var averageSpeeds = SMA(speedWindow);
var speedStdev = STDEV(speedWindow);

var numticks = 0;
var tpsHistory = SMA(5);

var memory = null;
var bars = 0;

var drawings = [];
var numAlerts = 0;
var numLiveBars = 0;

// TODO get stats on max, avg and distribution of speeds during IB
// TODO a candle with really high speed will show low speed intracandle after
// TODO does the delta and volume data actually belong to the previous tick? by the time I get it the orders are executed and price adjusted
//      doesn't mean it's the price where the orders came in
class VolumeSpeedCombo {
    init() {
        lastDelta = null;
        maxSpeed = 1e-10;
        lastIdx = null;
        deltaWindowEma = EMA(deltaWindow);

        speeds = [];
        averageSpeeds = SMA(speedWindow);
        speedStdev = STDEV(speedWindow);

        volumes = [];
        lastBarVolume = null;
        volumeWindowSma = SMA(volumeWindow);
        volumeWindowStd = STDEV(volumeWindow);

        memory = null;
        tpsHistory = SMA(5);
        numticks = 0;
        bars = 0;

        drawings = [];
        numAlerts = 0;
        numLiveBars = 0;
    }

    map(d, idx) {
        if (!d.isLast()){
            return 0;
        }
        else if (lastIdx != idx){
            numLiveBars = numLiveBars + 1;
            console.log(`stdevMultiplier status: ${stdevMultiplier}: ${numAlerts} / ${numLiveBars} = ${numAlerts / numLiveBars}`)
        }

        // Reset stuff each candle
        if (lastIdx != idx){
            lastIdx = idx;
            lastBarVolume = null;
            bars = bars + 1;
            drawings = [];

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
        
        const tickSpeed = deltaWindowEma(speed);
        const averageSpeed = averageSpeeds(tickSpeed);
        const stdDevSpeed = speedStdev(tickSpeed);
        const rawSpeedMultiplier =  (tickSpeed - averageSpeed) / stdDevSpeed;
        const speedMultiplier = Math.round(Math.abs(rawSpeedMultiplier));

        if (speedMultiplier >= stdevMultiplier) {
            console.log(`High speed: ${speedMultiplier} at ${d.value()}: ${tickSpeed.toFixed(2)} (at ${d.timestamp().toLocaleTimeString()})`);
        }

        //

        // Volume Spike
        const barVolume = d.volume();
        const tickVolume = lastBarVolume ? barVolume - lastBarVolume : 0;
        volumes.push(tickVolume);
        lastBarVolume = barVolume;

        const averageVolume = volumeWindowSma(tickVolume);
        const stdDevVolume = volumeWindowStd(tickVolume);
        const volumeMultiplier = Math.round(Math.abs((tickVolume - averageVolume) / stdDevVolume));

        if (volumeMultiplier >= stdevMultiplier) {
            console.log(`Volume spike: ${volumeMultiplier} at ${d.value()}: ${tickVolume} (at ${d.timestamp().toLocaleTimeString()})`);
        }

        if (volumeMultiplier >= stdevMultiplier && Math.abs(rawSpeedMultiplier) >= stdevMultiplier){
            console.log("double spike!");
            drawings.push({idx: d.index(), price: d.value(), speedMult: rawSpeedMultiplier, volMult: volumeMultiplier});
            numAlerts = numAlerts + 1;
        }

        if (numAlerts / numLiveBars < 1) {
            stdevMultiplier = stdevMultiplier - 1;
            console.log(`lower stdevMultiplier to ${stdevMultiplier}: ${numAlerts} / ${numLiveBars} = ${numAlerts / numLiveBars}`)
        }
        else if (numAlerts / numLiveBars > 5) {
            stdevMultiplier = stdevMultiplier + 1;
            console.log(`raise stdevMultiplier to ${stdevMultiplier}: ${numAlerts} / ${numLiveBars} = ${numAlerts / numLiveBars}`)
        }

        return {
            graphics: {        
                items: drawings.map(item => [
                    {   
                        tag: 'LineSegments',
                        key: `${item.price}-lines`,
                        lines: [
                            {
                                tag: 'Line',
                                a: {
                                    x: du(item.idx - .5),
                                    y: du(item.price),
                                }, 
                                b: {
                                    x: du(item.idx + .5),
                                    y: du(item.price)
                                },
                                infiniteStart: false, 
                                infiniteEnd: false          
                            }
                        ],
                        lineStyle: {
                            lineWidth: 1,
                            color: item.speedMult < 0 ? '#f00' : '#00FF00',
                        }
                    },
                    {
                        tag: "Text",
                        key: `${item.price}-ex`,
                        point: {
                            x: op(du(item.idx + .5), '-', px(14)),
                            y: op(du(item.price), '-', px(4)),
                        },
                        text: `s:${Math.round(item.speedMult)} v:${Math.round(item.volMult)}`,
                        style: { fontSize: 10, fontWeight: "normal", fill: item.speedMult < 0 ? '#f00' : '#00FF00' },
                        textAlignment: "centerMiddle"
                    },
                ]).flat()
            }
        }
    }
}

module.exports = {
    name: "volumeSpeedCombo",
    description: /*i18n*/ "Volume Speed Combo",
    calculator: VolumeSpeedCombo,
    schemeStyles: predef.styles.solidLine("#8cecff")
};
