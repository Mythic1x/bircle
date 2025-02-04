import { max, min } from "lodash"
import { emitsEvent, enumerate, isBetween, isNumeric, listComprehension, choice } from "./util"
import units, { LengthUnit } from "./units"

function randInt(min: number, max: number) {
    return Math.random() * (max - min) + min
}


class FunctionError extends Error {
    constructor(msg: string) {
        super(msg)
        this.name = "FunctionError"
    }
}

class OperatorError extends Error {
    constructor(msg: string) {
        super(msg)
        this.name = 'OperatorError'
    }
}

enum TT {
    "hash",
    "string",
    "comma",
    "number",
    "lparen",
    "rparen",
    "percent",
    "plus",
    "minus",
    "mul",
    "div",
    'pow',
    root,
    semi,
    ident,
    keyword,
    eq,
    "number_suffix",
    "special_literal",
    "pipe",
    "lt",
    "le",
    gt,
    ge,
}

const KEYWORDS = ['var', 'end', 'if', 'then', 'else', 'elif'] as const


type TokenDataType = {
    [TT.hash]: "#",
    [TT.string]: string,
    [TT.comma]: ",",
    [TT.number]: number,
    [TT.lparen]: "(",
    [TT.rparen]: ")",
    [TT.percent]: "%",
    [TT.number_suffix]: 'K' | 'M' | 'B' | 'T'
    [TT.plus]: "+",
    [TT.minus]: "-",
    [TT.mul]: "*",
    [TT.div]: "/",
    [TT.pow]: "^",
    [TT.root]: "^/",
    [TT.special_literal]: string,
    [TT.semi]: ';',
    [TT.ident]: string,
    [TT.eq]: '=',
    [TT.keyword]: typeof KEYWORDS[number],
    [TT.pipe]: "|",
    [TT.le]: "<=",
    [TT.lt]: "<",
    [TT.gt]: ">",
    [TT.ge]: ">="
}

class Token<TokenType extends TT> {
    type: TokenType
    data: TokenDataType[TokenType]
    constructor(type: TokenType, data: TokenDataType[TokenType]) {
        this.data = data
        this.type = type
    }
}

class Lexer {
    tokens: Token<TT>[] = []
    data: string

    specialLiterals: string[]

    #curChar: string[number] | undefined
    #i: number = -1

    #whitespace = "\n\t "
    #specialChars = `#,()+-*/÷${this.#whitespace};="'`


    constructor(data: string, specialLiterals?: string[]) {
        this.data = data
        this.specialLiterals = specialLiterals ?? []
    }

