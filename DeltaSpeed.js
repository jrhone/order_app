const predef = require("./tools/predef");

var lastTime = null;
var lastDelta = null;
var maxSpeed = null;
var lastIdx = null;

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
    }

    map(d, idx) {
        if (!d.isLast()){
            return 0;
        }

        // reset speed each candle
        if (lastIdx != idx){
            lastIdx = idx;
            maxSpeed = null; // TODO 1e-10; // change divide by 0 checks
        }

        const now = new Date()

        const time = now.getTime();
        const elapsed = lastTime ? time - lastTime : null;
        // console.log(`idx:${idx} now:${time} last:${lastTime} elapsed:${elapsed}`);
        lastTime = time;

        const delta = d.value(this.props.deltaSource);
        const elapsedD = lastDelta ? delta - lastDelta : null;
        // console.log(`idx:${idx} now:${time} last:${lastDelta} elapsed:${elapsedD}`);
        lastDelta = delta;

        const speed = elapsedD && elapsed ? elapsedD / elapsed : 0;
        // console.log(`${elapsedD} ${elapsed} ${speed}`);

        maxSpeed = Math.abs(speed) > maxSpeed ? Math.abs(speed) : maxSpeed;
        const fancyNormalizedSpeed = maxSpeed ? this.normalizeDeltaSpeed(speed, maxSpeed) : 0;
        const normalizedSpeed = maxSpeed ? speed / maxSpeed : 0;
        // console.log(`s ${speed} ${maxSpeed} ${normalizedSpeed} ${fancyNormalizedSpeed}`);

        // Threshold alert
        if (fancyNormalizedSpeed > 0.8) {
            console.log(`Strong momentum detected: ${fancyNormalizedSpeed} (at ${d.timestamp().toLocaleTimeString()})`);
        }

        return fancyNormalizedSpeed;
    }

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
    description: /*i18n*/ "Issue Repro",
    calculator: issue,
    params: {
        period: predef.paramSpecs.period(14)
    },
    schemeStyles: predef.styles.solidLine("#8cecff")
};
