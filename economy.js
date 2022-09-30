"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._get_active_pet = exports._set_active_pet = exports.calculateLoanAmountFromString = exports.payLoan = exports.useLoan = exports.userHasStockSymbol = exports.resetPlayer = exports.giveStock = exports.removeStock = exports.newLottery = exports.buyLotteryTicket = exports.sellStock = exports.calculateAmountFromStringIncludingStocks = exports.calculateStockAmountFromString = exports.buyStock = exports.resetEconomy = exports.setMoney = exports.loseMoneyToPlayer = exports.calculateAmountFromString = exports.loseMoneyToBank = exports.taxPlayer = exports.canTax = exports.canBetAmount = exports.addMoney = exports.canEarn = exports.earnMoney = exports.createPlayer = exports.saveEconomy = exports.loadEconomy = void 0;
const fs = require("fs");
const pet = require("./pets");
let ECONOMY = {};
let lottery = { pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)] };
function userHasStockSymbol(id, symbol) {
    if (!symbol)
        return false;
    let stocks = ECONOMY[id]?.stocks;
    if (!stocks)
        return false;
    let matches = Object.keys(stocks).filter(v => v.toLowerCase().replace(/\(.*/, "") == symbol.toLowerCase());
    if (matches.length > 0) {
        return { name: matches[0], info: stocks[matches[0]] };
    }
    return false;
}
exports.userHasStockSymbol = userHasStockSymbol;
function loadEconomy() {
    if (fs.existsSync("./economy.json")) {
        let data = fs.readFileSync("./economy.json");
        ECONOMY = JSON.parse(data);
        if (ECONOMY['bank']) {
            delete ECONOMY['bank'];
        }
    }
    if (fs.existsSync("./lottery.json")) {
        let data = fs.readFileSync("./lottery.json");
        lottery = JSON.parse(data);
    }
}
exports.loadEconomy = loadEconomy;
function saveEconomy() {
    fs.writeFileSync("./economy.json", JSON.stringify(ECONOMY));
    fs.writeFileSync("./lottery.json", JSON.stringify(lottery));
}
exports.saveEconomy = saveEconomy;
function buyLotteryTicket(id, cost) {
    const LOTTERY_DELAY = 60 * 5; //minutes
    //@ts-ignore
    if (ECONOMY[id].lastLottery && Date.now() / 1000 - ECONOMY[id].lastLottery < LOTTERY_DELAY) {
        return false;
    }
    if (ECONOMY[id]) {
        ECONOMY[id].money -= cost;
        ECONOMY[id].lastLottery = Date.now() / 1000;
        lottery.pool += cost;
        let ticket = [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)];
        return ticket;
    }
    return false;
}
exports.buyLotteryTicket = buyLotteryTicket;
function newLottery() {
    lottery = { pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)] };
}
exports.newLottery = newLottery;
function createPlayer(id, startingCash = 100) {
    ECONOMY[id] = { money: startingCash, lastTalk: 0, lastTaxed: 0, stocks: {} };
}
exports.createPlayer = createPlayer;
function addMoney(id, amount) {
    if (ECONOMY[id]) {
        ECONOMY[id].money += amount;
    }
}
exports.addMoney = addMoney;
function loseMoneyToBank(id, amount) {
    if (ECONOMY[id]) {
        ECONOMY[id].money -= amount;
    }
}
exports.loseMoneyToBank = loseMoneyToBank;
function loseMoneyToPlayer(id, amount, otherId) {
    if (ECONOMY[id]) {
        ECONOMY[id].money -= amount;
    }
    if (ECONOMY[otherId] === undefined) {
        createPlayer(otherId, amount);
    }
    ECONOMY[otherId].money += amount;
}
exports.loseMoneyToPlayer = loseMoneyToPlayer;
function earnMoney(id, percent = 1.001) {
    ECONOMY[id].lastTalk = Date.now();
    ECONOMY[id].money *= percent;
}
exports.earnMoney = earnMoney;
function useLoan(id, amount) {
    ECONOMY[id].loanUsed = amount;
}
exports.useLoan = useLoan;
function payLoan(id, amount) {
    if (!ECONOMY[id].money)
        return;
    ECONOMY[id].money -= amount * 1.01;
    if (ECONOMY[id].loanUsed) {
        //@ts-ignore
        ECONOMY[id].loanUsed -= amount;
    }
    //@ts-ignore
    if (ECONOMY[id].loanUsed && ECONOMY[id].loanUsed <= 0) {
        delete ECONOMY[id].loanUsed;
        return true;
    }
    return false;
}
exports.payLoan = payLoan;
function playerEconomyLooseTotal(id) {
    if (ECONOMY[id] === undefined)
        return 0;
    let money = ECONOMY[id]?.money;
    let stocks = ECONOMY[id].stocks;
    if (stocks) {
        for (let stock in ECONOMY[id].stocks) {
            money += stocks[stock].buyPrice * stocks[stock].shares;
        }
    }
    return money;
}
function taxPlayer(id, max) {
    ECONOMY[id].lastTaxed = Date.now();
    let total = playerEconomyLooseTotal(id);
    let taxPercent = (Math.random() * (1 - .992) + .992);
    if (pet.getActivePet(id) == 'tiger') {
        taxPercent = (Math.random() * (1 - 1.002) + .994);
    }
    let amountTaxed = total - (total * taxPercent);
    if (amountTaxed > max)
        amountTaxed = max;
    ECONOMY[id].money -= amountTaxed;
    return { amount: amountTaxed, percent: 1 - taxPercent };
}
exports.taxPlayer = taxPlayer;
function canEarn(id) {
    if (!ECONOMY[id])
        return false;
    let secondsDiff = (Date.now() - ECONOMY[id].lastTalk) / 1000;
    if (secondsDiff > 60) {
        return true;
    }
    return false;
}
exports.canEarn = canEarn;
function canTax(id, bonusTime) {
    if (!ECONOMY[id])
        return false;
    if (!ECONOMY[id].lastTaxed) {
        ECONOMY[id].lastTaxed = 0;
        return true;
    }
    let total = playerEconomyLooseTotal(id);
    if (total === 0) {
        return false;
    }
    //@ts-ignore
    let secondsDiff = (Date.now() - ECONOMY[id].lastTaxed) / 1000;
    //5 minutes
    if (bonusTime && secondsDiff > 900 + bonusTime) {
        return true;
    }
    else if (!bonusTime && secondsDiff > 900) {
        return true;
    }
    return false;
}
exports.canTax = canTax;
function canBetAmount(id, amount) {
    if (ECONOMY[id] && amount <= ECONOMY[id].money) {
        return true;
    }
    return false;
}
exports.canBetAmount = canBetAmount;
function setMoney(id, amount) {
    if (ECONOMY[id]) {
        ECONOMY[id].money = amount;
    }
    else {
        createPlayer(id);
        ECONOMY[id].money = amount;
    }
}
exports.setMoney = setMoney;
function calculateAmountFromStringIncludingStocks(id, amount, extras) {
    if (amount == undefined || amount == null) {
        return NaN;
    }
    if (ECONOMY[id] === undefined) {
        return NaN;
    }
    amount = amount.toLowerCase();
    if (amount == "all") {
        return ECONOMY[id].money * .99;
    }
    if (amount == "all!") {
        return ECONOMY[id].money;
    }
    for (let e in extras) {
        if (amount.match(e)) {
            return extras[e](ECONOMY[id].money, amount);
        }
    }
    if (Number(amount)) {
        return Number(amount);
    }
    else if (amount[0] === "$" && Number(amount.slice(1))) {
        return Number(amount.slice(1));
    }
    else if (amount[amount.length - 1] === "%") {
        let total = 0;
        let stocks = ECONOMY[id].stocks;
        if (stocks) {
            for (let stock in ECONOMY[id].stocks) {
                total += stocks[stock].buyPrice * stocks[stock].shares;
            }
        }
        let percent = Number(amount.slice(0, -1));
        let money = ECONOMY[id].money;
        if (!percent) {
            return 0;
        }
        return (total + money) * percent / 100;
    }
    return 0;
}
exports.calculateAmountFromStringIncludingStocks = calculateAmountFromStringIncludingStocks;
function calculateStockAmountFromString(id, shareCount, amount, extras) {
    if (amount == undefined || amount == null) {
        return NaN;
    }
    if (ECONOMY[id] === undefined) {
        return NaN;
    }
    amount = amount.toLowerCase();
    if (amount == "all") {
        return shareCount;
    }
    if (Number(amount)) {
        return Number(amount);
    }
    else if (amount[0] === "$" && Number(amount.slice(1))) {
        return Number(amount.slice(1));
    }
    else if (amount[amount.length - 1] === "%") {
        let percent = Number(amount.slice(0, -1));
        if (!percent) {
            return 0;
        }
        return shareCount * percent / 100;
    }
    return 0;
}
exports.calculateStockAmountFromString = calculateStockAmountFromString;
function calculateLoanAmountFromString(id, amount) {
    let loanDebt = ECONOMY[id]?.loanUsed;
    if (!loanDebt)
        return NaN;
    amount = amount.toLowerCase();
    if (amount == "all") {
        return loanDebt;
    }
    if (Number(amount)) {
        return Number(amount);
    }
    else if (amount[0] === "$" && Number(amount.slice(1))) {
        return Number(amount.slice(1));
    }
    else if (amount[amount.length - 1] === "%") {
        let percent = Number(amount.slice(0, -1));
        if (!percent) {
            return 0;
        }
        return loanDebt * percent / 100;
    }
    return 0;
}
exports.calculateLoanAmountFromString = calculateLoanAmountFromString;
function calculateAmountFromString(id, amount, extras) {
    if (amount == undefined || amount == null) {
        return NaN;
    }
    if (ECONOMY[id] === undefined) {
        return NaN;
    }
    amount = amount.toLowerCase();
    if (amount == "all") {
        return ECONOMY[id].money * .99;
    }
    if (amount == "all!") {
        return ECONOMY[id].money;
    }
    for (let e in extras) {
        if (amount.match(e)) {
            return extras[e](ECONOMY[id].money, amount, ECONOMY[id]);
        }
    }
    if (Number(amount)) {
        return Number(amount);
    }
    else if (amount[0] === "$" && Number(amount.slice(1))) {
        return Number(amount.slice(1));
    }
    else if (amount[amount.length - 1] === "%") {
        let percent = Number(amount.slice(0, -1));
        if (!percent) {
            return 0;
        }
        let money = ECONOMY[id].money;
        return money * percent / 100;
    }
    return 0;
}
exports.calculateAmountFromString = calculateAmountFromString;
function resetEconomy() {
    ECONOMY = {};
    saveEconomy();
    loadEconomy();
}
exports.resetEconomy = resetEconomy;
function resetPlayer(id) {
    if (ECONOMY[id]) {
        delete ECONOMY[id];
    }
}
exports.resetPlayer = resetPlayer;
function sellStock(id, stock, shares, sellPrice) {
    if (ECONOMY[id].stocks?.[stock]) {
        //@ts-ignore
        ECONOMY[id].money += sellPrice * shares;
        //@ts-ignore
        ECONOMY[id].stocks[stock].shares -= shares;
        //@ts-ignore
        if (ECONOMY[id].stocks[stock].shares <= 0) {
            //@ts-ignore
            delete ECONOMY[id].stocks[stock];
        }
    }
}
exports.sellStock = sellStock;
function removeStock(id, stock) {
    if (ECONOMY[id].stocks?.[stock]) {
        delete ECONOMY[id].stocks[stock];
    }
}
exports.removeStock = removeStock;
function giveStock(id, stock, buyPrice, shares) {
    if (ECONOMY[id].stocks) {
        ECONOMY[id].stocks[stock] = { buyPrice: buyPrice, shares: shares };
    }
    else {
        ECONOMY[id].stocks = {};
        ECONOMY[id].stocks[stock] = { buyPrice: buyPrice, shares: shares };
    }
}
exports.giveStock = giveStock;
function buyStock(id, stock, shares, cost) {
    if (!ECONOMY[id]) {
        return;
    }
    if (!ECONOMY[id].stocks) {
        ECONOMY[id].stocks = {};
    }
    //@ts-ignore
    if (!ECONOMY[id].stocks[stock]) {
        //@ts-ignore
        ECONOMY[id].stocks[stock] = { buyPrice: cost, shares: shares };
    }
    else {
        //@ts-ignore
        let oldShareCount = ECONOMY[id].stocks[stock].shares;
        //@ts-ignore
        let oldBuyPriceWeight = ECONOMY[id].stocks[stock].buyPrice * (oldShareCount / (oldShareCount + shares));
        let newBuyPriceWeight = cost * (shares / (oldShareCount + shares));
        //@ts-ignore
        ECONOMY[id].stocks[stock].shares += shares;
        //@ts-ignore
        ECONOMY[id].stocks[stock].buyPrice = oldBuyPriceWeight + newBuyPriceWeight;
    }
    loseMoneyToBank(id, cost * shares);
}
exports.buyStock = buyStock;
function _set_active_pet(id, pet) {
    ECONOMY[id].activePet = pet;
}
exports._set_active_pet = _set_active_pet;
function _get_active_pet(id) {
    return ECONOMY[id].activePet;
}
exports._get_active_pet = _get_active_pet;
loadEconomy();
module.exports = {
    ECONOMY: () => ECONOMY,
    LOTTERY: () => lottery,
    loadEconomy,
    saveEconomy,
    createPlayer,
    earnMoney,
    canEarn,
    addMoney,
    canBetAmount,
    canTax,
    taxPlayer,
    loseMoneyToBank,
    calculateAmountFromString,
    loseMoneyToPlayer,
    setMoney,
    resetEconomy,
    buyStock,
    calculateStockAmountFromString,
    calculateAmountFromStringIncludingStocks,
    sellStock,
    buyLotteryTicket,
    newLottery,
    removeStock,
    giveStock,
    resetPlayer,
    userHasStockSymbol,
    useLoan,
    payLoan,
    calculateLoanAmountFromString,
    _set_active_pet,
    _get_active_pet
};