    advance() {
        if ((this.#curChar = this.data[++this.#i]) === undefined) {
            return false;
        }
        return this.#curChar
    }

    back() {
        if ((this.#curChar = this.data[--this.#i]) === undefined) {
            return false;
        }
        return this.#curChar;
    }

    get atEnd() {
        return this.#curChar === undefined
    }

    parseNumber() {
        let n = this.#curChar as string
        let hasDot = n === '.'
        while (this.advance() !== false && (isNumeric(this.#curChar as string) || (this.#curChar === '.' && !hasDot))) {
            if (this.#curChar === '.') hasDot = true
            n += this.#curChar as string
        }
        let number = Number(n)
        if ('kmbt'.includes(this.#curChar as string)) {
            switch (this.#curChar) {
                case 'k': number *= 1000; break;
                case 'm': number *= 1_000_000; break;
                case 'b': number *= 1_000_000_000; break;
                case 't': number *= 1_000_000_000_000; break;
            }
        }
        //only go back if we have not reached the end and is not a special case suffix
        else if (!this.atEnd) {
            this.back()
        }
        return number
    }

    parseLiteral() {
        let s = this.#curChar as string
        while (this.advance() !== false && !this.#specialChars.includes(this.#curChar as string)) {
            s += this.#curChar as string
        }
        //only go back if we have not reached the end
        if (!this.atEnd) this.back()
        return s
    }

    parseString() {
        let quoteType = this.#curChar
        let s = ""
        let escaped = false
        while (this.advance() !== false && (this.#curChar !== quoteType && !escaped)) {
            if (this.#curChar === '\\') {
                escaped = true;
                continue;
            }
            escaped = false;
            s += this.#curChar;
        }
        return s;
    }

    buildMul() {
        this.advance()
        if (this.#curChar === '*') {
            return new Token(TT.pow, '^')
        }
        this.back()
        return new Token(TT.mul, '*')
    }

    buildInequality() {
        let start = this.#curChar
        if (this.advance() && this.#curChar === '=') {
            return start + '='
        }
        this.back()
        return start
    }

    tokenize() {
        //this.advance() could return empty string which is still technically valid
        while (this.advance() !== false) {
            if (this.#whitespace.includes(this.#curChar as string)) continue;
            if (isNumeric(this.#curChar as string) || this.#curChar === '.') {
                this.tokens.push(new Token(TT.number, this.parseNumber()))
                continue;
            }
            switch (this.#curChar) {
                case ';': {
                    this.tokens.push(new Token(TT.semi, ';'))
                    break;
                }
                case "#": {
                    this.tokens.push(new Token(TT.hash, "#"))
                    break;
                }
                case "(": {
                    this.tokens.push(new Token(TT.lparen, "("))
                    break;
                }
                case ")": {
                    this.tokens.push(new Token(TT.rparen, ")"))
                    break;
                }
                case '|': {
                    this.tokens.push(new Token(TT.pipe, '|'))
                    break;
                }
                case ",": {
                    this.tokens.push(new Token(TT.comma, ","))
                    break;
                }
                case "%": {
                    this.tokens.push(new Token(TT.percent, "%"))
                    break;
                }
                case "$": {
                    this.advance()
                    this.tokens.push(new Token(TT.number, this.parseNumber()))
                    break;
                }
                case "+": {
                    this.tokens.push(new Token(TT.plus, "+"))
                    break
                }
                case "-": {
                    this.tokens.push(new Token(TT.minus, "-"))
                    break
                }
                case "/": {
                    if (this.tokens[this.tokens.length - 1].type === TT.pow) {
                        this.tokens.pop()
                        this.tokens.push(new Token(TT.root, '^/'))
                        break;
                    }
                    //unintentional no break here so it moves to next div case
                }
                case "÷": {
                    this.tokens.push(new Token(TT.div, "/"))
                    break
                }
                case "^": {
                    this.tokens.push(new Token(TT.pow, "^"))
                    break;
                }
                case "*": {
                    this.tokens.push(this.buildMul())
                    break;
                }
                case "'":
                case '"': {
                    this.tokens.push(new Token(TT.string, this.parseString()))
                    break;
                }
                case '=': {
                    this.tokens.push(new Token(TT.eq, '='))
                    break;
                }
                case '>': {
                    let data = this.buildInequality()
                    this.tokens.push(
                        data === ">" ? new Token(TT.gt, ">") : new Token(TT.ge, ">=")
                    )
                    break;
                }
                case '<': {
                    let data = this.buildInequality()
                    this.tokens.push(
                        data === "<" ? new Token(TT.lt, "<") : new Token(TT.le, "<=")
                    )
                    break;
                }
                case 'M': case 'B': case 'K': case 'T': {
                    this.tokens.push(new Token(TT.number_suffix, this.#curChar))
                    break;
                }
                default: {
                    let str = this.parseLiteral()
                    if (KEYWORDS.includes(str as typeof KEYWORDS[number])) {
                        this.tokens.push(new Token(TT.keyword, str as typeof KEYWORDS[number]))
                    }
                    else this.tokens.push(new Token(TT.ident, str))
                }
            }
        }
    }
}

class SymbolTable extends Map {
    constructor(base?: Record<string, ((total: number, k: string) => number) | number | string>) {
        super()
        for (let key in base) {
            this.set(key, base[key])
        }
    }

    get(key: any) {
        let val = super.get(key)
        if (typeof val === 'string') {
            return new StringType(val)
        }
        else if (typeof val === 'number') {
            return new NumberType(val)
        }
        return val
    }
}

abstract class Node {
    abstract visit(relativeTo: number, table: SymbolTable): Type<any>
    abstract repr(indent: number): string
}

abstract class Program {
    abstract visit(relativeTo: number, table: SymbolTable): number[]
    abstract repr(indent: number): string
}

type ValidJSTypes = string | number | UserFunction

abstract class Type<JSType>{
    protected data: JSType
    constructor(internalData: JSType) {
        this.data = internalData
    }
    abstract access(): JSType
    abstract add(other: Type<any>): Type<JSType>
    abstract iadd(other: Type<any>): Type<JSType>
    abstract mul(other: Type<any>): Type<JSType>
    abstract imul(other: Type<any>): Type<JSType>
    abstract sub(other: Type<any>): Type<JSType>
    abstract isub(other: Type<any>): Type<JSType>
    abstract div(other: Type<any>): Type<JSType>
    abstract idiv(other: Type<any>): Type<JSType>

    abstract truthy(): boolean

    abstract string(): Type<string>
    abstract number(): Type<number>
}

class NumberType extends Type<number>{
    access(): number {
        return this.data
    }

    truthy(): boolean {
        return this.data !== 0
    }

    add(other: Type<any>): NumberType {
        return new NumberType(this.data + other.access())
    }

    iadd(other: Type<any>): NumberType {
        this.data += other.access()
        return this
    }

    mul(other: Type<number>): Type<number> {
        return new NumberType(this.data * other.access())
    }

    imul(other: Type<number>): Type<number> {
        this.data *= other.access()
        return this
    }

    sub(other: Type<any>): Type<number> {
        return new NumberType(this.data - other.access())
    }

    isub(other: Type<any>): Type<number> {
        this.data -= other.access()
        return this
    }

    div(other: Type<any>): Type<number> {
        return new NumberType(this.data / other.access())
    }

    idiv(other: Type<any>): Type<number> {
        this.data /= other.access()
        return this
    }

    string(): Type<string> {
        return new StringType(this.data.toString())
    }

    number(): Type<number> {
        return this
    }

}

class StringType extends Type<string>{
    access(): string {
        return this.data
    }
    truthy(): boolean {
        return this.data !== ""
    }
    add(other: Type<string>): Type<string> {
        return new StringType(this.data + String(other.access()))
    }
    iadd(other: Type<string>): Type<string> {
        this.data += other.access()
        return this
    }
    mul(other: Type<number>): Type<string> {
        return new StringType(this.data.repeat(other.access()))
    }
    imul(other: Type<any>): Type<string> {
        this.data = this.data.repeat(other.access())
        return this
    }

    sub(other: Type<any>): Type<string> {
        throw new TypeError("Cannot subtract strings")
    }

    isub(other: Type<any>): Type<string> {
        throw new TypeError("Cannot subtract strings")
    }

    div(other: Type<any>): Type<string> {
        throw new TypeError("Cannot divide strings")
    }

    idiv(other: Type<any>): Type<string> {
        throw new TypeError("Cannot divide strings")
    }

    string(): Type<string> {
        return this
    }

    number(): Type<number> {
        return new NumberType(NaN)
    }

}

class FunctionType extends Type<UserFunction> {
    access(): UserFunction {
        return this.data
    }

    truthy(): boolean {
        return true
    }

    mul(other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use * with function")
    }
    imul(other: Type<any>): Type<UserFunction> {
        return this.mul(other)
    }

    div(other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use / with function")
    }
    idiv(other: Type<any>): Type<UserFunction> {
        return this.div(other)
    }

    sub(other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use - with function")
    }
    isub(other: Type<any>): Type<UserFunction> {
        return this.sub(other)
    }

    add(other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use + with function")
    }
    iadd(other: Type<any>): Type<UserFunction> {
        return this.add(other)
    }

    string(): Type<string> {
        return new StringType(`${this.data.name}(${this.data.argIdents.join(", ")}) = ${this.data.toString()}`)
    }

    number(): Type<number> {
        return new NumberType(0)
    }

    run(relativeTo: number, args: Type<any>[]) {
        return this.data.run(relativeTo, args)
    }
}

class UserFunction {
    codeToks: Token<TT>[]
    argIdents: string[]
    name: string
    code: ProgramNode | undefined
    constructor(name: string, codeToks: Token<any>[], argIdents: string[]) {
        this.codeToks = codeToks
        this.argIdents = argIdents
        this.name = name
    }
    run(relativeTo: number, args: Type<any>[]) {
        let argRecord: { [key: string]: any } = {}
        if (args.length < this.argIdents.length) {
            throw new TypeError(`${this.name} expected ${this.argIdents.length} arguments but got ${args.length}`)
        }
        for (let i = 0; i < this.argIdents.length; i++) {
            argRecord[this.argIdents[i]] = args[i]
        }
        if (!this.code) {
            let data = calculateAmountRelativeToInternals(relativeTo, this.codeToks, argRecord).expression
            this.code = data
        }
        let data = this.code.visit(relativeTo, new SymbolTable(argRecord))
        return data[data.length - 1]
    }
    toString() {
        return this.codeToks.reduce((p, c) => p + " " + c.data, "")
    }
}

class ProgramNode extends Program {
    expressions: Exclude<Node, ProgramNode>[]
    constructor(ns: Node[]) {
        super()
        this.expressions = ns
    }

    visit(relativeTo: number, table: SymbolTable): number[] {
        return this.expressions.map(v => v.visit(relativeTo, table)).flat().map(v => Number(v.access()))
    }

    repr(indent: number = 0): string {
        let text = `Program(\n`
        for (let node of this.expressions) {
            text += "\t".repeat(indent + 1)
            text += `${node.repr(indent + 1)}\n`
        }
        text += `${'\t'.repeat(indent)})`
        return text
    }
}

class PipeNode extends Node {
    start: Node
    chain: Node[]
    constructor(start: Node) {
        super()
        this.start = start
        this.chain = []
    }

    addToChain(node: Node) {
        this.chain.push(node)
    }

    visit(relativeTo: number, table: SymbolTable): Type<any> {
        let final: Type<any> = this.start.visit(relativeTo, table);
        for (let node of this.chain) {
            table.set('pipe!', final)
            final = node.visit(relativeTo, table)
        }
        return final
    }

    repr(indent: number): string {
        let text = `Pipechain(\n`;
        for (let node of [this.start, ...this.chain]) {
            text += '\t'.repeat(indent + 1) + node.repr(indent + 1) + "\n"
        }
        text += '\t'.repeat(indent).concat(")")
        return text;
    }
}

class ExpressionNode extends Node {
    node: Node
    constructor(n: Node) {
        super()
        this.node = n
    }

    visit(relativeTo: number, table: SymbolTable): Type<any> {
        return this.node.visit(relativeTo, table)
    }

    repr(indent: number = 0): string {
        return `Expr(
${'\t'.repeat(indent + 1)}${this.node.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class VariableAssignNode extends Node {
    name: Token<TT.ident>
    value: Node
    constructor(name: Token<TT.ident>, value: Node) {
        super()
        this.name = name
        this.value = value
    }

    visit(relativeTo: number, table: SymbolTable): Type<ValidJSTypes> {
        let val = this.value.visit(relativeTo, table)
        table.set(this.name.data, val)
        return val
    }

    repr(indent: number = 0): string {
        return `VarAssign(
${'\t'.repeat(indent + 1)}${this.name.data}
${'\t'.repeat(indent + 1)}=
${'\t'.repeat(indent + 1)}${this.value.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class IfNode extends Node {
    condition: Node
    code: ProgramNode
    elifPrograms: [Node, ProgramNode][]
    elseProgram?: ProgramNode
    constructor(condition: Node, code: ProgramNode, elifPrograms?: [Node, ProgramNode][], elseProgram?: ProgramNode) {
        super()
        this.condition = condition
        this.code = code
        this.elseProgram = elseProgram
        this.elifPrograms = elifPrograms ?? []
    }

    visit(relativeTo: number, table: SymbolTable): Type<any> {
        if (this.condition.visit(relativeTo, table).truthy()) {
            return new NumberType(this.code.visit(relativeTo, table).slice(-1)[0])
        }
        if(this.elifPrograms){
            for(let [check, program] of this.elifPrograms){
                if(check.visit(relativeTo, table).truthy()){
                    return new NumberType(program.visit(relativeTo, table).splice(-1)[0])
                }
            }
        }
        if (this.elseProgram) {
            return new NumberType(this.elseProgram.visit(relativeTo, table).slice(-1)[0])
        }
        return new NumberType(0)
    }

    repr(indent: number): string {
        let text = `IfNode(
${'\t'.repeat(indent + 1)}check(${this.condition.repr(indent + 1)})
${'\t'.repeat(indent + 1)}(
${'\t'.repeat(indent + 2)}${this.code.repr(indent + 2)}
${'\t'.repeat(indent + 1)})\n`
        for(let [_, program] of this.elifPrograms){
            text += `${'\t'.repeat(indent + 1)}Elif(
${'\t'.repeat(indent + 2)}${program.repr(indent + 2)}
${'\t'.repeat(indent + 1)})\n`
        }
        if (this.elseProgram) {
            text += `${'\t'.repeat(indent + 1)}Else(
${'\t'.repeat(indent + 2)}${this.elseProgram.repr(indent + 2)}
${'\t'.repeat(indent + 1)})\n`
        }
        text += '\t'.repeat(indent) + ")"
        return text
    }
}

class FuncCreateNode extends Node {
    name: Token<TT.ident>
    code: Token<TT>[]
    parameterNames: Token<TT.ident>[]
    constructor(name: Token<TT.ident>, parameterNames: Token<TT.ident>[], code: Token<any>[]) {
        super()
        this.name = name
        this.code = code
        this.parameterNames = parameterNames
    }

    visit(relativeTo: number, table: SymbolTable): Type<ValidJSTypes> {
        table.set(this.name.data, new FunctionType(new UserFunction(this.name.data, this.code, this.parameterNames.map(v => v.data))))
        return new NumberType(0)
    }

    repr(indent: number): string {
        return `FunctionCreate(
${'\t'.repeat(indent + 1)}${this.name.data}(${this.parameterNames.map(v => v.data)})
${'\t'.repeat(indent + 1)}(
${'\t'.repeat(indent + 2)}${this.code.reduce((p, c) => p + " " + c.data, "")}
${'\t'.repeat(indent + 1)})
${'\t'.repeat(indent)})`
    }
}

class VarAccessNode extends Node {
    name: Token<TT.ident>
    constructor(name: Token<TT.ident>) {
        super()
        this.name = name
    }

    visit(relativeTo: number, table: SymbolTable): Type<ValidJSTypes> {
        let val = table.get(this.name.data)
        if (typeof val === 'function') {
            return new NumberType(val(relativeTo, this.name.data))
        }
        else if (val instanceof ProgramNode) {
            let data = val.visit(relativeTo, Object.assign({}, table))
            return new NumberType(data[data.length])
        }
        return val ?? new NumberType(0)
    }

    repr(indent: number): string {
        return `VarAccess(${this.name.data})`
    }
}


class StringNode extends Node {
    data: Token<TT.string>

    constructor(n: Token<TT.string>) {
        super()
        this.data = n
    }

    visit(relativeTo: number, table: SymbolTable): StringType {
        return new StringType(this.data.data)
    }

    repr(indent: number): string {
        return `String(${JSON.stringify(this.data.data)})`
    }
}

class NumberNode extends Node {
    data: Token<TT.number>
    constructor(n: Token<TT.number>) {
        super()
        this.data = n
    }
    visit(): NumberType {
        return new NumberType(this.data.data)
    }

    repr() {
        return `Number(${this.data.data})`
    }

}

class RightUnOpNode extends Node {
    left: Node
    operator: Token<TT.percent | TT.hash | TT.number_suffix>
    constructor(left: Node, operator: Token<TT.percent | TT.hash | TT.number_suffix>) {
        super()
        this.left = left
        this.operator = operator
    }
    visit(relativeTo: number, table: SymbolTable): NumberType {
        let number = this.left.visit(relativeTo, table)
        if (!(number instanceof NumberType)) {
            throw new OperatorError(`'${this.operator.data}' expected number, found string`)
        }
        let n = number.access()
        let data: number;
        switch (this.operator.data) {
            case '#': data = relativeTo % n; break;
            case '%': data = (n / 100) * relativeTo; break;
            case 'K': data = n * 1000; break;
            case 'M': data = n * 1_000_000; break;
            case 'B': data = n * 1_000_000_000; break;
            case 'T': data = n * 1_000_000_000_000; break;
        }
        return new NumberType(data)
    }

    repr(indent = 0) {
        let left = this.left.repr(indent + 1);
        let right = `op(${this.operator.data})`;
        return `RightUnOp(
${'\t'.repeat(indent + 1)}${left} ${right}
${'\t'.repeat(indent)})`
    }
}

class LeftUnOpNode extends Node {
    left: Node
    operator: Token<TT.hash | TT.minus>
    constructor(left: Node, operator: Token<TT.hash | TT.minus>) {
        super()
        this.left = left
        this.operator = operator
    }
    visit(relativeTo: number, table: SymbolTable): NumberType {
        let number = this.left.visit(relativeTo, table).access()
        if (typeof number === 'string') {
            throw new OperatorError(`'${this.operator.data}' expected number, found string`)
        }
        switch (this.operator.type) {
            case TT.hash:
                return new NumberType(number - (relativeTo % number))
            case TT.minus:
                return new NumberType(number * -1)
        }
    }

    repr(indent = 0) {
        let right = this.left.repr(indent + 1);
        let left = `op(${this.operator.data})`;
        return `LeftUnOpNode(
${'\t'.repeat(indent + 1)}${left} ${right}
${'\t'.repeat(indent)})`
    }
}

class BinOpNode extends Node {
    left: Node
    operator: Token<TT.mul | TT.div | TT.plus | TT.minus | TT.pow | TT.root | TT.le | TT.ge | TT.lt | TT.gt | TT.eq>
    right: Node
    constructor(left: Node, operator: Token<TT.mul | TT.div | TT.plus | TT.minus | TT.pow | TT.root | TT.le | TT.ge | TT.lt | TT.gt | TT.eq>, right: Node) {
        super()
        this.left = left
        this.operator = operator
        this.right = right
    }
    visit(relativeTo: number, table: SymbolTable): NumberType {
        let left = this.left.visit(relativeTo, table)
        let right = this.right.visit(relativeTo, table)
        if (!(left instanceof NumberType) || !(right instanceof NumberType)) {
            throw new OperatorError(`${this.operator.data} expected 2 numbers, but found ${left.constructor.name.split("Type")[0]} and ${right.constructor.name.split("Type")[0]}`)
        }
        let data;
        switch (this.operator.data) {
            case '+': return left.iadd(right)
            case '-': return left.isub(right)
            case '*': return left.imul(right)
            case '/': return left.idiv(right)
            case '^': data = Math.pow(left.access(), right.access()); break;
            case '^/': data = Math.pow(right.access(), (1 / left.access())); break;
            case '<=': data = Number(left.access() <= right.access()); break;
            case '>=': data = Number(left.access() >= right.access()); break;
            case '>': data = Number(left.access() > right.access()); break;
            case '<': data = Number(left.access() < right.access()); break;
            case '=': data = Number(left.access() === right.access()); break;
        }
        return new NumberType(data)
    }

    repr(indent = 0) {
        return `BinOp(
${'\t'.repeat(indent + 1)}${this.left.repr(indent + 1)}
${'\t'.repeat(indent + 1)}op(${this.operator.data})
${'\t'.repeat(indent + 1)}${this.right.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class FunctionNode extends Node {
    name: Token<TT.ident>
    nodes: Node[]
    constructor(name: Token<TT.ident>, nodes: Node[]) {
        super()
        this.name = name
        this.nodes = nodes
    }
    visit(relativeTo: number, table: SymbolTable): NumberType | StringType {
        let values = this.nodes.map(v => v.visit(relativeTo, table)) ?? [new NumberType(0)]
        let argCount = {
            'rand': 2,
            'needed': 1,
            'ineeded': 1,
            'neg': 1,
            'floor': 1,
            'ceil': 1,
            'round': 1,
            'minmax': 3,
            'aspercent': 1,
            "length": 1,
            "abs": 1,
        }
        if (this.name.data in argCount && values.length < argCount[this.name.data as keyof typeof argCount]) {
            throw new FunctionError(`${this.name.data} expects ${argCount[this.name.data as keyof typeof argCount]} items, but got ${values.length}`)
        }
        switch (this.name.data) {
            case 'min': return new NumberType(min(values.map(v => v.access())) as number)
            case 'max': return new NumberType(max(values.map(v => v.access())) as number)
            case 'rand': return new NumberType(randInt(values[0].access(), values[1].access()))
            case 'choose': return choice(values)
            case 'needed': return new NumberType(values[0].access() - relativeTo)
            case 'ineeded': return new NumberType(relativeTo - (values[0].access()))
            case 'neg': return values[0].mul(new NumberType(-1))
            case 'floor': return new NumberType(Math.floor(values[0].access()))
            case 'ceil': return new NumberType(Math.ceil(values[0].access()))
            case 'round': return new NumberType(Math.round(values[0].access()))
            case 'aspercent': return new NumberType((values[0].access() / relativeTo) * 100)
            case 'length': return new NumberType(String(values[0]).length)
            case 'concat': return new StringType(values.map(v => v.string()).join(""))
            case 'abs': return new NumberType(Math.abs(values[0].access()))
            case 'sum': return function() {
                switch (typeof values[0].access()) {
                    case 'string': return new StringType(values.reduce((p, c) => p + c.access(), ""))
                    case 'number': return new NumberType(values.reduce((p, c) => p + c.access(), 0))
                    default: return new NumberType(0)
                }
            }()
            case 'product': {
                if (typeof values[0].access() === 'number') {
                    return new NumberType(values.reduce((p, c) => p * c.access(), 0))
                }
                return new NumberType(0)
            }
            case 'minmax': {
                let min = values[0].access() ?? 0
                let value = values[1].access() ?? 0
                let max = values[2].access() ?? 0
                if (isBetween(Number(min), Number(value), Number(max))) {
                    return new NumberType(value)
                }
                else if (value > max) {
                    return new NumberType(max)
                }
                return new NumberType(min)

            }
            default: {
                let code = table.get(this.name.data)
                if (!(code instanceof FunctionType)) {
                    break;
                }

                return new NumberType(code.run(relativeTo, values))
            }
        }
        return new NumberType(0)
    }

    repr(indent = 0) {
        return `Function(
${'\t'.repeat(indent + 1)}${this.name.data}(
${'\t'.repeat(indent + 2)}${this.nodes.map(v => v.repr(indent + 2)).join(", ")}
${'\t'.repeat(indent + 1)})
${'\t'.repeat(indent)})`
    }
}

class Parser {
    tokens: Token<TT>[]
    nodes: Node[] = []
    #i = -1
    #curTok: Token<TT> | undefined = undefined

    constructor(tokens: Token<TT>[]) {
        this.tokens = tokens
        this.advance()
    }

    advance() {
        if ((this.#curTok = this.tokens[++this.#i]) === undefined) {
            return false;
        }
        return this.#curTok
    }

    back() {
        if ((this.#curTok = this.tokens[--this.#i]) === undefined) {
            return false;
        }
        return this.#curTok;
    }

    get atEnd() {
        return this.#curTok === undefined
    }

    func() {
        let name = this.#curTok
        //skip name
        this.advance()

        //skip (
        this.advance()
        if (this.#curTok?.type === TT.rparen) {
            this.advance()
            return new FunctionNode(name as Token<TT.ident>, [])
        }
        if (this.#curTok === undefined) {
            throw new SyntaxError(`Expected expression after '${name?.data}('`)
        }
        let nodes = [this.expr()]
        while (this.#curTok?.type === TT.comma) {
            //skip ,
            this.advance()
            nodes.push(this.expr())
        }
        if (this.#curTok === undefined) {
            throw new SyntaxError(`Expected ')' after '${name?.data}(...`)
        }
        //skip )
        this.advance()
        return new FunctionNode(name as Token<TT.ident>, nodes)
    }

    atom(): Node {
        let tok = this.#curTok
        if (tok?.type === TT.number) {
            this.advance()
            return new NumberNode(tok as Token<TT.number>)
        }
        else if (tok?.type === TT.string) {
            this.advance()
            return new StringNode(tok as Token<TT.string>)
        }
        let nameTok = this.#curTok
        if (!nameTok) {
            return new NumberNode(new Token(TT.number, 0))
        }
        this.advance()

        if (this.#curTok?.type === TT.lparen) {
            this.back()
            return this.func()
        }


        if (nameTok.type === TT.ident)
            return new VarAccessNode(nameTok as Token<TT.ident>)
        return new NumberNode(new Token(TT.number, 0))
    }

    factor(): Node {
        let tok = this.#curTok as Token<TT>
        if (tok?.type === TT.lparen) {
            this.advance()
            let node = this.statement()
            this.advance()
            return node
        }
        return this.atom()
    }

    left_unary_op(): Node {
        let node;
        let isOp = false
        while ([TT.hash, TT.minus].includes(this.#curTok?.type as TT)) {
            isOp = true
            let tok = this.#curTok as Token<TT.hash | TT.minus>
            this.advance()
            node = new LeftUnOpNode(this.mutate_expr(), tok)
        }
        if (!isOp) node = this.factor()
        return node as Node
    }

    mutate_expr(): Node {
        let node = this.left_unary_op();
        while ([TT.percent, TT.hash, TT.number_suffix].includes(this.#curTok?.type as TT)) {
            let next = this.#curTok as Token<any>
            this.advance()
            node = new RightUnOpNode(node, next)
        }
        return node
    }

    higher_order_term() {
        let node = this.mutate_expr()
        while (TT.pow === this.#curTok?.type) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.mutate_expr())
        }
        return node
    }

    term(): Node {
        let node = this.higher_order_term()
        while ([TT.mul, TT.div].includes(this.#curTok?.type as TT)) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.higher_order_term())
        }
        return node
    }

    arithmetic(): Node {
        let node = this.term()
        while ([TT.plus, TT.minus].includes(this.#curTok?.type as TT)) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.term())
        }
        return node
    }

    root(): Node {
        let node = this.arithmetic()
        while (this.#curTok?.type === TT.root) {
            let token = this.#curTok as Token<TT.root>
            this.advance()
            node = new BinOpNode(node, token, this.arithmetic())
        }
        return node
    }

    var_assign(): Node {
        this.advance()
        let name = this.#curTok as Token<TT.ident>
        this.advance()
        if (this.#curTok?.type === TT.eq) {
            this.advance()
            return new VariableAssignNode(name, this.comp())
        }
        else if (this.#curTok?.type === TT.lparen) {
            let idents: Token<TT.ident>[] = []

            while (this.advance() && this.#curTok?.type as TT === TT.ident) {
                idents.push(this.#curTok as Token<TT.ident>)
                this.advance()
                if (this.#curTok?.type as TT !== TT.comma) {
                    break;
                }
            }

            if (this.#curTok?.type as TT !== TT.rparen) {
                throw new SyntaxError("Expected ')'")
            }

            this.advance()

            if (this.#curTok?.type as TT !== TT.eq) {
                throw new SyntaxError("Expected '='")
            }

            let code: Token<any>[] = []

            while (this.advance() && (this.#curTok?.type as TT !== TT.keyword && this.#curTok?.data !== 'end')) {
                code.push(this.#curTok)
            }

            this.advance()

            return new FuncCreateNode(name, idents, code)

        }
        throw new SyntaxError(`Expected '=' after ${name.data}`)
    }

    expr(): Node {
        return new ExpressionNode(this.root())
    }

    pipe(): Node {
        let node = this.expr()
        while (this.#curTok?.type === TT.pipe) {
            if (!(node instanceof PipeNode)) {
                node = new PipeNode(node)
            }
            this.advance();
            (node as PipeNode).addToChain(this.expr())
        }
        return node
    }

    comp(): Node {
        let left = this.pipe()
        if ([TT.lt, TT.le, TT.eq, TT.gt, TT.ge].includes(this.#curTok?.type as TT)) {
            let op = this.#curTok as Token<any>
            this.advance()
            left = new BinOpNode(left, op, this.pipe())
        }
        return left
    }

    if_statement() {
        this.advance()
        let comp = this.comp()
        if (this.#curTok?.type !== TT.keyword || this.#curTok?.data !== 'then') {
            throw new SyntaxError("Expected 'then' to start if block")
        }
        this.advance()
        let code = this.program()
        let elseNode
        let elifPrograms: [Node, ProgramNode][] = []
        while(this.#curTok?.type === TT.keyword && (this.#curTok?.data as string) === 'elif'){
            this.advance()
            let check = this.comp()
            if (this.#curTok?.type !== TT.keyword || (this.#curTok?.data as string) !== 'then') {
                throw new SyntaxError("Expected 'then' to start the elif block")
            }
            this.advance()
            let program = this.program()
            elifPrograms.push([check, program])
        }
        if (this.#curTok?.type === TT.keyword && (this.#curTok?.data as string) === 'else') {
            this.advance()
            elseNode = this.program()
        }
        if (this.#curTok?.type !== TT.keyword || (this.#curTok?.data as string) !== 'end') {
            throw new SyntaxError("Expected 'end' to end if block")
        }
        this.advance()
        return new IfNode(comp, code, elifPrograms, elseNode)
    }

    statement() {
        if (this.#curTok?.type === TT.keyword) {
            if (this.#curTok.data === 'var')
                return this.var_assign()
            else if (this.#curTok.data === 'if') {
                return this.if_statement()
            }
        }
        return this.comp()
    }

    program(): ProgramNode {
        let nodeArr = [this.statement()]
        while (this.#curTok?.type === TT.semi) {
            this.advance()
            nodeArr.push(this.statement())
        }
        return new ProgramNode(nodeArr)
    }

    parse(): ProgramNode {
        return this.program()
    }
}

class Interpreter {
    program: ProgramNode
    relativeTo: number
    symbolTable: SymbolTable
    constructor(program: ProgramNode, relativeTo: number, baseEnv: Record<string, (total: number, k: string) => number>) {
        this.program = program
        this.relativeTo = relativeTo
        this.symbolTable = new SymbolTable(baseEnv)
    }
    visit(): number[] {
        return this.program.visit(this.relativeTo, this.symbolTable)
    }
}

function calculateAmountRelativeToInternals(money: number, amount: string | Token<any>[], extras?: Record<string, (total: number, k: string) => number>) {
    let tokens, lexer;
    if (typeof amount !== 'object') {
        let lexer = new Lexer(amount, Object.keys(extras ?? {}))
        lexer.tokenize()

        tokens = lexer.tokens
    }
    else tokens = amount
    let parser = new Parser(tokens)
    let expression = parser.parse()
    let env = {
        'all': (total: number) => total * .99,
        'all!': (total: number) => total,
        'infinity': () => Infinity,
        ...(extras ?? {})
    }
    const int = new Interpreter(expression, money, env)
    return { lexer, parser, interpreter: int, expression }
}

function calculateAmountRelativeTo(money: number, amount: string, extras?: Record<string, (total: number, k: string) => number>): number {
    return calculateAmountRelativeToInternals(money, amount, extras).interpreter.visit().slice(-1)[0]
}

function runRelativeCalculator(relativeTo: number, amount: string, extras?: Record<string, (total: number, k: string) => number>): number[] {
    return calculateAmountRelativeToInternals(relativeTo, amount, extras).interpreter.visit()
}

export default {
    calculateAmountRelativeTo,
    calculateAmountRelativeToInternals,
    runRelativeCalculator
}
