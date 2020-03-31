const concat = (x, y) =>
    x.concat(y)

const flatMap = (f, xs) =>
    xs.map(f).reduce(concat, [])

Array.prototype.flatMap = function (f) {
    return flatMap(f, this)
}

const firstTrue = promises => {
    const newPromises = promises.map(p => new Promise(
        (resolve, reject) => p.then(v => v && resolve(v), reject)
    ));
    newPromises.push(Promise.all(promises).then(() => false));
    return Promise.race(newPromises);
};

module.exports.firstTrue = firstTrue;