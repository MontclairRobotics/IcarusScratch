const Cast = require('../../util/cast')
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Timer = require('../../util/timer')
const {Vec2d, VirtualThread, trapezoidEvolve} = require('../helpers');

class AdvancedExtension
{
    constructor(runtime)
    {
        /**
         * The runtime object
         * @type {Runtime}
         */
        this.runtime = runtime
    }

    getInfo() 
    {
        return {
            id: "advanced",
            name: "Advanced",

            color1: "#90D040",
            color2: "#50A020",

            blocks: [
                {
                    opcode: "ternary",
                    blockType: BlockType.REPORTER,
                    text: "if [CONDITION] then [TRUE] else [FALSE]",
                    arguments: {
                        CONDITION: {
                            type: ArgumentType.BOOLEAN,
                            defaultValue: false
                        },
                        TRUE: {
                            type: ArgumentType.STRING,
                            defaultValue: " "
                        },
                        FALSE: {
                            type: ArgumentType.STRING,
                            defaultValue: " "
                        }
                    }
                },
                {
                    opcode: 'tripleif',
                    blockType: BlockType.CONDITIONAL,
                    text: [
                        "if [COND1] then",
                        "elif [COND2] then",
                        "else"
                    ],
                    branchCount: 3,
                    arguments: {
                        COND1: {
                            type: ArgumentType.BOOLEAN,
                            defaultValue: false
                        },
                        COND2: {
                            type: ArgumentType.BOOLEAN,
                            defaultValue: false
                        }
                    }
                },
                {
                    opcode: 'passthrough',
                    blockType: BlockType.CONDITIONAL,
                    text: 'in order',
                    branchCount: 1
                },
                {
                    opcode: 'parallel',
                    blockType: BlockType.CONDITIONAL,
                    text: 'together',
                    branchCount: 1
                },
                {
                    opcode: 'untilTimeout',
                    blockType: BlockType.CONDITIONAL,
                    text: 'stop after [SECS] seconds',
                    branchCount: 1,
                    arguments: {
                        SECS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'untilSCondition',
                    blockType: BlockType.CONDITIONAL,
                    text: 'stop if [COND]',
                    branchCount: 1,
                    arguments: {
                        COND: {
                            type: ArgumentType.BOOLEAN
                        }
                    }
                },
                {
                    opcode: 'untilCode',
                    blockType: BlockType.CONDITIONAL,
                    text: [
                        'stop',
                        'after'
                    ],
                    branchCount: 2
                },
                '---',
                {
                    opcode: 'moveRelX',
                    blockType: BlockType.COMMAND,
                    text: 'move x relative by [X]',
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'moveRelY',
                    blockType: BlockType.COMMAND,
                    text: 'move y relative by [Y]',
                    arguments: {
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'moveRel',
                    blockType: BlockType.COMMAND,
                    text: 'move relative by x: [X] y: [Y]',
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                '---',
                {
                    opcode: 'pow',
                    blockType: BlockType.REPORTER,
                    text: '[X] ^ [Y]',
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                }
            ]
        }
    }

    pow({X, Y}) 
    {
        let result = Math.pow(Cast.toNumber(X), Cast.toNumber(Y))
        if(Number.isNaN(result)) return 'not a number'
        return result
    }

    /**
     * @param {BlockUtility} util 
     */
    tripleif({COND1, COND2}, util)
    {
        let branch = 3
        if(Cast.toBoolean(COND1)) branch = 1
        else if(Cast.toBoolean(COND2)) branch = 2

        util.startBranch(branch, false)
    }

    ternary({CONDITION, TRUE, FALSE})
    {
        if(Cast.toBoolean(CONDITION)) return TRUE
        return FALSE
    }

    /**
     * Run the blocks inside this one in sequence.
     * @param {BlockUtility} util 
     */
    passthrough({}, util)
    {
        util.startBranch(1, false)
    }



    /**
     * Run the blocks encombassed within this block in parallel
     * @param {BlockUtility} util 
     */
    parallel({}, util)
    {
        if(typeof util.stackFrame.parallelThreads === 'undefined')
        {
            // Define parallel threads
            let parallelThreads = []

            let next = util.getBranch(1)

            // Iterate over inner blocks
            while (next !== null)
            {
                // Push to stored threads
                parallelThreads.push(new VirtualThread(util, VirtualThread.MODE_ONE_BLOCK, next))
                next = util.target.blocks.getNextBlock(next)
            }

            // Store for next frame
            util.stackFrame.parallelThreads = parallelThreads

            // Yield
            util.yield()
        }
        else 
        {
            /**
             * @type {VirtualThread[]}
             */
            let parallelThreads = util.stackFrame.parallelThreads

            // Keep track of if every item is finished
            let ended = true

            // Iterate each parallel thread
            for (const thread of parallelThreads) 
            {
                thread.step(util)

                if(!thread.completed)
                {
                    ended = false
                }
            }

            // Clean up if ended, otherwise yield
            if(ended)
            {
                util.stackFrame.parallelThreads = undefined
            }
            else 
            {
                util.yield()
            }
        }
    }

    /**
     * @param {BlockUtility} util 
     */
    untilTimeout({SECS}, util)
    {
        this.untilCondition(
            () => util.stackFrame.timeouttimer.timeElapsed() / 1000 > Cast.toNumber(SECS),
            util,

            function() {
                util.stackFrame.timeouttimer = new Timer(util.nowObj)
                util.stackFrame.timeouttimer.start()
            },
            () => util.stackFrame.timeouttimer = undefined
        )
    }
    /**
     * @param {BlockUtility} util 
     */
    untilSCondition({COND}, util)
    {
        this.untilCondition(
            () => Cast.toBoolean(COND),
            util
        )
    }
    /**
     * @param {BlockUtility} baseutil 
     */
    untilCode({}, baseutil)
    {
        this.untilCondition(
            util => {
                // edge case: empty contents
                if(util.stackFrame.noConditionCode)
                {
                    return false
                }

                // console.log(util.thread.peekStackFrame().executionContext)

                util.stackFrame.untilCodeThread.step(util)
                return util.stackFrame.untilCodeThread.completed
            },
            baseutil,

            util => {
                let branch = util.getBranch(2)

                if(branch) util.stackFrame.untilCodeThread = new VirtualThread(util, VirtualThread.MODE_THIS_LEVEL, branch)
                else       util.stackFrame.noConditionCode = true
            },
            util => {
                util.stackFrame.untilCodeThread = undefined
                util.stackFrame.noConditionCode = undefined
            }
        )
    }

    /**
     * @param {?(BlockUtility) => void} init
     * @param {(BlockUtility) => boolean} cond
     * @param {?(BlockUtility) => void} end
     * @param {BlockUtility} util 
     */
    untilCondition(cond, util, init, end)
    {
        if(init === null) init = _ => {}
        if(end  === null) end  = _ => {}

        // edge case: empty branch
        if(!util.getBranch(1)) return

        if(typeof util.stackFrame.isUntilCondition === 'undefined')
        {
            util.stackFrame.isUntilCondition = true
            init(util)

            let next = util.getBranch(1)
            util.stackFrame.untilConditionThread = new VirtualThread(util, VirtualThread.MODE_THIS_LEVEL, next)

            util.yield()
        }
        else 
        {
            /**
             * @type {VirtualThread}
             */
            let thread = util.stackFrame.untilConditionThread

            thread.step(util)
            
            // if(new Date().getTime() % 50 === 0) console.log(thread._thread.stackFrames.map(x => Object.assign({}, x.executionContext)))

            if(thread.completed || cond(util))
            {
                // console.log('ATTEMPTING TO END COMMAND')

                end(util)

                util.stackFrame.isUntilCondition = undefined
                util.stackFrame.untilConditionThread = undefined
            }
            else 
            {
                util.yield()
            }
        }

        // console.log(util.thread)
        // console.log(util.thread.status)
    }

    moveRel({X, Y}, util)
    {
        let d = new Vec2d(Cast.toNumber(X), Cast.toNumber(Y))
        d = d.rot(90 - util.target.direction)

        const p = new Vec2d(util.target.x, util.target.y).add(d)

        util.target.setXY(p.x, p.y);
    }
    moveRelX({X}, util)
    {
        this.moveRel({X: X, Y: 0}, util)
    }
    moveRelY({Y}, util)
    {
        this.moveRel({X: 0, Y: Y}, util)
    }
}

module.exports = AdvancedExtension