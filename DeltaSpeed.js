const predef = require("./tools/predef");

var lastTime = null;
var lastDelta = null;
var maxSpeed = null;

class issue {
    init() {
        lastTime = null;
        lastDelta = null;
        maxSpeed = null;
    }

    map(d, idx) {
        if (!d.isLast()){
            return 0;
        }

        const now = new Date().getTime();
        const elapsed = lastTime ? now - lastTime : null;
        // console.log(`idx:${idx} now:${now} last:${lastTime} elapsed:${elapsed}`);
        lastTime = now;

        const delta = d.value(this.props.deltaSource);
        const elapsedD = lastDelta ? delta - lastDelta : null;
        // console.log(`idx:${idx} now:${now} last:${lastDelta} elapsed:${elapsedD}`);
        lastDelta = delta;

        const speed = elapsedD && elapsed ? elapsedD / elapsed : 0;
        // console.log(`${elapsedD} ${elapsed} ${speed}`);

        maxSpeed = Math.abs(speed) > maxSpeed ? Math.abs(speed) : maxSpeed;
        const normalizedSpeed = maxSpeed ? speed / maxSpeed : 0;
        console.log(`${speed} ${maxSpeed} ${normalizedSpeed}`);

        return normalizedSpeed;
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
