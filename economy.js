"use strict";
const fs = require("fs");
let ECONOMY = {};
function loadEconomy() {
    if (fs.existsSync("./economy.json")) {
        let data = fs.readFileSync("./economy.json");
        ECONOMY = JSON.parse(data);
    }
}
function saveEconomy() {
    fs.writeFileSync("./economy.json", JSON.stringify(ECONOMY));
}
function createPlayer(id) {
    ECONOMY[id] = { money: 0, lastTalk: 0 };
}
function addMoney(id, amount) {
    if (ECONOMY[id]) {
        ECONOMY[id].money += amount;
    }
}
function earnMoney(id) {
    ECONOMY[id].lastTalk = Date.now();
    if (ECONOMY[id].money == 0) {
        ECONOMY[id].money = 100;
    }
    else {
        ECONOMY[id].money *= 1.001;
    }
}
function canEarn(id) {
    if (!ECONOMY[id])
        return false;
    let secondsDiff = (Date.now() - ECONOMY[id].lastTalk) / 1000;
    if (secondsDiff > 60) {
        return true;
    }
    return false;
}
function canBetAmount(id, amount) {
    if (ECONOMY[id] && amount <= ECONOMY[id].money) {
        return true;
    }
    return false;
}
loadEconomy();
module.exports = {
    ECONOMY: ECONOMY,
    loadEconomy: loadEconomy,
    saveEconomy: saveEconomy,
    createPlayer: createPlayer,
    earnMoney: earnMoney,
    canEarn: canEarn,
    addMoney: addMoney,
    canBetAmount: canBetAmount
};
