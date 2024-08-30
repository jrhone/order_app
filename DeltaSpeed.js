const predef = require("./tools/predef");
const p = require("./tools/plotting");

class DeltaSpeed {
    init() {
        this.deltaStart = null;
        this.lastUpdateTime = null;
        this.deltaSpeed = 0;
        this.lastSpeedCalculationTime = null; // Track when the last delta speed was calculated
        this.initialDraw = false; // Flag to handle the initial zero data point
    }

    map(d) {
        const currentTime = Date.now();
        const currentDelta = d.value(this.props.deltaSource);
        const periodInMillis = this.props.period * 100; // Aggregate over 1 second intervals

        if (this.deltaStart === null) {
            this.deltaStart = currentDelta;
            this.lastUpdateTime = currentTime;
            this.lastSpeedCalculationTime = currentTime;
        }

        const elapsedTime = currentTime - this.lastUpdateTime;

        if (elapsedTime >= periodInMillis) {
            const deltaChange = currentDelta - this.deltaStart;
            this.deltaSpeed = deltaChange / (elapsedTime / 1000);

            // Reset for the next period
            this.deltaStart = currentDelta;
            this.lastUpdateTime = currentTime;
        }

        // // Plot the initial zero data point as the "previous" bar
        if (!this.initialDraw) {
            this.initialDraw = true;
            return 0;
        }

        // Only return deltaSpeed at 1-second intervals
        if (currentTime - this.lastSpeedCalculationTime >= periodInMillis) {
            this.lastSpeedCalculationTime = currentTime;
            return this.deltaSpeed;
        }

        return null; // Don't plot anything until the next interval
        // return this.sma(d.value());
    }
}

function dnaLikePlotter(canvas, calculatorInstance, history) {
    for(let i=0; i<history.data.length; ++i) {
        const item = history.get(i);
        const x = p.x.get(item);
        canvas.drawLine(p.offset(x, item), {});
    }
}

module.exports = {
    name: "DeltaSpeed",
    description: /*i18n*/ "Delta Speed",
    calculator: DeltaSpeed,
    plotter: predef.plotters.custom(dnaLikePlotter),
    params: {
        period: predef.paramSpecs.period(1)
    },
    tags: [predef.tags.Volatility],
    schemeStyles: predef.styles.solidLine("#8cecff")
};
