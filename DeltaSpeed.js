const predef = require("./tools/predef");
const p = require("./tools/plotting");

class DeltaSpeed {
    init() {
        this.deltaStart = null;
        this.lastUpdateTime = null;
        this.deltaSpeed = 0;
        this.maxSpeed = 1; // Initialize max speed to prevent division by zero
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
            return 0;
        }

        const elapsedTime = currentTime - this.lastUpdateTime;

        if (elapsedTime >= periodInMillis) {
            const deltaChange = currentDelta - this.deltaStart;
            this.deltaSpeed = deltaChange / (elapsedTime / 1000);


            // Update maxSpeed if the current speed is higher
            if (Math.abs(this.deltaSpeed) > this.maxSpeed) {
                this.maxSpeed = Math.abs(this.deltaSpeed);
            }

            // Normalize the deltaSpeed
            const normalizedSpeed = this.deltaSpeed / this.maxSpeed;

            this.deltaStart = currentDelta;
            this.lastUpdateTime = currentTime;

            return normalizedSpeed; // Return normalized speed
        }

        return null; // Don't plot anything until the next interval
    }
}

// function dnaLikePlotter(canvas, calculatorInstance, history) {
//     for(let i=0; i<history.data.length; ++i) {
//         const item = history.get(i);
//         const x = p.x.get(item);
//         canvas.drawLine(p.offset(x, item), {});
//     }
// }

// TODO can we make the avg speed of the periods that comprise the candle the value for the final plot?
// TODO how to debug this? Why it goes from 1 to 0.. feels like the initial max delta might not be accurate

module.exports = {
    name: "DeltaSpeed",
    description: /*i18n*/ "Delta Speed",
    calculator: DeltaSpeed,
    // plotter: predef.plotters.custom(dnaLikePlotter),
    params: {
        period: predef.paramSpecs.period(1)
    },
    tags: [predef.tags.Volatility],
    schemeStyles: predef.styles.solidLine("#8cecff")
};
